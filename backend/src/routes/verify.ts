import { Router } from "express";
import { verifyLimiter } from "../middleware/rateLimiter";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { isValidPublicKey, isValidSha256Hex, allowedBodyFields } from "../middleware/validation";
import { verifyCertification } from "../db";

const router = Router();

// POST /verify — verifica la autenticidad de una certificación
//
// Body: { pubkey: string, hash?: string }
//   pubkey — dirección on-chain de la cuenta Certification
//   hash   — sha256 hex del PDF (opcional; si se envía se compara contra hash_datos)
//
// La respuesta no incluye DNI en el campo certification para proteger datos sensibles;
// el campo dni se oculta para consultas no autorizadas.
router.post(
  "/",
  verifyLimiter,
  allowedBodyFields("pubkey", "hash"),
  asyncHandler(async (req, res, next) => {
    const body = req.body as Record<string, unknown>;

    const pubkey = typeof body.pubkey === "string" ? body.pubkey.trim() : "";
    if (!pubkey || !isValidPublicKey(pubkey)) {
      return next(createError("Campo 'pubkey' inválido o ausente", 400));
    }

    let expectedHash: string | undefined;
    if (body.hash !== undefined) {
      const hash = typeof body.hash === "string" ? body.hash.trim().toLowerCase() : "";
      if (!isValidSha256Hex(hash)) {
        return next(createError("Campo 'hash' debe ser un SHA-256 hexadecimal (64 caracteres)", 400));
      }
      expectedHash = hash;
    }

    const result = await verifyCertification(pubkey, expectedHash);

    // Ocultar DNI en la respuesta pública
    if (result.certification) {
      const certObj = result.certification as unknown as Record<string, unknown>;
      const { ...certSafe } = certObj;
      delete certSafe.dni;
      return res.json({ data: { ...result, certification: certSafe } });
    }

    res.json({ data: result });
  })
);

// GET /verify/:pubkey — verificación rápida solo por clave (sin hash)
router.get(
  "/:pubkey",
  verifyLimiter,
  asyncHandler(async (req, res, next) => {
    const { pubkey } = req.params;
    if (!isValidPublicKey(pubkey)) return next(createError("Clave pública inválida", 400));

    const result = await verifyCertification(pubkey);

    if (!result.certification) return next(createError("Certificación no encontrada", 404));

    const certObj2 = result.certification as unknown as Record<string, unknown>;
    const { ...certSafe } = certObj2;
    delete certSafe.dni;
    res.json({ data: { ...result, certification: certSafe } });
  })
);

export default router;
