import { createHash } from "crypto";
import bs58 from "bs58";
import { config } from "./config";

const CERTIFICATION_DISCRIMINATOR = createHash("sha256")
  .update("account:Certification")
  .digest()
  .subarray(0, 8);

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

interface AccountInfoValue {
  owner: string;
  data: [string, string];
}

function readU32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function readString(buffer: Buffer, offset: number): [string, number] {
  const len = readU32(buffer, offset);
  const start = offset + 4;
  const end = start + len;
  return [buffer.toString("utf8", start, end), end];
}

function readPubkey(buffer: Buffer, offset: number): [string, number] {
  return [bs58.encode(buffer.subarray(offset, offset + 32)), offset + 32];
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
  const anioEgreso = data.readUInt16LE(offset);
  offset += 2;
  [universidad, offset] = readPubkey(data, offset);

  const estadoRaw = data.readUInt8(offset);
  offset += 1;

  const hashDatos = data.subarray(offset, offset + 32).toString("hex");
  offset += 32;

  let motivoRevocacion: string;
  [motivoRevocacion, offset] = readString(data, offset);

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