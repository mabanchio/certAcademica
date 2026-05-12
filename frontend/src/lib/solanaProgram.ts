"use client";

import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

export type RequestableRole = "Universidad" | "Ministerio" | "Cancilleria" | "Egresado";
export type EditableRole = "Universidad" | "Ministerio" | "Cancilleria" | "Egresado";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt"
);

const ROLE_INDEX: Record<RequestableRole, number> = {
  Universidad: 1,
  Ministerio: 2,
  Cancilleria: 3,
  Egresado: 4,
};

const ROLE_ENUM: Record<RequestableRole, { [k: string]: Record<string, never> }> = {
  Universidad: { universidad: {} },
  Ministerio: { ministerio: {} },
  Cancilleria: { cancilleria: {} },
  Egresado: { egresado: {} },
};

const PERSON_ACCOUNT_DISCRIMINATOR = Uint8Array.from([100, 58, 145, 196, 142, 24, 243, 243]);

const IDL_MIN = {
  address: PROGRAM_ID.toBase58(),
  metadata: {
    name: "academic_certification",
    version: "0.1.0",
    spec: "0.1.0",
    description: "IDL minimo para request/approve role y set_status",
  },
  instructions: [
    {
      name: "initialize",
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
      accounts: [
        { name: "config", writable: true },
        { name: "admin_person", writable: true },
        { name: "admin", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "nombre", type: "string" },
        { name: "apellido", type: "string" },
        { name: "dni", type: "string" },
      ],
    },
    {
      name: "register_person",
      discriminator: [48, 79, 41, 20, 76, 35, 150, 74],
      accounts: [
        { name: "config" },
        { name: "authority_person" },
        { name: "person", writable: true },
        { name: "wallet" },
        { name: "authority", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "nombre", type: "string" },
        { name: "apellido", type: "string" },
        { name: "dni", type: "string" },
        { name: "role_data", type: "string" },
      ],
    },
    {
      name: "request_role",
      discriminator: [93, 225, 205, 233, 42, 66, 123, 138],
      accounts: [
        { name: "requester_person", writable: true },
        { name: "role_request", writable: true },
        { name: "requester", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "requested_role", type: { defined: { name: "Role" } } },
        { name: "nombre", type: "string" },
        { name: "apellido", type: "string" },
        { name: "dni", type: "string" },
        { name: "role_data", type: "string" },
      ],
    },
    {
      name: "reject_role",
      discriminator: [31, 246, 243, 158, 83, 3, 238, 59],
      accounts: [
        { name: "config" },
        { name: "admin_person" },
        { name: "admin", writable: true, signer: true },
        { name: "role_request", writable: true },
        { name: "target_person", writable: true },
      ],
      args: [
        { name: "motivo", type: "string" },
      ],
    },
    {
      name: "approve_role",
      discriminator: [224, 230, 48, 224, 93, 237, 152, 75],
      accounts: [
        { name: "config" },
        { name: "admin_person" },
        { name: "admin", writable: true, signer: true },
        { name: "role_request", writable: true },
        { name: "target_person", writable: true },
      ],
      args: [],
    },
    {
      name: "set_status",
      discriminator: [181, 184, 224, 203, 193, 29, 177, 224],
      accounts: [
        { name: "config" },
        { name: "admin_person" },
        { name: "admin", writable: true, signer: true },
        { name: "target_person", writable: true },
      ],
      args: [
        { name: "status", type: { defined: { name: "PersonStatus" } } },
        { name: "motivo", type: "string" },
      ],
    },
    {
      name: "update_person_admin",
      discriminator: [118, 190, 235, 3, 26, 243, 233, 137],
      accounts: [
        { name: "config" },
        { name: "admin_person" },
        { name: "admin", writable: true, signer: true },
        { name: "target_person", writable: true },
      ],
      args: [
        { name: "nombre", type: "string" },
        { name: "apellido", type: "string" },
        { name: "dni", type: "string" },
        { name: "status", type: { defined: { name: "PersonStatus" } } },
        { name: "roles", type: { vec: { defined: { name: "Role" } } } },
        { name: "role_data", type: "string" },
        { name: "motivo", type: "string" },
      ],
    },
    // ── FASE 2: Solicitud de tokens ───────────────────────────────────────
    {
      name: "request_tokens",
      discriminator: [97, 174, 219, 62, 9, 41, 113, 147],
      accounts: [
        { name: "solicitante_person" },
        { name: "token_request", writable: true },
        { name: "solicitante", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "_id", type: "u64" },
        { name: "carrera", type: "string" },
        { name: "plan", type: "string" },
        { name: "resolucion", type: "string" },
        { name: "anio_egreso", type: "u16" },
        { name: "cantidad", type: "u32" },
      ],
    },
    {
      name: "approve_token_request",
      discriminator: [193, 52, 110, 188, 165, 43, 29, 238],
      accounts: [
        { name: "ministerio_person" },
        { name: "ministerio", writable: true, signer: true },
        { name: "token_request", writable: true },
      ],
      args: [],
    },
    {
      name: "reject_token_request",
      discriminator: [251, 189, 121, 167, 7, 101, 102, 214],
      accounts: [
        { name: "ministerio_person" },
        { name: "ministerio", writable: true, signer: true },
        { name: "token_request", writable: true },
      ],
      args: [{ name: "motivo", type: "string" }],
    },
    // ── FASE 3/4: Tokens y certificaciones ───────────────────────────────
    {
      name: "mint_token",
      discriminator: [172, 137, 183, 14, 207, 110, 234, 56],
      accounts: [
        { name: "universidad_person" },
        { name: "token_request", writable: true },
        { name: "cert_token", writable: true },
        { name: "universidad", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [{ name: "index", type: "u32" }],
    },
    {
      name: "assign_token_to_graduate",
      discriminator: [36, 222, 57, 228, 26, 178, 18, 174],
      accounts: [
        { name: "universidad_person" },
        { name: "cert_token", writable: true },
        { name: "certification", writable: true },
        { name: "universidad", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "nombre", type: "string" },
        { name: "apellido", type: "string" },
        { name: "dni", type: "string" },
        { name: "hash_datos", type: { array: ["u8", 32] } },
      ],
    },
    // ── FASE 5: Egresado ─────────────────────────────────────────────────
    {
      name: "request_certification",
      discriminator: [46, 128, 197, 242, 175, 38, 9, 165],
      accounts: [
        { name: "egresado_person" },
        { name: "graduate_request", writable: true },
        { name: "egresado", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "tipo", type: { defined: { name: "GraduateType" } } },
        { name: "pdf_hash", type: { array: ["u8", 32] } },
        { name: "pais", type: { option: "string" } },
      ],
    },
    // ── FASE 6: Ministerio ───────────────────────────────────────────────
    {
      name: "approve_local_request",
      discriminator: [20, 100, 189, 126, 148, 97, 49, 85],
      accounts: [
        { name: "ministerio_person" },
        { name: "ministerio", writable: true, signer: true },
        { name: "graduate_request", writable: true },
      ],
      args: [],
    },
    {
      name: "reject_request",
      discriminator: [11, 232, 75, 149, 197, 137, 152, 208],
      accounts: [
        { name: "ministerio_person" },
        { name: "ministerio", writable: true, signer: true },
        { name: "graduate_request", writable: true },
      ],
      args: [{ name: "motivo", type: "string" }],
    },
    {
      name: "derive_to_cancilleria",
      discriminator: [81, 89, 21, 37, 74, 146, 121, 2],
      accounts: [
        { name: "ministerio_person" },
        { name: "ministerio", writable: true, signer: true },
        { name: "graduate_request", writable: true },
      ],
      args: [],
    },
    // ── FASE 7: Cancillería ──────────────────────────────────────────────
    {
      name: "approve_foreign",
      discriminator: [37, 185, 162, 225, 33, 199, 157, 199],
      accounts: [
        { name: "cancilleria_person" },
        { name: "cancilleria", writable: true, signer: true },
        { name: "graduate_request", writable: true },
      ],
      args: [],
    },
    {
      name: "reject_foreign",
      discriminator: [176, 35, 47, 208, 106, 118, 70, 187],
      accounts: [
        { name: "cancilleria_person" },
        { name: "cancilleria", writable: true, signer: true },
        { name: "graduate_request", writable: true },
      ],
      args: [{ name: "motivo", type: "string" }],
    },
    // ── FASE 8: Revocación ───────────────────────────────────────────────
    {
      name: "revoke_certification",
      discriminator: [185, 235, 220, 63, 60, 125, 238, 80],
      accounts: [
        { name: "config" },
        { name: "admin_person" },
        { name: "admin", writable: true, signer: true },
        { name: "certification", writable: true },
      ],
      args: [{ name: "motivo", type: "string" }],
    },
  ],
  accounts: [],
  events: [],
  errors: [],
  types: [
    {
      name: "Role",
      type: {
        kind: "enum",
        variants: [
          { name: "Admin" },
          { name: "Universidad" },
          { name: "Ministerio" },
          { name: "Cancilleria" },
          { name: "Egresado" },
        ],
      },
    },
    {
      name: "PersonStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Activo" },
          { name: "Inactivo" },
        ],
      },
    },
    {
      name: "GraduateType",
      type: {
        kind: "enum",
        variants: [
          { name: "Local" },
          { name: "Extranjero" },
        ],
      },
    },
  ],
};

