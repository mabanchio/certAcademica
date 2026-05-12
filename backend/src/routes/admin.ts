import { Router } from "express";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { allowedBodyFields } from "../middleware/validation";
import { generalLimiter, strictLimiter } from "../middleware/rateLimiter";
import { getSystemStatus } from "../adminOnChain";

const router = Router();

/**
 * GET /admin/status
 * Devuelve si el programa Solana está inicializado on-chain y datos relevantes.
 * No requiere autenticación — solo informa el estado público del sistema.
 */
router.get(
  "/status",
  generalLimiter,
  asyncHandler(async (_req, res) => {
    const status = await getSystemStatus();
    res.json({ data: status });
  })
);

/**
 * POST /admin/initialize
 * Deshabilitado: la inicialización debe firmarse desde la wallet conectada en frontend.
 */
router.post(
  "/initialize",
  strictLimiter,
  allowedBodyFields("nombre", "apellido", "dni"),
  asyncHandler(async (_req, _res, next) => {
    return next(
      createError(
        "Ruta deshabilitada: la inicialización del sistema debe firmarse desde la wallet del navegador que quedará como admin.",
        410
      )
    );
  })
);

export default router;
