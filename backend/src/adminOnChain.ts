import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import { config } from "./config";

type ApiStyleError = Error & { statusCode?: number };

function withStatus(message: string, statusCode: number): ApiStyleError {
  const err = new Error(message) as ApiStyleError;
  err.statusCode = statusCode;
  return err;
}

function pda(seeds: Buffer[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function loadAdminKeypair(): anchor.web3.Keypair {
  const keypairRaw = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8")
  ) as number[];
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(keypairRaw));
}

function buildProvider(
  connection: anchor.web3.Connection,
  keypair: anchor.web3.Keypair
): anchor.AnchorProvider {
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  return provider;
}

function loadIdl(): Record<string, unknown> {
  const idlPath = path.join(__dirname, "..", "..", "target", "idl", "academic_certification.json");
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
}

export interface SystemStatus {
  initialized: boolean;
  adminWallet: string;
  adminPersonExists: boolean;
  programId: string;
  network: string;
}

const PROGRAM_CONFIG_DISCRIMINATOR = Uint8Array.from([155, 12, 170, 224, 30, 250, 204, 130]);

function readAdminWalletFromConfig(data: Buffer | null): string | null {
  if (!data || data.length < 40) return null;

  const isProgramConfig = PROGRAM_CONFIG_DISCRIMINATOR.every((byte, index) => data[index] === byte);
  if (!isProgramConfig) return null;

  return new PublicKey(data.subarray(8, 40)).toBase58();
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const programId = new PublicKey(config.programId);
  const connection = new anchor.web3.Connection(config.solanaRpcUrl, "confirmed");

  const configPda = pda([Buffer.from("config")], programId);
  const configInfo = await connection.getAccountInfo(configPda, "confirmed");
  const adminWallet = readAdminWalletFromConfig(configInfo?.data ?? null);

  let adminPersonExists = false;
  if (adminWallet) {
    const adminPersonPda = pda(
      [Buffer.from("person"), new PublicKey(adminWallet).toBuffer()],
      programId
    );
    adminPersonExists = !!(await connection.getAccountInfo(adminPersonPda, "confirmed"));
  }

  const rpc = config.solanaRpcUrl;
  let network = "custom";
  if (rpc.includes("127.0.0.1") || rpc.includes("localhost")) network = "localnet";
  else if (rpc.includes("devnet")) network = "devnet";
  else if (rpc.includes("testnet")) network = "testnet";
  else if (rpc.includes("mainnet")) network = "mainnet";

  return {
    initialized: !!configInfo,
    adminWallet: adminWallet ?? "",
    adminPersonExists,
    programId: config.programId,
    network,
  };
}