function pda(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function personPda(wallet: PublicKey): PublicKey {
  return pda([Buffer.from("person"), wallet.toBuffer()]);
}

function roleRequestPda(requester: PublicKey, role: RequestableRole): PublicKey {
  return pda([
    Buffer.from("role_request"),
    requester.toBuffer(),
    Buffer.from([ROLE_INDEX[role]]),
  ]);
}

function configPda(): PublicKey {
  return pda([Buffer.from("config")]);
}

function extractSignatureFromError(message: string): string | undefined {
  const fromCheck = message.match(/check signature\s+([1-9A-HJ-NP-Za-km-z]{32,})/i);
  if (fromCheck?.[1]) return fromCheck[1];

  const generic = message.match(/\b([1-9A-HJ-NP-Za-km-z]{80,100})\b/);
  if (generic?.[1]) return generic[1];

  return undefined;
}

async function waitForExtendedConfirmation(
  connection: unknown,
  signature: string,
  timeoutMs = 120_000,
  pollIntervalMs = 1_500,
): Promise<boolean> {
  const conn = connection as any;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statuses = await conn.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = statuses?.value?.[0];

    if (status?.err) {
      throw new Error(`La transacción falló en cadena: ${JSON.stringify(status.err)}`);
    }

    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

async function rpcWithExtendedTimeout(connection: unknown, runRpc: () => Promise<string>): Promise<string> {
  try {
    return await runRpc();
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    if (!raw.toLowerCase().includes("transaction was not confirmed in")) {
      throw error;
    }

    const signature = extractSignatureFromError(raw);
    if (!signature) {
      throw error;
    }

    const confirmed = await waitForExtendedConfirmation(connection, signature);
    if (confirmed) {
      return signature;
    }

    throw error;
  }
}

function buildProgram(connection: unknown, wallet: unknown): Program<any> {
  const provider = new AnchorProvider(connection as any, wallet as any, {
    commitment: "confirmed",
  });
  return new Program(IDL_MIN as any, provider);
}

export async function requestRoleTx(params: {
  connection: unknown;
  wallet: unknown;
  requester: PublicKey;
  role: RequestableRole;
  nombre: string;
  apellido: string;
  dni: string;
  roleData: string;
}): Promise<string> {
  const { connection, wallet, requester, role, nombre, apellido, dni, roleData } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .requestRole(ROLE_ENUM[role], nombre, apellido, dni, roleData)
      .accounts({
        requesterPerson: personPda(requester),
        roleRequest: roleRequestPda(requester, role),
        requester,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  );
}

export async function registerPersonAdminTx(params: {
  connection: unknown;
  wallet: unknown;
  admin: PublicKey;
  target: PublicKey;
  nombre: string;
  apellido: string;
  dni: string;
  roleData: string;
}): Promise<string> {
  const { connection, wallet, admin, target, nombre, apellido, dni, roleData } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .registerPerson(nombre, apellido, dni, roleData)
      .accounts({
        config: configPda(),
        authorityPerson: personPda(admin),
        person: personPda(target),
        wallet: target,
        authority: admin,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  );
}

export async function isSystemInitialized(connection: unknown): Promise<boolean> {
  const info = await (connection as any).getAccountInfo(configPda(), "confirmed");
  return !!info;
}

export async function initializeAsFirstAdminTx(params: {
  connection: unknown;
  wallet: unknown;
  admin: PublicKey;
  nombre: string;
  apellido: string;
  dni: string;
}): Promise<string> {
  const { connection, wallet, admin, nombre, apellido, dni } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .initialize(nombre, apellido, dni)
      .accounts({
        config: configPda(),
        adminPerson: personPda(admin),
        admin,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  );
}

export async function approveRoleTx(params: {
  connection: unknown;
  wallet: unknown;
  admin: PublicKey;
  requester: PublicKey;
  role: RequestableRole;
}): Promise<string> {
  const { connection, wallet, admin, requester, role } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .approveRole()
      .accounts({
        config: configPda(),
        adminPerson: personPda(admin),
        admin,
        roleRequest: roleRequestPda(requester, role),
        targetPerson: personPda(requester),
      })
      .rpc()
  );
}

export async function rejectRoleTx(params: {
  connection: unknown;
  wallet: unknown;
  admin: PublicKey;
  requester: PublicKey;
  role: RequestableRole;
  motivo: string;
}): Promise<string> {
  const { connection, wallet, admin, requester, role, motivo } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .rejectRole(motivo)
      .accounts({
        config: configPda(),
        adminPerson: personPda(admin),
        admin,
        roleRequest: roleRequestPda(requester, role),
        targetPerson: personPda(requester),
      })
      .rpc()
  );
}

export async function setStatusTx(params: {
  connection: unknown;
  wallet: unknown;
  admin: PublicKey;
  target: PublicKey;
  active: boolean;
  motivo: string;
}): Promise<string> {
  const { connection, wallet, admin, target, active, motivo } = params;
  const program = buildProgram(connection, wallet);

  const statusEnum = active ? { activo: {} } : { inactivo: {} };

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .setStatus(statusEnum, motivo)
      .accounts({
        config: configPda(),
        adminPerson: personPda(admin),
        admin,
        targetPerson: personPda(target),
      })
      .rpc()
  );
}

export async function updatePersonAdminTx(params: {
  connection: unknown;
  wallet: unknown;
  admin: PublicKey;
  target: PublicKey;
  nombre: string;
  apellido: string;
  dni: string;
  active: boolean;
  roles: EditableRole[];
  roleData: string;
  motivo: string;
}): Promise<string> {
  const { connection, wallet, admin, target, nombre, apellido, dni, active, roles, roleData, motivo } = params;
  const program = buildProgram(connection, wallet);

  const statusEnum = active ? { activo: {} } : { inactivo: {} };
  const rolesEnum = roles.map((r) => {
    if (r === "Universidad") return { universidad: {} };
    if (r === "Ministerio") return { ministerio: {} };
    if (r === "Cancilleria") return { cancilleria: {} };
    return { egresado: {} };
  });

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .updatePersonAdmin(nombre, apellido, dni, statusEnum, rolesEnum, roleData, motivo)
      .accounts({
        config: configPda(),
        adminPerson: personPda(admin),
        admin,
        targetPerson: personPda(target),
      })
      .rpc()
  );
}

function tokenRequestPda(solicitante: PublicKey, id: bigint): PublicKey {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(id);
  return pda([Buffer.from("token_request"), solicitante.toBuffer(), idBytes]);
}

function certTokenPda(tokenRequest: PublicKey, index: number): PublicKey {
  const indexBytes = Buffer.alloc(4);
  indexBytes.writeUInt32LE(index);
  return pda([Buffer.from("cert_token"), tokenRequest.toBuffer(), indexBytes]);
}

function certificationPda(certToken: PublicKey): PublicKey {
  return pda([Buffer.from("certification"), certToken.toBuffer()]);
}

function graduateRequestPda(egresado: PublicKey): PublicKey {
  return pda([Buffer.from("graduate_request"), egresado.toBuffer()]);
}

function readString(data: Uint8Array, offset: number): [string, number] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const length = view.getUint32(offset, true);
  const start = offset + 4;
  const end = start + length;
  return [new TextDecoder().decode(data.subarray(start, end)), end];
}

