import { Request, Response, NextFunction } from "express";
import { createError } from "./errorHandler";

// Valida que un parámetro de paginación sea un entero positivo.
export function parsePagination(req: Request): { limit: number; offset: number } {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  return { limit, offset };
}

// Valida que una cadena luzca como una clave pública de Solana (base58, 32-44 chars).
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function isValidPublicKey(value: string): boolean {
  return BASE58_RE.test(value);
}

// Middleware: valida el parámetro de ruta :pubkey
export function validatePubkeyParam(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const { pubkey } = req.params;
  if (!pubkey || !isValidPublicKey(pubkey)) {
    return next(createError("Clave pública inválida", 400));
  }
  next();
}

// Valida un hash sha256 expresado en hex (64 chars).
const HEX64_RE = /^[0-9a-fA-F]{64}$/;
export function isValidSha256Hex(value: string): boolean {
  return HEX64_RE.test(value);
}

// Valida que el string no supere la longitud máxima (previene consultas abusivas).
export function sanitizeStringParam(value: unknown, maxLen = 100): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  return trimmed;
}

/**
 * Rechaza cualquier campo del body que no esté en la lista de permitidos.
 * Previene ataques de parámetros extra / mass assignment.
 */
export function allowedBodyFields(...fields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === "object") {
      const unexpected = Object.keys(req.body).filter((k) => !fields.includes(k));
      if (unexpected.length > 0) {
        return next(createError(`Campos no permitidos en el cuerpo: ${unexpected.join(", ")}`, 400));
      }
    }
    next();
  };
}
