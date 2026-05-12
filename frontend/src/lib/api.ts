// Cliente HTTP hacia el Backend BFF (Fase 11)

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface Person {
  wallet: string;
  nombre: string | null;
  apellido: string | null;
  dni: string | null;
  status: string | null;
  roles: string[];
  role_data: string | null;
  updated_at: number | null;
}

export interface Certification {
  pubkey: string;
  cert_token: string | null;
  nombre: string | null;
  apellido: string | null;
  carrera: string | null;
  /** Wallet de la universidad emisora */
  universidad_wallet: string;
  status: string;
  anio_egreso: number | null;
  promedio: number | null;
  hash_datos: string | null;
  motivo_revocacion: string | null;
  updated_at: number | null;
}

export interface VerifiedCertification {
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

export interface AuditEntry {
  id: number;
  signature: string;
  actor: string;
  accion: string;
  entidad: string;
  motivo: string | null;
  timestamp: number;
}

export interface VerifyResult {
  valid: boolean;
  certification: VerifiedCertification | null;
  auditHistory: AuditEntry[];
  blockchainVerified: boolean;
  validationErrors: string[];
}

export interface EventRow {
  id: number;
  signature: string;
  slot: number;
  block_time: number | null;
  event_type: string;
  data: string;
}

export interface TokenRequest {
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

export interface GraduateRequest {
  pubkey: string | null;
  wallet: string;
  tipo: string | null;
  estado: string | null;
  pais: string | null;
  pdf_hash: string | null;
  motivo_rechazo: string | null;
  motivo?: string | null;
  updated_at: number | null;
}

export interface CertTokenAvailable {
  cert_token_pubkey: string;
  timestamp: number;
}

export interface SystemStatus {
  initialized: boolean;
  adminWallet: string;
  adminPersonExists: boolean;
  programId: string;
  network: string;
}

export interface Stats {
  totalPersons: number;
  totalCertifications: number;
  activeCertifications: number;
  revokedCertifications: number;
  totalEvents: number;
  totalAuditEntries: number;
  pendingGraduateRequests: number;
}

// ── Llamadas ──────────────────────────────────────────────────────────────

export const api = {
  stats: () =>
    apiFetch<{ data: Stats }>("/stats"),

  // Personas
  getPerson: (wallet: string) =>
    apiFetch<{ data: Person }>(`/persons/${wallet}`),

  getPersons: (limit = 50, offset = 0) =>
    apiFetch<{ data: Person[] }>(`/persons?limit=${limit}&offset=${offset}`),

  getPersonsByRole: (role: string, limit = 50, offset = 0) =>
    apiFetch<{ data: Person[] }>(`/persons/role/${role}?limit=${limit}&offset=${offset}`),

  updatePersonIdentity: (wallet: string, nombre?: string, apellido?: string, dni?: string) =>
    apiFetch<{ data: Person }>(`/persons/${wallet}`, {
      method: "PUT",
      body: JSON.stringify({
        ...(nombre !== undefined && { nombre }),
        ...(apellido !== undefined && { apellido }),
        ...(dni !== undefined && { dni }),
      }),
    }),

  // Certificaciones
  getCertifications: (limit = 50, offset = 0, estado?: string) => {
    const q = estado ? `&estado=${estado}` : "";
    return apiFetch<{ data: Certification[] }>(`/certifications?limit=${limit}&offset=${offset}${q}`);
  },

  getCertification: (pubkey: string) =>
    apiFetch<{ data: Certification }>(`/certifications/${pubkey}`),

  getCertificationsByUniversidad: (wallet: string, limit = 50, offset = 0) =>
    apiFetch<{ data: Certification[] }>(
      `/certifications/universidad/${wallet}?limit=${limit}&offset=${offset}`
    ),

  getTokenRequestsByUniversidad: (wallet: string, limit = 50, offset = 0) =>
    apiFetch<{ data: TokenRequest[] }>(
      `/certifications/universidad/${wallet}/token-requests?limit=${limit}&offset=${offset}`
    ),

  getPendingTokenRequests: (limit = 50, offset = 0) =>
    apiFetch<{ data: TokenRequest[] }>(
      `/certifications/token-requests?estado=Pendiente&limit=${limit}&offset=${offset}`
    ),

  getAvailableCertTokens: (wallet: string) =>
    apiFetch<{ data: CertTokenAvailable[] }>(
      `/certifications/universidad/${wallet}/cert-tokens/available`
    ),

  getGraduateRequestsByStatus: (estado: string, limit = 50, offset = 0) =>
    apiFetch<{ data: GraduateRequest[] }>(
      `/graduate-requests?estado=${encodeURIComponent(estado)}&limit=${limit}&offset=${offset}`
    ),

  getGraduateRequestByWallet: (wallet: string) =>
    apiFetch<{ data: GraduateRequest | null }>(`/graduate-requests/wallet/${wallet}`),

  // Transacciones / auditoría
  getTransactions: (limit = 50, offset = 0, type?: string) => {
    const q = type ? `&type=${type}` : "";
    return apiFetch<{ data: EventRow[] }>(`/transactions?limit=${limit}&offset=${offset}${q}`);
  },

  getTransactionBySignature: (signature: string) =>
    apiFetch<{ data: EventRow[] }>(`/transactions/${signature}`),

  getAuditLog: (limit = 50, offset = 0) =>
    apiFetch<{ data: AuditEntry[] }>(`/transactions/audit?limit=${limit}&offset=${offset}`),

  getAuditByActor: (wallet: string, limit = 50) =>
    apiFetch<{ data: AuditEntry[] }>(`/transactions/audit/actor/${wallet}?limit=${limit}`),

  // Verificación pública
  verify: (pubkey: string, hash?: string) =>
    apiFetch<{ data: VerifyResult }>("/verify", {
      method: "POST",
      body: JSON.stringify({ pubkey, ...(hash ? { hash } : {}) }),
    }),

  verifyGet: (pubkey: string) =>
    apiFetch<{ data: VerifyResult }>(`/verify/${pubkey}`),

  // Estado e inicialización del sistema
  adminStatus: () =>
    apiFetch<{ data: SystemStatus }>("/admin/status"),
};