export async function fetchPersonRoleDataOnChain(params: {
  connection: unknown;
  wallet: PublicKey;
}): Promise<string | null> {
  const { connection, wallet } = params;
  const personAccount = personPda(wallet);
  const accountInfo = await (connection as Connection).getAccountInfo(
    personAccount,
    "confirmed"
  );

  if (!accountInfo?.data || accountInfo.data.length < 8) return null;

  const data =
    accountInfo.data instanceof Uint8Array ? accountInfo.data : Uint8Array.from(accountInfo.data);
  if (!PERSON_ACCOUNT_DISCRIMINATOR.every((byte, index) => data[index] === byte)) return null;

  let offset = 8;
  offset += 32;
  [, offset] = readString(data, offset);
  [, offset] = readString(data, offset);
  [, offset] = readString(data, offset);
  offset += 1;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const rolesLength = view.getUint32(offset, true);
  offset += 4 + rolesLength;

  const [roleData] = readString(data, offset);
  return roleData || null;
}

export async function fetchPersonIdentityOnChain(params: {
  connection: unknown;
  wallet: PublicKey;
}): Promise<{ nombre: string | null; apellido: string | null; dni: string | null } | null> {
  const { connection, wallet } = params;
  const personAccount = personPda(wallet);
  const accountInfo = await (connection as Connection).getAccountInfo(personAccount);
  if (!accountInfo?.data || accountInfo.data.length < 8 + 32) return null;

  const data = accountInfo.data;
  let offset = 8; // discriminator
  offset += 32; // wallet

  const [nombre, nextNombre] = readString(data, offset);
  offset = nextNombre;
  const [apellido, nextApellido] = readString(data, offset);
  offset = nextApellido;
  const [dni] = readString(data, offset);

  return {
    nombre: nombre || null,
    apellido: apellido || null,
    dni: dni || null,
  };
}

