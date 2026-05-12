// Re-exporta las queries del indexador apuntando a la DB configurada
// en el backend (misma ruta de archivo .db).
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { config } from "./config";
import { fetchOnChainCertification } from "./solana";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const resolved = path.resolve(__dirname, "..", config.dbPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Base de datos no encontrada en ${resolved}. ¿El indexador está corriendo?`
    );
  }
  _db = new Database(resolved, { readonly: true });
  _db.pragma("journal_mode = WAL");
  return _db;
}

// ── Tipos compartidos ─────────────────────────────────────────────────────

export interface PersonRow {
  wallet: string;
  nombre: string | null;
  apellido: string | null;
  dni: string | null;
  status: string | null;
  roles: string[];
  role_data: string | null;
  updated_at: number | null;
}

export interface CertificationRow {
  pubkey: string;
  cert_token: string | null;
  nombre: string | null;
  apellido: string | null;
  carrera: string | null;
  universidad: string | null;
  estado: string | null;
  hash_datos: string | null;
  motivo_revocacion: string | null;
  updated_at: number | null;
}

export interface AuditRow {
  id: number;
  signature: string;
  actor: string;
  accion: string;
  entidad: string;
  motivo: string | null;
  timestamp: number;
}

export interface GraduateRequestRow {
  pubkey: string;
  wallet: string;
  tipo: string | null;
  estado: string | null;
  motivo: string | null;
  pais: string | null;
  updated_at: number | null;
}

export interface EventRow {
  id: number;
  signature: string;
  slot: number;
  block_time: number | null;
  event_type: string;
  data: string;
  processed_at: number;
}

// ── Personas ──────────────────────────────────────────────────────────────

function parseRoles(raw: unknown): string[] {
  try { return JSON.parse(raw as string); } catch { return []; }
}

// DNI nunca se expone en listados generales (protección de datos).
function sanitizePerson(row: Record<string, unknown>, includeDni = false): PersonRow {
  return {
    wallet: row.wallet as string,
    nombre: row.nombre as string | null,
    apellido: row.apellido as string | null,
    dni: includeDni ? (row.dni as string | null) : null,
    status: row.status as string | null,
    roles: parseRoles(row.roles),
    role_data: row.role_data as string | null,
    updated_at: row.updated_at as number | null,
  };
}

export function getAllPersons(limit: number, offset: number): PersonRow[] {
  return (getDb()
    .prepare("SELECT * FROM persons ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Record<string, unknown>[]).map((row) => sanitizePerson(row));
}

export function getPersonByWallet(wallet: string): PersonRow | null {
  const row = getDb()
    .prepare("SELECT * FROM persons WHERE wallet = ?")
    .get(wallet) as Record<string, unknown> | undefined;
  return row ? sanitizePerson(row, true) : null;
}

export function getPersonsByRole(role: string, limit: number, offset: number): PersonRow[] {
  return (getDb()
    .prepare("SELECT * FROM persons WHERE roles LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(`%${role}%`, limit, offset) as Record<string, unknown>[]).map((row) => sanitizePerson(row));
}

export function updatePersonIdentity(wallet: string, nombre?: string, apellido?: string, dni?: string): PersonRow | null {
  const db = getDb();
  const current = db.prepare("SELECT * FROM persons WHERE wallet = ?").get(wallet) as Record<string, unknown> | undefined;
  
  if (!current) return null;
  
  const updatedNombre = nombre !== undefined ? nombre : (current.nombre as string | null);
  const updatedApellido = apellido !== undefined ? apellido : (current.apellido as string | null);
  const updatedDni = dni !== undefined ? dni : (current.dni as string | null);
  
  db.prepare(`
    UPDATE persons 
    SET nombre = ?, apellido = ?, dni = ?, updated_at = ?
    WHERE wallet = ?
  `).run(updatedNombre, updatedApellido, updatedDni, Math.floor(Date.now() / 1000), wallet);
  
  return getPersonByWallet(wallet);
}

// ── Certificaciones ───────────────────────────────────────────────────────

// DNI se omite en listados. Se expone solo en /verify (verificación explícita).
function sanitizeCertification(row: Record<string, unknown>, includeDni = false): CertificationRow {
  return {
    pubkey: row.pubkey as string,
    cert_token: row.cert_token as string | null,
    nombre: row.nombre as string | null,
    apellido: row.apellido as string | null,
    carrera: row.carrera as string | null,
    universidad: row.universidad as string | null,
    estado: row.estado as string | null,
    hash_datos: row.hash_datos as string | null,
    motivo_revocacion: row.estado === "Revocada" ? (row.motivo_revocacion as string | null) : null,
    updated_at: row.updated_at as number | null,
    ...(includeDni ? { dni: row.dni as string | null } : {}),
  };
}

export function getAllCertifications(limit: number, offset: number): CertificationRow[] {
  return (getDb()
    .prepare("SELECT * FROM certifications ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Record<string, unknown>[]).map((r) => sanitizeCertification(r));
}

export function getCertificationByPubkey(pubkey: string, includeDni = false): CertificationRow | null {
  const row = getDb()
    .prepare("SELECT * FROM certifications WHERE pubkey = ?")
    .get(pubkey) as Record<string, unknown> | undefined;
  return row ? sanitizeCertification(row, includeDni) : null;
}

export function getCertificationsByUniversidad(universidad: string, limit: number, offset: number): CertificationRow[] {
  return (getDb()
    .prepare("SELECT * FROM certifications WHERE universidad = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(universidad, limit, offset) as Record<string, unknown>[]).map((r) => sanitizeCertification(r));
}

export function getActiveCertifications(limit: number, offset: number): CertificationRow[] {
  return (getDb()
    .prepare("SELECT * FROM certifications WHERE estado = 'Activa' ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Record<string, unknown>[]).map((r) => sanitizeCertification(r));
}

// ── Solicitudes de tokens ─────────────────────────────────────────────────

export interface TokenRequestRow {
  pubkey: string;
  universidad: string;
  solicitante: string;
  carrera: string | null;
  plan: string | null;
  resolucion: string | null;
  anio_egreso: number | null;
  cantidad: number | null;
  estado: string | null;
  motivo_rechazo: string | null;
  updated_at: number | null;
}

export function getTokenRequestsByUniversidad(universidad: string, limit: number, offset: number): TokenRequestRow[] {
  return getDb()
    .prepare("SELECT * FROM token_requests WHERE universidad = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(universidad, limit, offset) as TokenRequestRow[];
}

export function getAllTokenRequests(limit: number, offset: number): TokenRequestRow[] {
  return getDb()
    .prepare("SELECT * FROM token_requests ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as TokenRequestRow[];
}

export function getTokenRequestsByStatus(estado: string, limit: number, offset: number): TokenRequestRow[] {
  return getDb()
    .prepare("SELECT * FROM token_requests WHERE estado = ? ORDER BY updated_at ASC LIMIT ? OFFSET ?")
    .all(estado, limit, offset) as TokenRequestRow[];
}

// ── Solicitudes de graduación ─────────────────────────────────────────────

export function getGraduateRequestsByStatus(estado: string, limit: number, offset: number): GraduateRequestRow[] {
  return getDb()
    .prepare("SELECT * FROM graduate_requests WHERE estado = ? ORDER BY updated_at ASC LIMIT ? OFFSET ?")
    .all(estado, limit, offset) as GraduateRequestRow[];
}

export function getGraduateRequestByWallet(wallet: string): GraduateRequestRow | null {
  return (getDb()
    .prepare("SELECT * FROM graduate_requests WHERE wallet = ? ORDER BY updated_at DESC LIMIT 1")
    .get(wallet) as GraduateRequestRow | undefined) ?? null;
}

export function getAvailableCertTokens(universidad: string): Array<{ cert_token_pubkey: string; timestamp: number }> {
  // cert_tokens acuñados por esta universidad que aún no están asignados (no aparecen en certifications)
  return getDb().prepare(`
    SELECT ae.entidad AS cert_token_pubkey, ae.timestamp
    FROM audit_entries ae
    WHERE ae.actor = ? AND ae.accion = 'MintToken'
      AND ae.entidad NOT IN (
        SELECT cert_token FROM certifications WHERE cert_token IS NOT NULL AND universidad = ?
      )
    ORDER BY ae.timestamp DESC
  `).all(universidad, universidad) as Array<{ cert_token_pubkey: string; timestamp: number }>;
}

// ── Eventos / Transacciones ───────────────────────────────────────────────

export function getAllEvents(limit: number, offset: number): EventRow[] {
  return getDb()
    .prepare("SELECT id, signature, slot, block_time, event_type, data, processed_at FROM events ORDER BY slot DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as EventRow[];
}

export function getEventsByType(eventType: string, limit: number, offset: number): EventRow[] {
  return getDb()
    .prepare("SELECT id, signature, slot, block_time, event_type, data, processed_at FROM events WHERE event_type = ? ORDER BY slot DESC LIMIT ? OFFSET ?")
    .all(eventType, limit, offset) as EventRow[];
}

export function getEventsBySignature(signature: string): EventRow[] {
  return getDb()
    .prepare("SELECT id, signature, slot, block_time, event_type, data, processed_at FROM events WHERE signature = ?")
    .all(signature) as EventRow[];
}

// ── Auditoría ─────────────────────────────────────────────────────────────

export function getAuditLog(limit: number, offset: number): AuditRow[] {
  return getDb()
    .prepare("SELECT * FROM audit_entries ORDER BY timestamp DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as AuditRow[];
}

export function getAuditByActor(actor: string, limit: number): AuditRow[] {
  return getDb()
    .prepare("SELECT * FROM audit_entries WHERE actor = ? ORDER BY timestamp DESC LIMIT ?")
    .all(actor, limit) as AuditRow[];
}

// ── Verificación pública ──────────────────────────────────────────────────

export interface VerifyResult {
  valid: boolean;
  certification: (CertificationRow & { dni?: string | null }) | null;
  auditHistory: AuditRow[];
  blockchainVerified: boolean;
  validationErrors: string[];
}

export async function verifyCertification(pubkey: string, expectedHash?: string): Promise<VerifyResult> {
  const cert = getCertificationByPubkey(pubkey, true);
  if (!cert) {
    return {
      valid: false,
      certification: null,
      auditHistory: [],
      blockchainVerified: false,
      validationErrors: ["La certificación no existe en la base indexada"],
    };
  }

  const validationErrors: string[] = [];

  // Si se provee el hash, verifica que coincida con el almacenado on-chain
  if (expectedHash && cert.hash_datos !== expectedHash) {
    validationErrors.push("El hash provisto no coincide con el hash registrado");
  }

  const auditHistory = getDb()
    .prepare("SELECT * FROM audit_entries WHERE entidad = ? ORDER BY timestamp DESC LIMIT 20")
    .all(pubkey) as AuditRow[];

  try {
    const onChain = await fetchOnChainCertification(pubkey);
    if (!onChain) {
      validationErrors.push("La cuenta no existe on-chain o no pertenece al programa");
    } else {
      if (cert.cert_token !== onChain.certToken) {
        validationErrors.push("El token asociado no coincide con el registro on-chain");
      }
      if (cert.nombre !== onChain.nombre) {
        validationErrors.push("El nombre no coincide con el registro on-chain");
      }
      if (cert.apellido !== onChain.apellido) {
        validationErrors.push("El apellido no coincide con el registro on-chain");
      }
      if (cert.carrera !== onChain.carrera) {
        validationErrors.push("La carrera no coincide con el registro on-chain");
      }
      if (cert.universidad !== onChain.universidad) {
        validationErrors.push("La institución no coincide con el registro on-chain");
      }
      if (cert.estado !== onChain.estado) {
        validationErrors.push("El estado no coincide con el registro on-chain");
      }
      if ((cert.hash_datos ?? "").toLowerCase() !== onChain.hashDatos.toLowerCase()) {
        validationErrors.push("El hash de datos no coincide con el registro on-chain");
      }
      if ((cert.motivo_revocacion ?? "") !== onChain.motivoRevocacion) {
        validationErrors.push("El motivo de revocación no coincide con el registro on-chain");
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido consultando Solana";
    validationErrors.push(`No se pudo validar on-chain: ${msg}`);
  }

  const blockchainVerified = validationErrors.length === 0;

  return {
    valid: cert.estado === "Activa" && blockchainVerified,
    certification: cert,
    auditHistory,
    blockchainVerified,
    validationErrors,
  };
}

// ── Estadísticas ──────────────────────────────────────────────────────────

export function getStats(): Record<string, number> {
  const db = getDb();
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    totalPersons: n("SELECT COUNT(*) AS n FROM persons"),
    totalCertifications: n("SELECT COUNT(*) AS n FROM certifications"),
    activeCertifications: n("SELECT COUNT(*) AS n FROM certifications WHERE estado = 'Activa'"),
    revokedCertifications: n("SELECT COUNT(*) AS n FROM certifications WHERE estado = 'Revocada'"),
    totalEvents: n("SELECT COUNT(*) AS n FROM events"),
    totalAuditEntries: n("SELECT COUNT(*) AS n FROM audit_entries"),
    pendingGraduateRequests: n("SELECT COUNT(*) AS n FROM graduate_requests WHERE estado = 'Pendiente'"),
  };
}
