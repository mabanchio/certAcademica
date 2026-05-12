// Módulo de consultas optimizadas sobre la DB indexada.
// Utilizado por el Backend BFF (Fase 11) para responder requests REST.

import { getDb } from "./db";

// ── Personas ──────────────────────────────────────────────────────────────

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

function parsePersonRow(row: Record<string, unknown>): PersonRow {
  let roles: string[] = [];
  try { roles = JSON.parse(row.roles as string); } catch { /* vacío */ }
  return { ...row, roles } as PersonRow;
}

export function getAllPersons(limit = 100, offset = 0): PersonRow[] {
  return (
    getDb()
      .prepare("SELECT * FROM persons ORDER BY updated_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Record<string, unknown>[]
  ).map(parsePersonRow);
}

export function getPersonByWallet(wallet: string): PersonRow | null {
  const row = getDb()
    .prepare("SELECT * FROM persons WHERE wallet = ?")
    .get(wallet) as Record<string, unknown> | undefined;
  return row ? parsePersonRow(row) : null;
}

export function getPersonsByRole(role: string): PersonRow[] {
  // roles es un JSON array; búsqueda con LIKE es suficiente para SQLite
  return (
    getDb()
      .prepare("SELECT * FROM persons WHERE roles LIKE ? ORDER BY updated_at DESC")
      .all(`%${role}%`) as Record<string, unknown>[]
  ).map(parsePersonRow);
}

// ── Certificaciones ───────────────────────────────────────────────────────

export interface CertificationRow {
  pubkey: string;
  cert_token: string | null;
  nombre: string | null;
  apellido: string | null;
  dni: string | null;
  carrera: string | null;
  universidad: string | null;
  estado: string | null;
  hash_datos: string | null;
  motivo_revocacion: string | null;
  updated_at: number | null;
}

export function getAllCertifications(limit = 100, offset = 0): CertificationRow[] {
  return getDb()
    .prepare("SELECT * FROM certifications ORDER BY updated_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as CertificationRow[];
}

export function getCertificationByPubkey(pubkey: string): CertificationRow | null {
  return (
    getDb()
      .prepare("SELECT * FROM certifications WHERE pubkey = ?")
      .get(pubkey) as CertificationRow | null
  );
}

export function getCertificationsByDni(dni: string): CertificationRow[] {
  return getDb()
    .prepare("SELECT * FROM certifications WHERE dni = ? ORDER BY updated_at DESC")
    .all(dni) as CertificationRow[];
}

export function getCertificationsByUniversidad(universidad: string): CertificationRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM certifications WHERE universidad = ? ORDER BY updated_at DESC"
    )
    .all(universidad) as CertificationRow[];
}

export function getActiveCertifications(limit = 100, offset = 0): CertificationRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM certifications WHERE estado = 'Activa' ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    )
    .all(limit, offset) as CertificationRow[];
}

// ── Auditoría ─────────────────────────────────────────────────────────────

export interface AuditRow {
  id: number;
  signature: string;
  actor: string;
  accion: string;
  entidad: string;
  motivo: string | null;
  timestamp: number;
}

export function getAuditLog(limit = 100, offset = 0): AuditRow[] {
  return getDb()
    .prepare("SELECT * FROM audit_entries ORDER BY timestamp DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as AuditRow[];
}

export function getAuditByActor(actor: string, limit = 100): AuditRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM audit_entries WHERE actor = ? ORDER BY timestamp DESC LIMIT ?"
    )
    .all(actor, limit) as AuditRow[];
}

export function getAuditByEntidad(entidad: string, limit = 100): AuditRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM audit_entries WHERE entidad = ? ORDER BY timestamp DESC LIMIT ?"
    )
    .all(entidad, limit) as AuditRow[];
}

export function getAuditByAccion(accion: string, limit = 100): AuditRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM audit_entries WHERE accion = ? ORDER BY timestamp DESC LIMIT ?"
    )
    .all(accion, limit) as AuditRow[];
}

// ── Solicitudes de graduación ─────────────────────────────────────────────

export interface GraduateRequestRow {
  pubkey: string;
  wallet: string;
  tipo: string | null;
  pdf_hash: string | null;
  estado: string | null;
  motivo: string | null;
  pais: string | null;
  updated_at: number | null;
}

export function getGraduateRequestsByWallet(wallet: string): GraduateRequestRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM graduate_requests WHERE wallet = ? ORDER BY updated_at DESC"
    )
    .all(wallet) as GraduateRequestRow[];
}

export function getPendingGraduateRequests(): GraduateRequestRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM graduate_requests WHERE estado = 'Pendiente' ORDER BY updated_at ASC"
    )
    .all() as GraduateRequestRow[];
}

// ── Verificación pública (Fase 13) ────────────────────────────────────────

export interface VerifyResult {
  valid: boolean;
  certification: CertificationRow | null;
  auditHistory: AuditRow[];
}

export function verifyCertification(pubkey: string): VerifyResult {
  const certification = getCertificationByPubkey(pubkey);
  if (!certification) return { valid: false, certification: null, auditHistory: [] };
  const auditHistory = getAuditByEntidad(pubkey, 20);
  return {
    valid: certification.estado === "Activa",
    certification,
    auditHistory,
  };
}

// ── Estadísticas generales ────────────────────────────────────────────────

export interface Stats {
  totalPersons: number;
  totalCertifications: number;
  activeCertifications: number;
  revokedCertifications: number;
  totalAuditEntries: number;
  pendingGraduateRequests: number;
}

export function getStats(): Stats {
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    totalPersons: count("SELECT COUNT(*) AS n FROM persons"),
    totalCertifications: count("SELECT COUNT(*) AS n FROM certifications"),
    activeCertifications: count("SELECT COUNT(*) AS n FROM certifications WHERE estado = 'Activa'"),
    revokedCertifications: count("SELECT COUNT(*) AS n FROM certifications WHERE estado = 'Revocada'"),
    totalAuditEntries: count("SELECT COUNT(*) AS n FROM audit_entries"),
    pendingGraduateRequests: count("SELECT COUNT(*) AS n FROM graduate_requests WHERE estado = 'Pendiente'"),
  };
}
