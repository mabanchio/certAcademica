// Tipos de eventos emitidos por el programa academic_certification.
// Coinciden 1:1 con los #[event] definidos en lib.rs.

export type Role = "Admin" | "Universidad" | "Ministerio" | "Cancilleria" | "Egresado";
export type PersonStatus = "Activo" | "Inactivo";
export type GraduateType = "Local" | "Extranjero";
export type GraduateRequestStatus =
  | "Pendiente"
  | "AprobadoLocal"
  | "AprobadoExtranjero"
  | "Rechazado"
  | "DerivadoCancilleria";
export type AuditAction =
  | "Initialize"
  | "RegisterPerson"
  | "RequestRole"
  | "ApproveRole"
  | "RejectRole"
  | "SetStatus"
  | "RequestTokens"
  | "ApproveTokenRequest"
  | "RejectTokenRequest"
  | "MintToken"
  | "AssignToken"
  | "RequestCertification"
  | "ApproveLocal"
  | "RejectRequest"
  | "DeriveCancilleria"
  | "ApproveForeign"
  | "RejectForeign"
  | "RevokeCertification"
  | "UpdatePerson"
  | "CreateAuditLog";

export interface RoleRequestedEvent {
  requester: string;
  requestedRole: Role;
  timestamp: bigint;
}

export interface RoleApprovedEvent {
  requester: string;
  approvedRole: Role;
  approver: string;
  timestamp: bigint;
}

export interface RoleRejectedEvent {
  requester: string;
  rejectedRole: Role;
  approver: string;
  reason: string;
  timestamp: bigint;
}

export interface StatusChangedEvent {
  person: string;
  changedBy: string;
  status: PersonStatus;
  reason: string;
  timestamp: bigint;
}

export interface PersonUpdatedEvent {
  wallet: string;
  nombre: string;
  apellido: string;
  dni: string;
  status: PersonStatus;
  roles: Role[];
  roleData: string;
  updatedBy: string;
  timestamp: bigint;
}

export interface TokenRequestedEvent {
  universidad: string;
  solicitante: string;
  carrera: string;
  cantidad: number;
  timestamp: bigint;
}

export interface TokenRequestApprovedEvent {
  universidad: string;
  solicitante: string;
  cantidad: number;
  approver: string;
  timestamp: bigint;
}

export interface TokenRequestRejectedEvent {
  universidad: string;
  solicitante: string;
  rejector: string;
  reason: string;
  timestamp: bigint;
}

export interface TokenMintedEvent {
  certToken: string;
  universidad: string;
  carrera: string;
  index: number;
  timestamp: bigint;
}

export interface TokenAssignedEvent {
  certification: string;
  certToken: string;
  universidad: string;
  carrera: string;
  timestamp: bigint;
}

export interface CertificationRequestedEvent {
  graduateRequest: string;
  wallet: string;
  tipo: GraduateType;
  timestamp: bigint;
}

export interface GraduateRequestResolvedEvent {
  graduateRequest: string;
  resolver: string;
  nuevoEstado: GraduateRequestStatus;
  motivo: string;
  timestamp: bigint;
}

export interface CertificationRevokedEvent {
  certification: string;
  revokedBy: string;
  motivo: string;
  timestamp: bigint;
}

export interface AuditLogEvent {
  actor: string;
  accion: AuditAction;
  entidad: string;
  motivo: string;
  timestamp: bigint;
}

export type ProgramEvent =
  | { name: "RoleRequestedEvent"; data: RoleRequestedEvent }
  | { name: "RoleApprovedEvent"; data: RoleApprovedEvent }
  | { name: "RoleRejectedEvent"; data: RoleRejectedEvent }
  | { name: "StatusChangedEvent"; data: StatusChangedEvent }
  | { name: "PersonUpdatedEvent"; data: PersonUpdatedEvent }
  | { name: "TokenRequestedEvent"; data: TokenRequestedEvent }
  | { name: "TokenRequestApprovedEvent"; data: TokenRequestApprovedEvent }
  | { name: "TokenRequestRejectedEvent"; data: TokenRequestRejectedEvent }
  | { name: "TokenMintedEvent"; data: TokenMintedEvent }
  | { name: "TokenAssignedEvent"; data: TokenAssignedEvent }
  | { name: "CertificationRequestedEvent"; data: CertificationRequestedEvent }
  | { name: "GraduateRequestResolvedEvent"; data: GraduateRequestResolvedEvent }
  | { name: "CertificationRevokedEvent"; data: CertificationRevokedEvent }
  | { name: "AuditLogEvent"; data: AuditLogEvent };