export async function fetchTokenRequestDetailOnChain(params: {
  connection: unknown;
  tokenRequest: PublicKey;
}): Promise<{
  carrera: string | null;
  plan: string | null;
  resolucion: string | null;
  anioEgreso: number | null;
  cantidad: number | null;
  mintedCount: number | null;
} | null> {
  const { connection, tokenRequest } = params;
  const accountInfo = await (connection as Connection).getAccountInfo(
    tokenRequest,
    "confirmed"
  );

  if (!accountInfo?.data || accountInfo.data.length < 8) return null;

  const data =
    accountInfo.data instanceof Uint8Array ? accountInfo.data : Uint8Array.from(accountInfo.data);

  let offset = 8;
  offset += 32; // universidad
  offset += 32; // solicitante

  const [carrera, offsetAfterCarrera] = readString(data, offset);
  const [plan, offsetAfterPlan] = readString(data, offsetAfterCarrera);
  const [resolucion, offsetAfterResolucion] = readString(data, offsetAfterPlan);

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const anioEgreso = view.getUint16(offsetAfterResolucion, true);
  const cantidad = view.getUint32(offsetAfterResolucion + 2, true);
  const estado = view.getUint8(offsetAfterResolucion + 6);
  const [motivo_rechazo, offsetAfterMotivo] = readString(data, offsetAfterResolucion + 7);
  const mintedCount = view.getUint32(offsetAfterMotivo, true);

  return {
    carrera: carrera || null,
    plan: plan || null,
    resolucion: resolucion || null,
    anioEgreso,
    cantidad,
    mintedCount,
  };
}

