import { Router } from "express";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { parsePagination, isValidPublicKey } from "../middleware/validation";
import {
  getGraduateRequestsByStatus,
  getGraduateRequestByWallet,
} from "../db";

const router = Router();

const VALID_ESTADOS = new Set([
  "Pendiente",
  "AprobadoLocal",
  "AprobadoExtranjero",
  "Rechazado",
  "DerivadoCancilleria",
]);

// GET /graduate-requests?estado=Pendiente|DerivadoCancilleria|...
router.get(
  "/",
  asyncHandler(async (req, res, next) => {
    const { limit, offset } = parsePagination(req);
    const estado = req.query.estado as string | undefined;
    if (!estado || !VALID_ESTADOS.has(estado)) {
      return next(createError("Parámetro 'estado' requerido y válido", 400));
    }
    const rows = getGraduateRequestsByStatus(estado, limit, offset);
    res.json({ data: rows, limit, offset });
  })
);

// GET /graduate-requests/wallet/:wallet — solicitud del egresado
router.get(
  "/wallet/:wallet",
  asyncHandler(async (req, res, next) => {
    const { wallet } = req.params;
    if (!isValidPublicKey(wallet)) return next(createError("Clave pública inválida", 400));
    const row = getGraduateRequestByWallet(wallet);
    res.json({ data: row });
  })
);

export default router;