export async function initializeProgram(params: {
  nombre: string;
  apellido: string;
  dni: string;
}): Promise<{ signature: string; adminWallet: string }> {
  const { nombre, apellido, dni } = params;
  const programId = new PublicKey(config.programId);
  const adminKeypair = loadAdminKeypair();
  const connection = new anchor.web3.Connection(config.solanaRpcUrl, "confirmed");
  const provider = buildProvider(connection, adminKeypair);

  const configPda = pda([Buffer.from("config")], programId);
  const adminPersonPda = pda([Buffer.from("person"), adminKeypair.publicKey.toBuffer()], programId);

  const configInfo = await connection.getAccountInfo(configPda, "confirmed");
  if (configInfo) {
    throw withStatus("El sistema ya está inicializado on-chain.", 409);
  }

  const idl = loadIdl();
  const program = new anchor.Program(idl as anchor.Idl, provider);

  const signature = await (program.methods as any)
    .initialize(nombre, apellido, dni)
    .accounts({
      admin: adminKeypair.publicKey,
      config: configPda,
      adminPerson: adminPersonPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature, adminWallet: adminKeypair.publicKey.toBase58() };
}

export async function registerPersonByAdmin(params: {
  wallet: string;
  nombre: string;
  apellido: string;
  dni: string;
  roleData: string;
}): Promise<{ alreadyExists: boolean; signature: string | null }> {
  const { wallet, nombre, apellido, dni, roleData } = params;
  const programId = new PublicKey(config.programId);
  const targetWallet = new PublicKey(wallet);

  const adminKeypair = loadAdminKeypair();
  const connection = new anchor.web3.Connection(config.solanaRpcUrl, "confirmed");
  const provider = buildProvider(connection, adminKeypair);
  const idl = loadIdl();
  const program = new anchor.Program(idl as anchor.Idl, provider);

  const configPda = pda([Buffer.from("config")], programId);
  const authorityPersonPda = pda([Buffer.from("person"), adminKeypair.publicKey.toBuffer()], programId);
  const personPda = pda([Buffer.from("person"), targetWallet.toBuffer()], programId);

  const [configInfo, adminPersonInfo] = await Promise.all([
    connection.getAccountInfo(configPda, "confirmed"),
    connection.getAccountInfo(authorityPersonPda, "confirmed"),
  ]);
  if (!configInfo) {
    throw withStatus(
      "Programa no inicializado on-chain (falta ProgramConfig). Usa el panel de admin para inicializar.",
      503
    );
  }
  if (!adminPersonInfo) {
    throw withStatus(
      "Admin on-chain no inicializado (falta cuenta Person del admin). Usa el panel de admin para inicializar.",
      503
    );
  }

  const existing = await connection.getAccountInfo(personPda, "confirmed");
  if (existing) {
    const trimmedRoleData = roleData.trim();
    if (!trimmedRoleData) {
      return { alreadyExists: true, signature: null };
    }

    const personAccount = await (program.account as any).personAccount.fetch(personPda);

    const statusEnum = toStatusEnum(personAccount.status);
    const rolesEnum = toRolesEnum(personAccount.roles as unknown[]);
    const currentRoleData =
      typeof personAccount.roleData === "string"
        ? personAccount.roleData
        : typeof personAccount.role_data === "string"
          ? personAccount.role_data
          : "";

    const signature = await (program.methods as any)
      .updatePersonAdmin(
        nombre,
        apellido,
        dni,
        statusEnum,
        rolesEnum,
        trimmedRoleData || currentRoleData,
        "Actualizacion de referencia de rol"
      )
      .accounts({
        config: configPda,
        adminPerson: authorityPersonPda,
        admin: adminKeypair.publicKey,
        targetPerson: personPda,
      })
      .rpc();

    return { alreadyExists: true, signature };
  }

  let signature: string;
  try {
    signature = await (program.methods as any)
      .registerPerson(nombre, apellido, dni, roleData)
      .accounts({
        config: configPda,
        authorityPerson: authorityPersonPda,
        person: personPda,
        wallet: targetWallet,
        authority: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // RegisterPerson no emite role_data en su evento; sincronizamos con
    // UpdatePersonAdmin para que el indexador persista la referencia cargada.
    await (program.methods as any)
      .updatePersonAdmin(
        nombre,
        apellido,
        dni,
        { activo: {} },
        [],
        roleData,
        "Sincronizacion inicial de referencia"
      )
      .accounts({
        config: configPda,
        adminPerson: authorityPersonPda,
        admin: adminKeypair.publicKey,
        targetPerson: personPda,
      })
      .rpc();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("AccountNotInitialized")) {
      throw withStatus(
        "No se pudo preregistrar la wallet porque el contrato no está inicializado en esta red.",
        503
      );
    }
    throw error;
  }

  return { alreadyExists: false, signature };
}

function enumKey(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const key = Object.keys(value as Record<string, unknown>)[0];
    if (key) return key;
  }
  return "";
}

function toStatusEnum(status: unknown): { activo: Record<string, never> } | { inactivo: Record<string, never> } {
  const key = enumKey(status).toLowerCase();
  if (key === "inactivo") return { inactivo: {} };
  return { activo: {} };
}

function toRolesEnum(roles: unknown[]): Array<Record<string, Record<string, never>>> {
  const out: Array<Record<string, Record<string, never>>> = [];
  for (const role of roles) {
    const key = enumKey(role).toLowerCase();
    if (key === "admin") out.push({ admin: {} });
    else if (key === "universidad") out.push({ universidad: {} });
    else if (key === "ministerio") out.push({ ministerio: {} });
    else if (key === "cancilleria") out.push({ cancilleria: {} });
    else if (key === "egresado") out.push({ egresado: {} });
  }
  return out;
}