export async function fetchGraduateRequestDetailOnChain(params: {
  connection: unknown;
  egresadoWallet: PublicKey;
}): Promise<{
  tipo: string | null;
  estado: string | null;
  pais: string | null;
  motivo: string | null;
  pdfHashHex: string | null;
} | null> {
  const { connection, egresadoWallet } = params;
  const requestAccount = graduateRequestPda(egresadoWallet);
  const accountInfo = await (connection as Connection).getAccountInfo(
    requestAccount,
    "confirmed"
  );

  if (!accountInfo?.data || accountInfo.data.length < 8) return null;

  const data =
    accountInfo.data instanceof Uint8Array ? accountInfo.data : Uint8Array.from(accountInfo.data);

  let offset = 8;
  offset += 32; // wallet

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tipoRaw = view.getUint8(offset);
  offset += 1;
  const pdfHash = data.subarray(offset, offset + 32);
  offset += 32; // pdf_hash
  const estadoRaw = view.getUint8(offset);
  offset += 1;

  const [motivo, offsetAfterMotivo] = readString(data, offset);
  const [pais] = readString(data, offsetAfterMotivo);

  const tipo = tipoRaw === 0 ? "Local" : tipoRaw === 1 ? "Extranjero" : null;
  const estado =
    estadoRaw === 0
      ? "Pendiente"
      : estadoRaw === 1
      ? "AprobadoLocal"
      : estadoRaw === 2
      ? "AprobadoExtranjero"
      : estadoRaw === 3
      ? "Rechazado"
      : estadoRaw === 4
      ? "DerivadoCancilleria"
      : null;

  return {
    tipo,
    estado,
    pais: pais || null,
    motivo: motivo || null,
    pdfHashHex: pdfHash.length === 32
      ? Array.from(pdfHash).map((b) => b.toString(16).padStart(2, "0")).join("")
      : null,
  };
}

