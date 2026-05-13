import { createHash } from "crypto";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { config } from "./config";

const CERTIFICATION_DISCRIMINATOR = createHash("sha256")
  .update("account:Certification")
  .digest()
  .subarray(0, 8);

const CERTIFICATION_TOKEN_DISCRIMINATOR = createHash("sha256")
  .update("account:CertificationToken")
  .digest()
  .subarray(0, 8);

const PERSON_ACCOUNT_DISCRIMINATOR = createHash("sha256")
  .update("account:PersonAccount")
  .digest()
  .subarray(0, 8);

const PROGRAM_ID = new PublicKey(config.programId);

export interface OnChainCertification {
  certToken: string;
  nombre: string;
  apellido: string;
  dni: string;
  carrera: string;
  anioEgreso: number;
  universidad: string;
  estado: "Activa" | "Revocada";
  hashDatos: string;
  motivoRevocacion: string;
  bump: number;
}

export interface OnChainCertificationToken {
  universidad: string;
  carrera: string;
  estado: "Disponible" | "Asignado";
  tokenRequest: string;
  index: number;
  bump: number;
}

interface AccountInfoValue {
  owner: string;
  data: [string, string];
}

function readU32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function readString(buffer: Buffer, offset: number): [string, number] {
  if (offset + 4 > buffer.length) {
    throw new RangeError(`readString: offset ${offset} supera el buffer (${buffer.length})`);
  }
  const len = readU32(buffer, offset);
  const start = offset + 4;
  const end = start + len;
  if (end > buffer.length) {
    throw new RangeError(`readString: longitud ${len} en offset ${offset} supera el buffer (${buffer.length})`);
  }
  return [buffer.toString("utf8", start, end), end];
}

function readPubkey(buffer: Buffer, offset: number): [string, number] {
  return [bs58.encode(buffer.subarray(offset, offset + 32)), offset + 32];
}

function parseCertificationBuffer(data: Buffer, hasAnioEgreso: boolean): OnChainCertification {
  let offset = 8;
  let certToken: string;
  let nombre: string;
  let apellido: string;
  let dni: string;
  let carrera: string;
  let universidad: string;

  [certToken, offset] = readPubkey(data, offset);
  [nombre, offset] = readString(data, offset);
  [apellido, offset] = readString(data, offset);
  [dni, offset] = readString(data, offset);
  [carrera, offset] = readString(data, offset);

  let anioEgreso = 0;
  if (hasAnioEgreso) {
    if (offset + 2 > data.length) throw new RangeError("anio_egreso out of range");
    anioEgreso = data.readUInt16LE(offset);
    offset += 2;
  }

  [universidad, offset] = readPubkey(data, offset);

  if (offset >= data.length) throw new RangeError("estado out of range");
  const estadoRaw = data.readUInt8(offset);
  offset += 1;

  if (offset + 32 > data.length) throw new RangeError("hash_datos out of range");
  const hashDatos = data.subarray(offset, offset + 32).toString("hex");
  offset += 32;

  let motivoRevocacion: string;
  [motivoRevocacion, offset] = readString(data, offset);

  if (offset >= data.length) throw new RangeError("bump out of range");
  const bump = data.readUInt8(offset);

  return {
    certToken,
    nombre,
    apellido,
    dni,
    carrera,
    anioEgreso,
    universidad,
    estado: estadoRaw === 0 ? "Activa" : "Revocada",
    hashDatos,
    motivoRevocacion,
    bump,
  };
}

function parseCertificationTokenBuffer(data: Buffer): OnChainCertificationToken {
  let offset = 8;
  let universidad: string;
  let carrera: string;
  let tokenRequest: string;

  [universidad, offset] = readPubkey(data, offset);
  [carrera, offset] = readString(data, offset);

  if (offset >= data.length) throw new RangeError("estado out of range");
  const estadoRaw = data.readUInt8(offset);
  offset += 1;

  [tokenRequest, offset] = readPubkey(data, offset);

  if (offset + 4 > data.length) throw new RangeError("index out of range");
  const index = data.readUInt32LE(offset);
  offset += 4;

  if (offset >= data.length) throw new RangeError("bump out of range");
  const bump = data.readUInt8(offset);

  return {
    universidad,
    carrera,
    estado: estadoRaw === 0 ? "Disponible" : "Asignado",
    tokenRequest,
    index,
    bump,
  };
}

