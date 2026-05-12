// IDL mínimo del programa academic_certification, usado por Anchor EventParser
// para decodificar los eventos emitidos en los logs de transacciones.
// Se genera automáticamente con `anchor build`; este archivo es el fallback
// que permite que el indexador funcione incluso sin haber compilado el programa.

export const IDL = {
  version: "0.1.0",
  name: "academic_certification",
  instructions: [],
  accounts: [],
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
        variants: [{ name: "Activo" }, { name: "Inactivo" }],
      },
    },
    {
      name: "GraduateType",
      type: {
        kind: "enum",
        variants: [{ name: "Local" }, { name: "Extranjero" }],
      },
    },
    {
      name: "GraduateRequestStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Pendiente" },
          { name: "AprobadoLocal" },
          { name: "AprobadoExtranjero" },
          { name: "Rechazado" },
          { name: "DerivadoCancilleria" },
        ],
      },
    },
    {
      name: "AuditAction",
      type: {
        kind: "enum",
        variants: [
          { name: "Initialize" },
          { name: "RegisterPerson" },
          { name: "RequestRole" },
          { name: "ApproveRole" },
          { name: "RejectRole" },
          { name: "SetStatus" },
          { name: "RequestTokens" },
          { name: "ApproveTokenRequest" },
          { name: "RejectTokenRequest" },
          { name: "MintToken" },
          { name: "AssignToken" },
          { name: "RequestCertification" },
          { name: "ApproveLocal" },
          { name: "RejectRequest" },
          { name: "DeriveCancilleria" },
          { name: "ApproveForeign" },
          { name: "RejectForeign" },
          { name: "RevokeCertification" },
          { name: "UpdatePerson" },
          { name: "CreateAuditLog" },
        ],
      },
    },
  ],
  events: [
    {
      name: "RoleRequestedEvent",
      fields: [
        { name: "requester", type: "publicKey", index: false },
        { name: "requestedRole", type: { defined: "Role" }, index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "RoleApprovedEvent",
      fields: [
        { name: "requester", type: "publicKey", index: false },
        { name: "approvedRole", type: { defined: "Role" }, index: false },
        { name: "approver", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "RoleRejectedEvent",
      fields: [
        { name: "requester", type: "publicKey", index: false },
        { name: "rejectedRole", type: { defined: "Role" }, index: false },
        { name: "approver", type: "publicKey", index: false },
        { name: "reason", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "StatusChangedEvent",
      fields: [
        { name: "person", type: "publicKey", index: false },
        { name: "changedBy", type: "publicKey", index: false },
        { name: "status", type: { defined: "PersonStatus" }, index: false },
        { name: "reason", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "PersonUpdatedEvent",
      fields: [
        { name: "wallet", type: "publicKey", index: false },
        { name: "nombre", type: "string", index: false },
        { name: "apellido", type: "string", index: false },
        { name: "dni", type: "string", index: false },
        { name: "status", type: { defined: "PersonStatus" }, index: false },
        { name: "roles", type: { vec: { defined: "Role" } }, index: false },
        { name: "roleData", type: "string", index: false },
        { name: "updatedBy", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "TokenRequestedEvent",
      fields: [
        { name: "universidad", type: "publicKey", index: false },
        { name: "solicitante", type: "publicKey", index: false },
        { name: "carrera", type: "string", index: false },
        { name: "cantidad", type: "u32", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "TokenRequestApprovedEvent",
      fields: [
        { name: "universidad", type: "publicKey", index: false },
        { name: "solicitante", type: "publicKey", index: false },
        { name: "cantidad", type: "u32", index: false },
        { name: "approver", type: "publicKey", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "TokenRequestRejectedEvent",
      fields: [
        { name: "universidad", type: "publicKey", index: false },
        { name: "solicitante", type: "publicKey", index: false },
        { name: "rejector", type: "publicKey", index: false },
        { name: "reason", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "TokenMintedEvent",
      fields: [
        { name: "certToken", type: "publicKey", index: false },
        { name: "universidad", type: "publicKey", index: false },
        { name: "carrera", type: "string", index: false },
        { name: "index", type: "u32", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "TokenAssignedEvent",
      fields: [
        { name: "certification", type: "publicKey", index: false },
        { name: "certToken", type: "publicKey", index: false },
        { name: "universidad", type: "publicKey", index: false },
        { name: "carrera", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "CertificationRequestedEvent",
      fields: [
        { name: "graduateRequest", type: "publicKey", index: false },
        { name: "wallet", type: "publicKey", index: false },
        { name: "tipo", type: { defined: "GraduateType" }, index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "GraduateRequestResolvedEvent",
      fields: [
        { name: "graduateRequest", type: "publicKey", index: false },
        { name: "resolver", type: "publicKey", index: false },
        { name: "nuevoEstado", type: { defined: "GraduateRequestStatus" }, index: false },
        { name: "motivo", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "CertificationRevokedEvent",
      fields: [
        { name: "certification", type: "publicKey", index: false },
        { name: "revokedBy", type: "publicKey", index: false },
        { name: "motivo", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
    {
      name: "AuditLogEvent",
      fields: [
        { name: "actor", type: "publicKey", index: false },
        { name: "accion", type: { defined: "AuditAction" }, index: false },
        { name: "entidad", type: "publicKey", index: false },
        { name: "motivo", type: "string", index: false },
        { name: "timestamp", type: "i64", index: false },
      ],
    },
  ],
  errors: [],
} as const;