export async function sha256FromText(text: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  const input = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  ) as ArrayBuffer;
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(hashBuffer);
}

export async function sha256FromFile(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(hashBuffer);
}

export async function requestTokensTx(params: {
  connection: unknown;
  wallet: unknown;
  solicitante: PublicKey;
  id: bigint;
  carrera: string;
  plan: string;
  resolucion: string;
  anioEgreso: number;
  cantidad: number;
}): Promise<string> {
  const { connection, wallet, solicitante, id, carrera, plan, resolucion, anioEgreso, cantidad } = params;
  const program = buildProgram(connection, wallet);
  const trPda = tokenRequestPda(solicitante, id);
  const idBn = new BN(id.toString());

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .requestTokens(idBn, carrera, plan, resolucion, anioEgreso, cantidad)
      .accounts({
        solicitantePerson: personPda(solicitante),
        tokenRequest: trPda,
        solicitante,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  );
}

export async function approveTokenRequestTx(params: {
  connection: unknown;
  wallet: unknown;
  ministerio: PublicKey;
  tokenRequest: PublicKey;
}): Promise<string> {
  const { connection, wallet, ministerio, tokenRequest } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .approveTokenRequest()
      .accounts({
        ministerioPerson: personPda(ministerio),
        ministerio,
        tokenRequest,
      })
      .rpc()
  );
}

export async function rejectTokenRequestTx(params: {
  connection: unknown;
  wallet: unknown;
  ministerio: PublicKey;
  tokenRequest: PublicKey;
  motivo: string;
}): Promise<string> {
  const { connection, wallet, ministerio, tokenRequest, motivo } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .rejectTokenRequest(motivo)
      .accounts({
        ministerioPerson: personPda(ministerio),
        ministerio,
        tokenRequest,
      })
      .rpc()
  );
}

export async function mintTokenTx(params: {
  connection: unknown;
  wallet: unknown;
  universidad: PublicKey;
  tokenRequest: PublicKey;
  index: number;
}): Promise<string> {
  const { connection, wallet, universidad, tokenRequest, index } = params;
  const program = buildProgram(connection, wallet);
  const certToken = certTokenPda(tokenRequest, index);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .mintToken(index)
      .accounts({
        universidadPerson: personPda(universidad),
        tokenRequest,
        certToken,
        universidad,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  );
}

export async function mintTokensBatchTx(params: {
  connection: unknown;
  wallet: unknown;
  universidad: PublicKey;
  tokenRequest: PublicKey;
  indexes: number[];
}): Promise<string> {
  const { connection, wallet, universidad, tokenRequest, indexes } = params;

  if (!Array.isArray(indexes) || indexes.length === 0) {
    throw new Error("Debes indicar al menos un índice para acuñar.");
  }
  if (indexes.length > 10) {
    throw new Error("Cada transacción de acuñación permite hasta 10 tokens.");
  }

  const program = buildProgram(connection, wallet);
  const ixs = await Promise.all(
    indexes.map((index) =>
      (program as any).methods
        .mintToken(index)
        .accounts({
          universidadPerson: personPda(universidad),
          tokenRequest,
          certToken: certTokenPda(tokenRequest, index),
          universidad,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    )
  );

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_300_000 }));
  for (const ix of ixs) tx.add(ix);

  return rpcWithExtendedTimeout(connection, () =>
    (program.provider as AnchorProvider).sendAndConfirm(tx, [], {
      commitment: "confirmed",
    })
  );
}

