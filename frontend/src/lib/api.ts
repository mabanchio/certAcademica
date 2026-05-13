// Cliente HTTP hacia el Backend BFF (Fase 11)

export const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const defaultHeaders: Record<string, string> =
    method === "GET" || method === "HEAD"
      ? {}
      : { "Content-Type": "application/json" };

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...defaultHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
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
  dni: string | null;
  carrera: string | null;
  anio_egreso: number | null;
  /** Wallet de la universidad emisora */
  universidad: string | null;
  estado: string | null;
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
  universidadNombre: string | null;
}

export interface VerifySearchParams {
  nombre?: string;
  apellido?: string;
  dni?: string;
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
  pdf_url: string | null;
  pdf_file_name: string | null;
  pdf_uploaded_at: number | null;
  titulo_nombre: string | null;
  titulo_carrera: string | null;
  titulo_institucion: string | null;
  titulo_anio: number | null;
  titulo_pais: string | null;
  titulo_observaciones: string | null;
  ministerio_derivador_wallet: string | null;
  ministerio_derivador_nombre: string | null;
  ministerio_derivador_apellido: string | null;
  motivo_rechazo: string | null;
  motivo?: string | null;
  updated_at: number | null;
}

export interface UploadGraduateRequestDocumentPayload {
  wallet: string;
  pdf_base64: string;
  pdf_hash: string;
  file_name: string;
  mime_type: string;
  titulo_nombre: string;
  titulo_carrera: string;
  titulo_institucion: string;
  titulo_anio: number;
  titulo_pais: string;
  titulo_observaciones: string;
}

export interface CertTokenAvailable {
  cert_token_pubkey: string;
  timestamp: number;
  token_request: string | null;
  carrera: string | null;
  index: number | null;
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

  getPersonByWallet: (wallet: string) =>
    apiFetch<{ data: Person | null }>(`/persons/${wallet}`),

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

  getCertificationsByEgresado: (wallet: string, limit = 50, offset = 0) =>
    apiFetch<{ data: Certification[] }>(
      `/certifications/egresado/${wallet}?limit=${limit}&offset=${offset}`
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

  getGraduateRequestByPubkey: (pubkey: string) =>
    apiFetch<{ data: GraduateRequest | null }>(`/graduate-requests/pubkey/${pubkey}`),

  uploadGraduateRequestDocument: (payload: UploadGraduateRequestDocumentPayload) =>
    apiFetch<{ data: GraduateRequest | null }>("/graduate-requests/documents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

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

  verifySearch: (params: VerifySearchParams) => {
    const q = new URLSearchParams();
    if (params.nombre?.trim()) q.set("nombre", params.nombre.trim());
    if (params.apellido?.trim()) q.set("apellido", params.apellido.trim());
    if (params.dni?.trim()) q.set("dni", params.dni.trim());
    return apiFetch<{ data: Certification[] }>(`/verify/search?${q.toString()}`);
  },

  // Estado e inicialización del sistema
  adminStatus: () =>
    apiFetch<{ data: SystemStatus }>("/admin/status"),
};
