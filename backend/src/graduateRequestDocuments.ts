import fs from "fs";
import path from "path";
import crypto from "crypto";

export type GraduateRequestDocumentRecord = {
  wallet: string;
  pubkey: string | null;
  pdf_hash: string;
  disk_name: string;
  file_name: string;
  mime_type: string;
  titulo_nombre: string;
  titulo_carrera: string;
  titulo_institucion: string;
  titulo_anio: number | null;
  titulo_pais: string;
  titulo_observaciones: string;
  uploaded_at: number;
};

const DATA_DIR = path.resolve(__dirname, "..", "data");
const FILES_DIR = path.join(DATA_DIR, "graduate-request-documents");
const INDEX_FILE = path.join(DATA_DIR, "graduate-request-documents.json");

function ensureStorage() {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, "[]", "utf8");
  }
}

function readIndex(): GraduateRequestDocumentRecord[] {
  ensureStorage();
  try {
    const raw = fs.readFileSync(INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GraduateRequestDocumentRecord[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(rows: GraduateRequestDocumentRecord[]) {
  ensureStorage();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(rows, null, 2), "utf8");
}

export function getDocumentByWallet(wallet: string): GraduateRequestDocumentRecord | null {
  const rows = readIndex();
  const found = rows.find((r) => r.wallet === wallet);
  return found ?? null;
}

export function saveGraduateRequestDocument(input: {
  wallet: string;
  pubkey: string | null;
  pdfHash: string;
  fileName: string;
  mimeType: string;
  pdfBase64: string;
  tituloNombre: string;
  tituloCarrera: string;
  tituloInstitucion: string;
  tituloAnio: number | null;
  tituloPais: string;
  tituloObservaciones: string;
}): GraduateRequestDocumentRecord {
  ensureStorage();

  const cleanBase64 = input.pdfBase64.replace(/^data:application\/pdf;base64,/, "").trim();
  const pdfBuffer = Buffer.from(cleanBase64, "base64");
  const computedHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

  if (computedHash.toLowerCase() !== input.pdfHash.toLowerCase()) {
    throw new Error("El hash del PDF no coincide con el contenido recibido");
  }

  const ts = Date.now();
  // Usar UUID v4 como nombre de archivo anónimo en disco
  const diskName = `${crypto.randomUUID()}.pdf`;
  const diskPath = path.join(FILES_DIR, diskName);
  fs.writeFileSync(diskPath, pdfBuffer);

  const nextRecord: GraduateRequestDocumentRecord = {
    wallet: input.wallet,
    pubkey: input.pubkey,
    pdf_hash: input.pdfHash,
    disk_name: diskName,
    file_name: input.fileName || "titulo.pdf",
    mime_type: input.mimeType || "application/pdf",
    titulo_nombre: input.tituloNombre,
    titulo_carrera: input.tituloCarrera,
    titulo_institucion: input.tituloInstitucion,
    titulo_anio: input.tituloAnio,
    titulo_pais: input.tituloPais,
    titulo_observaciones: input.tituloObservaciones,
    uploaded_at: Math.floor(ts / 1000),
  };

  const rows = readIndex();
  const old = rows.find((r) => r.wallet === input.wallet);
  if (old) {
    const oldPath = path.join(FILES_DIR, old.disk_name);
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch {
        // no-op
      }
    }
  }

  const filtered = rows.filter((r) => r.wallet !== input.wallet);
  filtered.push(nextRecord);
  writeIndex(filtered);

  return nextRecord;
}

export function getDocumentAbsolutePath(diskName: string): string {
  ensureStorage();
  return path.join(FILES_DIR, diskName);
}