export async function assignTokenTx(params: {
  connection: unknown;
  wallet: unknown;
  universidad: PublicKey;
  tokenRequest?: PublicKey;
  certToken: PublicKey;
  nombre: string;
  apellido: string;
  dni: string;
  hashDatos: Uint8Array;
}): Promise<string> {
  const { connection, wallet, universidad, certToken, nombre, apellido, dni, hashDatos } = params;
  const program = buildProgram(connection, wallet);
  const certification = certificationPda(certToken);

  // Compatibilidad: si la UI no pasa tokenRequest, se obtiene desde la cuenta CertificationToken.
  let tokenRequest = params.tokenRequest;
  if (!tokenRequest) {
    const tokenAccount = await (program as any).account.certificationToken.fetch(certToken);
    tokenRequest = new PublicKey(tokenAccount.tokenRequest);
  }

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .assignTokenToGraduate(nombre, apellido, dni, Array.from(hashDatos))
      .accounts({
        universidadPerson: personPda(universidad),
        certToken,
        tokenRequest,
        certification,
        universidad,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  );
}

export async function requestCertificationTx(params: {
  connection: unknown;
  wallet: unknown;
  egresado: PublicKey;
  tipo: "Local" | "Extranjero";
  pdfHash: Uint8Array;
  pais?: string;
}): Promise<string> {
  const { connection, wallet, egresado, tipo, pdfHash, pais } = params;
  const program = buildProgram(connection, wallet);
  const tipoEnum = tipo === "Local" ? { local: {} } : { extranjero: {} };

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .requestCertification(tipoEnum, Array.from(pdfHash), pais ?? null)
      .accounts({
        egresadoPerson: personPda(egresado),
        graduateRequest: graduateRequestPda(egresado),
        egresado,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
  );
}

export async function approveLocalRequestTx(params: {
  connection: unknown;
  wallet: unknown;
  ministerio: PublicKey;
  egresadoWallet: PublicKey;
}): Promise<string> {
  const { connection, wallet, ministerio, egresadoWallet } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .approveLocalRequest()
      .accounts({
        ministerioPerson: personPda(ministerio),
        ministerio,
        graduateRequest: graduateRequestPda(egresadoWallet),
      })
      .rpc()
  );
}

export async function rejectGraduateRequestTx(params: {
  connection: unknown;
  wallet: unknown;
  ministerio: PublicKey;
  egresadoWallet: PublicKey;
  motivo: string;
}): Promise<string> {
  const { connection, wallet, ministerio, egresadoWallet, motivo } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .rejectRequest(motivo)
      .accounts({
        ministerioPerson: personPda(ministerio),
        ministerio,
        graduateRequest: graduateRequestPda(egresadoWallet),
      })
      .rpc()
  );
}

export async function deriveToCancilleriaTx(params: {
  connection: unknown;
  wallet: unknown;
  ministerio: PublicKey;
  egresadoWallet: PublicKey;
}): Promise<string> {
  const { connection, wallet, ministerio, egresadoWallet } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .deriveToCancilleria()
      .accounts({
        ministerioPerson: personPda(ministerio),
        ministerio,
        graduateRequest: graduateRequestPda(egresadoWallet),
      })
      .rpc()
  );
}

export async function approveForeignTx(params: {
  connection: unknown;
  wallet: unknown;
  cancilleria: PublicKey;
  egresadoWallet: PublicKey;
}): Promise<string> {
  const { connection, wallet, cancilleria, egresadoWallet } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .approveForeign()
      .accounts({
        cancilleriaPerson: personPda(cancilleria),
        cancilleria,
        graduateRequest: graduateRequestPda(egresadoWallet),
      })
      .rpc()
  );
}

export async function rejectForeignTx(params: {
  connection: unknown;
  wallet: unknown;
  cancilleria: PublicKey;
  egresadoWallet: PublicKey;
  motivo: string;
}): Promise<string> {
  const { connection, wallet, cancilleria, egresadoWallet, motivo } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .rejectForeign(motivo)
      .accounts({
        cancilleriaPerson: personPda(cancilleria),
        cancilleria,
        graduateRequest: graduateRequestPda(egresadoWallet),
      })
      .rpc()
  );
}

export async function revokeCertificationTx(params: {
  connection: unknown;
  wallet: unknown;
  admin: PublicKey;
  certification: PublicKey;
  motivo: string;
}): Promise<string> {
  const { connection, wallet, admin, certification, motivo } = params;
  const program = buildProgram(connection, wallet);

  return rpcWithExtendedTimeout(connection, () =>
    (program as any).methods
      .revokeCertification(motivo)
      .accounts({
        config: configPda(),
        adminPerson: personPda(admin),
        admin,
        certification,
      })
      .rpc()
  );
}
