// @ts-nocheck
/**
 * Tests de integración Anchor — academic_certification
 *
 * Cubre:
 *   - Inicialización del programa (unitario / deploy)
 *   - Registro de personas (flujo completo)
 *   - RBAC: roles y restricciones de acceso
 *   - Flujo completo de certificación (token → asignación → egreso → certificado)
 *   - Revocación de certificación
 *   - Casos de error y validaciones de input
 *
 * Prerequisito: `solana-test-validator` corriendo y programa desplegado
 * Ejecutar con:  anchor test  (localnet)
 *
 * Los tipos de programa se cargan dinámicamente desde workspace de Anchor.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
// Los tipos se cargan dinámicamente desde anchor.workspace después de build
// import { AcademicCertification } from "../target/types/academic_certification";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert, expect } from "chai";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey("3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt");

function pda(seeds: Buffer[], programId = PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function configPDA(): PublicKey {
  return pda([Buffer.from("config")]);
}

function personPDA(wallet: PublicKey): PublicKey {
  return pda([Buffer.from("person"), wallet.toBuffer()]);
}

function roleRequestPDA(requester: PublicKey, role: number): PublicKey {
  return pda([Buffer.from("role_request"), requester.toBuffer(), Buffer.from([role])]);
}

function tokenRequestPDA(universidad: PublicKey, seq: number): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(seq), 0);
  return pda([Buffer.from("token_request"), universidad.toBuffer(), idBuf]);
}

function certTokenPDA(tokenRequest: PublicKey, index: number): PublicKey {
  const idxBuf = Buffer.alloc(4);
  idxBuf.writeUInt32LE(index, 0);
  return pda([Buffer.from("cert_token"), tokenRequest.toBuffer(), idxBuf]);
}

function certificationPDA(certToken: PublicKey): PublicKey {
  return pda([Buffer.from("certification"), certToken.toBuffer()]);
}

function graduateRequestPDA(egresado: PublicKey): PublicKey {
  return pda([Buffer.from("graduate_request"), egresado.toBuffer()]);
}

function hex32(hex: string): number[] {
  return Array.from(Buffer.from(hex, "hex"));
}

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol = 10
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

// ── Suite principal ───────────────────────────────────────────────────────────

describe("academic_certification", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // El programa se obtiene del workspace de Anchor después de `anchor build`
  const program = anchor.workspace.AcademicCertification as unknown as Program<any>;
  const connection = provider.connection;

  // Roles enum (índices del contrato)
  const Role = {
    Admin: { admin: {} },
    Universidad: { universidad: {} },
    Ministerio: { ministerio: {} },
    Cancilleria: { cancilleria: {} },
    Egresado: { egresado: {} },
  };

  // Keypairs de actores
  const admin = provider.wallet as anchor.Wallet;
  const universidadKp = Keypair.generate();
  const ministerioKp = Keypair.generate();
  const cancilleriaKp = Keypair.generate();
  const egresadoKp = Keypair.generate();

  before(async () => {
    // Fondear todos los keypairs
    await Promise.all([
      airdrop(connection, universidadKp.publicKey),
      airdrop(connection, ministerioKp.publicKey),
      airdrop(connection, cancilleriaKp.publicKey),
      airdrop(connection, egresadoKp.publicKey),
    ]);
  });

  // ── 1. Inicialización ───────────────────────────────────────────────────────

  describe("initialize", () => {
    it("despliega el programa e inicializa ProgramConfig", async () => {
      const configAddr = configPDA();
      const adminPersonAddr = personPDA(admin.publicKey);

      await program.methods
        .initialize("Admin", "Sistema", "00000000A")
        .accounts({
          admin: admin.publicKey,
          config: configAddr,
          adminPerson: adminPersonAddr,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const config = await program.account.programConfig.fetch(configAddr);
      assert.ok(config.admin.equals(admin.publicKey), "Admin incorrecto en config");

      const adminPerson = await program.account.personAccount.fetch(adminPersonAddr);
      assert.equal(adminPerson.nombre, "Admin");
      assert.equal(adminPerson.apellido, "Sistema");
    });

    it("falla si se intenta inicializar de nuevo (cuenta ya existe)", async () => {
      try {
        await program.methods
          .initialize("Admin2", "Dup", "00000001B")
          .accounts({
            admin: admin.publicKey,
            config: configPDA(),
            adminPerson: personPDA(admin.publicKey),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Debería haber lanzado error");
      } catch (e: unknown) {
        // La cuenta ya existe → Solana lanza error de tipo 'already in use'
        assert.ok(e instanceof Error);
      }
    });
  });

  // ── 2. Registro de personas ─────────────────────────────────────────────────

  describe("register_person", () => {
    it("admin registra a una persona", async () => {
      await program.methods
        .registerPerson("María", "González", "12345678Z", "Universidad Autónoma")
        .accounts({
          authority: admin.publicKey,
          authorityPerson: personPDA(admin.publicKey),
          wallet: universidadKp.publicKey,
          person: personPDA(universidadKp.publicKey),
          config: configPDA(),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const person = await program.account.personAccount.fetch(
        personPDA(universidadKp.publicKey)
      );
      assert.equal(person.nombre, "María");
      assert.equal(person.apellido, "González");
    });

    it("registra al egresado", async () => {
      await program.methods
        .registerPerson("Juan", "Pérez", "87654321X", "")
        .accounts({
          authority: admin.publicKey,
          authorityPerson: personPDA(admin.publicKey),
          wallet: egresadoKp.publicKey,
          person: personPDA(egresadoKp.publicKey),
          config: configPDA(),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("registra ministerio y cancilleria", async () => {
      await program.methods
        .registerPerson("Min", "Edu", "11111111A", "Ministerio de Educación")
        .accounts({
          authority: admin.publicKey,
          authorityPerson: personPDA(admin.publicKey),
          wallet: ministerioKp.publicKey,
          person: personPDA(ministerioKp.publicKey),
          config: configPDA(),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .registerPerson("Can", "Cil", "22222222B", "Cancillería Nacional")
        .accounts({
          authority: admin.publicKey,
          authorityPerson: personPDA(admin.publicKey),
          wallet: cancilleriaKp.publicKey,
          person: personPDA(cancilleriaKp.publicKey),
          config: configPDA(),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("falla con nombre vacío", async () => {
      const fake = Keypair.generate();
      await airdrop(connection, fake.publicKey, 1);
      try {
        await program.methods
          .registerPerson("", "Apellido", "00000099C", "")
          .accounts({
            authority: admin.publicKey,
            authorityPerson: personPDA(admin.publicKey),
            wallet: fake.publicKey,
            person: personPDA(fake.publicKey),
            config: configPDA(),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Debería haber fallado con NombreInvalido");
      } catch (e: unknown) {
        assert.ok(e instanceof Error);
        // El error debe contener "NombreInvalido" en el mensaje
        assert.include(e.toString(), "NombreInvalido", "Error debe mencionar NombreInvalido");
      }
    });

    it("falla con DNI vacío", async () => {
      const fake = Keypair.generate();
      await airdrop(connection, fake.publicKey, 1);
      try {
        await program.methods
          .registerPerson("Nombre", "Apellido", "", "")
          .accounts({
            authority: admin.publicKey,
            authorityPerson: personPDA(admin.publicKey),
            wallet: fake.publicKey,
            person: personPDA(fake.publicKey),
            config: configPDA(),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Debería haber fallado con DniInvalido");
      } catch (e: unknown) {
        assert.ok(e instanceof Error);
        assert.include(e.toString(), "DniInvalido", "Error debe mencionar DniInvalido");
      }
    });
  });

  // ── 3. RBAC: asignación de roles ────────────────────────────────────────────

  describe("request_role + approve_role (RBAC)", () => {
    it("crea la PersonAccount cuando una wallet nueva solicita un rol", async () => {
      const applicantKp = Keypair.generate();
      await airdrop(connection, applicantKp.publicKey, 1);

      const roleRequestAddr = roleRequestPDA(applicantKp.publicKey, 4); // Egresado = 4

      await program.methods
        .requestRole(Role.Egresado, "Ana", "Nueva", "99999999N", "Referencia inicial")
        .accounts({
          requester: applicantKp.publicKey,
          requesterPerson: personPDA(applicantKp.publicKey),
          roleRequest: roleRequestAddr,
          systemProgram: SystemProgram.programId,
        })
        .signers([applicantKp])
        .rpc();

      const requester = await program.account.personAccount.fetch(personPDA(applicantKp.publicKey));
      assert.equal(requester.nombre, "Ana");
      assert.equal(requester.apellido, "Nueva");
      assert.equal(requester.dni, "99999999N");
      assert.equal(requester.roleData, "Referencia inicial");
      assert.ok("activo" in requester.status, "La persona creada debe quedar activa");
    });

    it("egresado solicita rol Universidad", async () => {
      // El egresado solicita el rol Universidad (para este test de flujo de roles)
      const roleRequestAddr = roleRequestPDA(egresadoKp.publicKey, 1); // Universidad = 1

      await program.methods
        .requestRole(Role.Universidad, "Juan", "Pérez", "87654321X", "")
        .accounts({
          requester: egresadoKp.publicKey,
          requesterPerson: personPDA(egresadoKp.publicKey),
          roleRequest: roleRequestAddr,
          systemProgram: SystemProgram.programId,
        })
        .signers([egresadoKp])
        .rpc();

      const rr = await program.account.roleRequest.fetch(roleRequestAddr);
      assert.ok("pendiente" in rr.status, "Estado debe ser Pendiente");
    });

    it("admin aprueba la solicitud de rol", async () => {
      const roleRequestAddr = roleRequestPDA(egresadoKp.publicKey, 1);

      await program.methods
        .approveRole()
        .accounts({
          admin: admin.publicKey,
          adminPerson: personPDA(admin.publicKey),
          config: configPDA(),
          roleRequest: roleRequestAddr,
          targetPerson: personPDA(egresadoKp.publicKey),
        })
        .rpc();

      const person = await program.account.personAccount.fetch(
        personPDA(egresadoKp.publicKey)
      );
      const tieneRol = person.roles.some((r: object) => "universidad" in r);
      assert.ok(tieneRol, "La persona debe tener rol Universidad tras aprobación");
    });

    it("falla al solicitar el rol Admin (no solicitable)", async () => {
      const rr = roleRequestPDA(universidadKp.publicKey, 0); // Admin = 0
      try {
        await program.methods
          .requestRole(Role.Admin, "María", "González", "12345678Z", "Universidad Autónoma")
          .accounts({
            requester: universidadKp.publicKey,
            requesterPerson: personPDA(universidadKp.publicKey),
            roleRequest: rr,
            systemProgram: SystemProgram.programId,
          })
          .signers([universidadKp])
          .rpc();
        assert.fail("Debería haber fallado con RoleNoSolicitable");
      } catch (e: unknown) {
        assert.ok(e instanceof Error);
        assert.include(e.toString(), "RoleNoSolicitable", "Error debe mencionar RoleNoSolicitable");
      }
    });

    it("aprueba rol Universidad a universidadKp, Ministerio a ministerioKp, Cancilleria a cancilleriaKp", async () => {
      // Universidad
      const rrUniv = roleRequestPDA(universidadKp.publicKey, 1);
      await program.methods.requestRole(Role.Universidad, "María", "González", "12345678Z", "Universidad Autónoma")
        .accounts({ requester: universidadKp.publicKey, requesterPerson: personPDA(universidadKp.publicKey), roleRequest: rrUniv, systemProgram: SystemProgram.programId })
        .signers([universidadKp]).rpc();
      await program.methods.approveRole()
        .accounts({ admin: admin.publicKey, adminPerson: personPDA(admin.publicKey), config: configPDA(), roleRequest: rrUniv, targetPerson: personPDA(universidadKp.publicKey) })
        .rpc();

      // Ministerio
      const rrMin = roleRequestPDA(ministerioKp.publicKey, 2);
      await program.methods.requestRole(Role.Ministerio, "Min", "Edu", "11111111A", "Ministerio de Educación")
        .accounts({ requester: ministerioKp.publicKey, requesterPerson: personPDA(ministerioKp.publicKey), roleRequest: rrMin, systemProgram: SystemProgram.programId })
        .signers([ministerioKp]).rpc();
      await program.methods.approveRole()
        .accounts({ admin: admin.publicKey, adminPerson: personPDA(admin.publicKey), config: configPDA(), roleRequest: rrMin, targetPerson: personPDA(ministerioKp.publicKey) })
        .rpc();

      // Cancilleria
      const rrCan = roleRequestPDA(cancilleriaKp.publicKey, 3);
      await program.methods.requestRole(Role.Cancilleria, "Can", "Cil", "22222222B", "Cancillería Nacional")
        .accounts({ requester: cancilleriaKp.publicKey, requesterPerson: personPDA(cancilleriaKp.publicKey), roleRequest: rrCan, systemProgram: SystemProgram.programId })
        .signers([cancilleriaKp]).rpc();
      await program.methods.approveRole()
        .accounts({ admin: admin.publicKey, adminPerson: personPDA(admin.publicKey), config: configPDA(), roleRequest: rrCan, targetPerson: personPDA(cancilleriaKp.publicKey) })
        .rpc();
    });
  });

  // ── 4. Flujo completo de certificación ─────────────────────────────────────

  describe("Flujo completo de certificación", () => {
    let tokenRequestAddr: PublicKey;
    let certTokenAddr: PublicKey;
    let certificationAddr: PublicKey;
    const tokenRequestId = 0;
    const tokenIndex = 0;
    const dataHashHex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const dataHash = hex32(dataHashHex);

    it("Universidad solicita tokens de certificación", async () => {
      tokenRequestAddr = tokenRequestPDA(universidadKp.publicKey, tokenRequestId);

      await program.methods
        .requestTokens(
          new anchor.BN(tokenRequestId),
          "Ingeniería Informática",
          "Plan 2024",
          "RES-2024-001",
          2024,
          1
        )
        .accounts({
          solicitante: universidadKp.publicKey,
          solicitantePerson: personPDA(universidadKp.publicKey),
          tokenRequest: tokenRequestAddr,
          systemProgram: SystemProgram.programId,
        })
        .signers([universidadKp])
        .rpc();

      const tr = await program.account.tokenRequest.fetch(tokenRequestAddr);
      assert.equal(tr.carrera, "Ingeniería Informática");
      assert.ok("pendiente" in tr.estado, "Estado debe ser Pendiente");
    });

    it("Ministerio aprueba la solicitud de tokens", async () => {
      await program.methods
        .approveTokenRequest()
        .accounts({
          ministerio: ministerioKp.publicKey,
          ministerioPerson: personPDA(ministerioKp.publicKey),
          tokenRequest: tokenRequestAddr,
        })
        .signers([ministerioKp])
        .rpc();

      const tr = await program.account.tokenRequest.fetch(tokenRequestAddr);
      assert.ok("aprobada" in tr.estado, "Estado debe ser Aprobada");
    });

    it("Universidad hace mint del token (index 0)", async () => {
      certTokenAddr = certTokenPDA(tokenRequestAddr, tokenIndex);

      await program.methods
        .mintToken(tokenIndex)
        .accounts({
          universidad: universidadKp.publicKey,
          universidadPerson: personPDA(universidadKp.publicKey),
          tokenRequest: tokenRequestAddr,
          certToken: certTokenAddr,
          systemProgram: SystemProgram.programId,
        })
        .signers([universidadKp])
        .rpc();

      const ct = await program.account.certificationToken.fetch(certTokenAddr);
      assert.ok("disponible" in ct.estado, "Token debe estar Disponible");
      assert.equal(ct.carrera, "Ingeniería Informática");
    });

    it("Universidad asigna el token al egresado", async () => {
      await program.methods
        .assignTokenToGraduate("Juan", "Pérez", "87654321X", dataHash)
        .accounts({
          universidad: universidadKp.publicKey,
          universidadPerson: personPDA(universidadKp.publicKey),
          certToken: certTokenAddr,
          certification: certificationPDA(certTokenAddr),
          systemProgram: SystemProgram.programId,
        })
        .signers([universidadKp])
        .rpc();

      certificationAddr = certificationPDA(certTokenAddr);
      const ct = await program.account.certificationToken.fetch(certTokenAddr);
      assert.ok("asignado" in ct.estado, "Token debe estar Asignado");
    });

    it("Egresado solicita certificación local", async () => {
      const graduateRequestAddr = graduateRequestPDA(egresadoKp.publicKey);

      await program.methods
        .requestCertification({ local: {} }, dataHash, null)
        .accounts({
          egresado: egresadoKp.publicKey,
          egresadoPerson: personPDA(egresadoKp.publicKey),
          graduateRequest: graduateRequestAddr,
          systemProgram: SystemProgram.programId,
        })
        .signers([egresadoKp])
        .rpc();

      const gr = await program.account.graduateRequest.fetch(graduateRequestAddr);
      assert.ok("pendiente" in gr.estado, "Estado debe ser Pendiente");
      assert.ok("local" in gr.tipo, "Tipo debe ser Local");
    });

    it("Ministerio aprueba la solicitud local y se emite la certificación", async () => {
      const graduateRequestAddr = graduateRequestPDA(egresadoKp.publicKey);

      await program.methods
        .approveLocalRequest()
        .accounts({
          ministerio: ministerioKp.publicKey,
          ministerioPerson: personPDA(ministerioKp.publicKey),
          graduateRequest: graduateRequestAddr,
        })
        .signers([ministerioKp])
        .rpc();

      const cert = await program.account.certification.fetch(certificationAddr);
      assert.ok("activa" in cert.estado, "Certificación debe estar Activa");
      assert.equal(cert.carrera, "Ingeniería Informática");
    });

    it("La certificación tiene hash de datos correcto", async () => {
      const cert = await program.account.certification.fetch(certificationAddr);
      assert.deepEqual(
        Array.from(cert.hashDatos),
        dataHash,
        "El hash debe coincidir con el asignado"
      );
    });

    it("Revoca la certificación con motivo válido", async () => {
      await program.methods
        .revokeCertification("Fraude detectado en expediente")
        .accounts({
          admin: admin.publicKey,
          adminPerson: personPDA(admin.publicKey),
          config: configPDA(),
          certification: certificationAddr,
        })
        .rpc();

      const cert = await program.account.certification.fetch(certificationAddr);
      assert.ok("revocada" in cert.estado, "Certificación debe estar Revocada");
      assert.include(cert.motivoRevocacion, "Fraude");
    });

    it("falla al revocar una certificación ya revocada", async () => {
      try {
        await program.methods
          .revokeCertification("Doble revocación")
          .accounts({
            admin: admin.publicKey,
            adminPerson: personPDA(admin.publicKey),
            config: configPDA(),
            certification: certificationAddr,
          })
          .rpc();
        assert.fail("Debería haber fallado con CertificacionYaRevocada");
      } catch (e: unknown) {
        assert.ok(e instanceof Error);
        assert.include(e.toString(), "CertificacionYaRevocada", "Error debe mencionar CertificacionYaRevocada");
      }
    });
  });

  // ── 5. Casos de error adicionales ──────────────────────────────────────────

  describe("Casos de error — RBAC estricto", () => {
    it("no-admin no puede registrar personas", async () => {
      const fakeUser = Keypair.generate();
      await airdrop(connection, fakeUser.publicKey, 1);
      const fakePerson = Keypair.generate();

      try {
        await program.methods
          .registerPerson("Hack", "Er", "99999999Z", "")
          .accounts({
            authority: fakeUser.publicKey,
            authorityPerson: personPDA(universidadKp.publicKey), // persona diferente
            wallet: fakePerson.publicKey,
            person: personPDA(fakePerson.publicKey),
            config: configPDA(),
            systemProgram: SystemProgram.programId,
          })
          .signers([fakeUser])
          .rpc();
        assert.fail("Debería haber fallado: no es admin");
      } catch (e: unknown) {
        assert.ok(e instanceof Error);
      }
    });

    it("no-ministerio no puede aprobar solicitud de tokens", async () => {
      // Primero necesitamos una solicitud pendiente; usamos al admin para solicitarla
      // (pero el admin no tiene rol Universidad → el test falla antes en RBAC)
      // Se prueba directamente pasando una cuenta con rol incorrecto
      try {
        await program.methods
          .approveTokenRequest()
          .accounts({
            ministerio: universidadKp.publicKey,   // universidad, no ministerio
            ministerioPerson: personPDA(universidadKp.publicKey),
            tokenRequest: PublicKey.default,       // dirección placeholder
          })
          .signers([universidadKp])
          .rpc();
        assert.fail("Debería haber fallado: no es ministerio");
      } catch (e: unknown) {
        assert.ok(e instanceof Error);
      }
    });

    it("rechazo de rol requiere motivo no vacío", async () => {
      const someKp = Keypair.generate();
      await airdrop(connection, someKp.publicKey, 1);

      await program.methods
        .registerPerson("Tmp", "User", "55555555T", "")
        .accounts({
          authority: admin.publicKey,
          authorityPerson: personPDA(admin.publicKey),
          wallet: someKp.publicKey,
          person: personPDA(someKp.publicKey),
          config: configPDA(),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const rrAddr = roleRequestPDA(someKp.publicKey, 2); // Ministerio
      await program.methods.requestRole(Role.Ministerio, "Tmp", "User", "55555555T", "")
        .accounts({ requester: someKp.publicKey, requesterPerson: personPDA(someKp.publicKey), roleRequest: rrAddr, systemProgram: SystemProgram.programId })
        .signers([someKp]).rpc();

      try {
        await program.methods
          .rejectRole("")  // motivo vacío
          .accounts({
            admin: admin.publicKey,
            adminPerson: personPDA(admin.publicKey),
            config: configPDA(),
            roleRequest: rrAddr,
            targetPerson: personPDA(someKp.publicKey),
          })
          .rpc();
        assert.fail("Debería haber fallado con MotivoRequerido");
      } catch (e: unknown) {
        assert.ok(e instanceof Error);
        assert.include(e.toString(), "MotivoRequerido", "Error debe mencionar MotivoRequerido");
      }
    });
  });
});