export async function fetchOnChainCertification(
  pubkey: string
): Promise<OnChainCertification | null> {
  const rpcRes = await fetch(config.solanaRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [pubkey, { encoding: "base64", commitment: "confirmed" }],
    }),
  });

  if (!rpcRes.ok) {
    throw new Error(`RPC HTTP ${rpcRes.status}`);
  }

  const payload = (await rpcRes.json()) as {
    result?: { value: AccountInfoValue | null };
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? "RPC error");
  }

  const value = payload.result?.value;
  if (!value) return null;
  if (value.owner !== config.programId) return null;

  const [base64Data, encoding] = value.data;
  if (encoding !== "base64") {
    throw new Error("Encoding inesperado de cuenta");
  }

  const data = Buffer.from(base64Data, "base64");
  if (!data.subarray(0, 8).equals(CERTIFICATION_DISCRIMINATOR)) {
    return null;
  }

  // Intentar layout nuevo (con anio_egreso), luego layout viejo (sin anio_egreso).
  // Las cuentas creadas antes del upgrade del contrato no tienen el campo anio_egreso.
  try {
    return parseCertificationBuffer(data, true);
  } catch {
    try {
      return parseCertificationBuffer(data, false);
    } catch {
      return null;
    }
  }
}

export async function fetchOnChainCertificationToken(
  pubkey: string
): Promise<OnChainCertificationToken | null> {
  const rpcRes = await fetch(config.solanaRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [pubkey, { encoding: "base64", commitment: "confirmed" }],
    }),
  });

  if (!rpcRes.ok) {
    throw new Error(`RPC HTTP ${rpcRes.status}`);
  }

  const payload = (await rpcRes.json()) as {
    result?: { value: AccountInfoValue | null };
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? "RPC error");
  }

  const value = payload.result?.value;
  if (!value) return null;
  if (value.owner !== config.programId) return null;

  const [base64Data, encoding] = value.data;
  if (encoding !== "base64") {
    throw new Error("Encoding inesperado de cuenta");
  }

  const data = Buffer.from(base64Data, "base64");
  if (!data.subarray(0, 8).equals(CERTIFICATION_TOKEN_DISCRIMINATOR)) {
    return null;
  }

  try {
    return parseCertificationTokenBuffer(data);
  } catch {
    return null;
  }
}

export async function fetchOnChainPersonRoleData(wallet: string): Promise<string | null> {
  const walletPk = new PublicKey(wallet);
  const [personPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("person"), walletPk.toBuffer()],
    PROGRAM_ID
  );

  const rpcRes = await fetch(config.solanaRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [personPda.toBase58(), { encoding: "base64", commitment: "confirmed" }],
    }),
  });

  if (!rpcRes.ok) {
    throw new Error(`RPC HTTP ${rpcRes.status}`);
  }

  const payload = (await rpcRes.json()) as {
    result?: { value: AccountInfoValue | null };
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? "RPC error");
  }

  const value = payload.result?.value;
  if (!value) return null;
  if (value.owner !== config.programId) return null;

  const [base64Data, encoding] = value.data;
  if (encoding !== "base64") {
    throw new Error("Encoding inesperado de cuenta");
  }

  const data = Buffer.from(base64Data, "base64");
  if (!data.subarray(0, 8).equals(PERSON_ACCOUNT_DISCRIMINATOR)) {
    return null;
  }

  let offset = 8;
  offset += 32; // wallet
  [, offset] = readString(data, offset); // nombre
  [, offset] = readString(data, offset); // apellido
  [, offset] = readString(data, offset); // dni
  offset += 1; // status

  if (offset + 4 > data.length) return null;
  const rolesLength = data.readUInt32LE(offset);
  offset += 4 + rolesLength; // vec<Role>

  const [roleData] = readString(data, offset);
  const trimmed = roleData.trim();
  return trimmed.length > 0 ? trimmed : null;
}