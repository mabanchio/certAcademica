import { Router } from "express";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { parsePagination, isValidPublicKey, sanitizeStringParam } from "../middleware/validation";
import { getAllEvents, getEventsByType, getEventsBySignature, getAuditLog, getAuditByActor } from "../db";

const router = Router();

const VALID_EVENT_TYPES = new Set([
  "RoleRequestedEvent", "RoleApprovedEvent", "RoleRejectedEvent",
  "StatusChangedEvent", "TokenRequestedEvent", "TokenRequestApprovedEvent",
  "TokenRequestRejectedEvent", "TokenMintedEvent", "TokenAssignedEvent",
  "CertificationRequestedEvent", "GraduateRequestResolvedEvent",
  "CertificationRevokedEvent", "AuditLogEvent",
]);

// GET /transactions — todos los eventos indexados, paginados
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const type = sanitizeStringParam(req.query.type, 60);

    if (type) {
      if (!VALID_EVENT_TYPES.has(type)) {
        return res.status(400).json({ error: "Tipo de evento no reconocido" });
      }
      return res.json({ data: getEventsByType(type, limit, offset), limit, offset });
    }

    res.json({ data: getAllEvents(limit, offset), limit, offset });
  })
);

// GET /transactions/audit — log de auditoría
router.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    res.json({ data: getAuditLog(limit, offset), limit, offset });
  })
);

// GET /transactions/audit/actor/:wallet — auditoría por actor
router.get(
  "/audit/actor/:wallet",
  asyncHandler(async (req, res, next) => {
    const { wallet } = req.params;
    if (!isValidPublicKey(wallet)) return next(createError("Clave pública inválida", 400));
    const { limit } = parsePagination(req);
    res.json({ data: getAuditByActor(wallet, limit) });
  })
);

// GET /transactions/:signature — eventos de una transacción concreta
router.get(
  "/:signature",
  asyncHandler(async (req, res, next) => {
    const sig = sanitizeStringParam(req.params.signature, 90);
    if (!sig) return next(createError("Firma inválida", 400));
    // Las firmas de Solana son base58 de 87-88 caracteres
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(sig)) {
      return next(createError("Formato de firma inválido", 400));
    }
    const events = getEventsBySignature(sig);
    if (events.length === 0) return next(createError("Transacción no encontrada", 404));
    res.json({ data: events });
  })
);

export default router;
