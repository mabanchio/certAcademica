import { Router } from "express";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { parsePagination, isValidPublicKey, sanitizeStringParam } from "../middleware/validation";
import { generalLimiter, strictLimiter } from "../middleware/rateLimiter";
import {
  getAllCertifications,
  getCertificationByPubkey,
  getCertificationsByUniversidad,
  getActiveCertifications,
  getTokenRequestsByUniversidad,
  getTokenRequestsByStatus,
  getAvailableCertTokens,
} from "../db";

const router = Router();

// GET /certifications — listado paginado (todas)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req);
    const { estado } = req.query;
    if (estado === "Activa") {
      return res.json({ data: getActiveCertifications(limit, offset), limit, offset });
    }
    res.json({ data: getAllCertifications(limit, offset), limit, offset });
  })
);

// GET /certifications/universidad/:wallet/token-requests — solicitudes de tokens por institución
// GET /certifications/token-requests?estado=Pendiente — solicitudes de tokens globales
router.get(
  "/token-requests",
  asyncHandler(async (req, res, next) => {
    const { limit, offset } = parsePagination(req);
    const estado = req.query.estado as string | undefined;
    if (!estado) return next(createError("Parámetro 'estado' requerido", 400));
    const rows = getTokenRequestsByStatus(estado, limit, offset);
    res.json({ data: rows, limit, offset });
  })
);

router.get(
  "/universidad/:wallet/token-requests",
  asyncHandler(async (req, res, next) => {
    const { wallet } = req.params;
    if (!isValidPublicKey(wallet)) return next(createError("Clave pública inválida", 400));
    const { limit, offset } = parsePagination(req);
    const rows = getTokenRequestsByUniversidad(wallet, limit, offset);
    res.json({ data: rows, limit, offset });
  })
);

// GET /certifications/universidad/:wallet — por institución
// GET /certifications/universidad/:wallet/cert-tokens/available — tokens acuñados sin asignar
router.get(
  "/universidad/:wallet/cert-tokens/available",
  asyncHandler(async (req, res, next) => {
    const { wallet } = req.params;
    if (!isValidPublicKey(wallet)) return next(createError("Clave pública inválida", 400));
    const tokens = getAvailableCertTokens(wallet);
    res.json({ data: tokens });
  })
);

router.get(
  "/universidad/:wallet",
  asyncHandler(async (req, res, next) => {
    const { wallet } = req.params;
    if (!isValidPublicKey(wallet)) return next(createError("Clave pública inválida", 400));
    const { limit, offset } = parsePagination(req);
    const certs = getCertificationsByUniversidad(wallet, limit, offset);
    res.json({ data: certs, limit, offset });
  })
);

// GET /certifications/:pubkey — detalle de una certificación
router.get(
  "/:pubkey",
  generalLimiter,
  asyncHandler(async (req, res, next) => {
    const { pubkey } = req.params;
    if (!isValidPublicKey(pubkey)) return next(createError("Clave pública inválida", 400));
    const cert = getCertificationByPubkey(pubkey);
    if (!cert) return next(createError("Certificación no encontrada", 404));
    res.json({ data: cert });
  })
);

export default router;
