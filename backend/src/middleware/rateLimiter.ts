import rateLimit from "express-rate-limit";
import { config } from "../config";

function clientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(",")[0] ?? req.ip ?? "unknown");
  return raw.trim();
}

function isLocalIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function skipLocal(req: import("express").Request): boolean {
  return isLocalIp(clientIp(req));
}

// Rate limiter general para todos los endpoints
export const generalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intente más tarde." },
  keyGenerator: clientIp,
  skip: skipLocal,
});

// Rate limiter más estricto para el endpoint de verificación pública
export const verifyLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: Math.floor(config.rateLimitMax / 2),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes de verificación. Intente más tarde." },
  keyGenerator: clientIp,
  skip: skipLocal,
});

// Rate limiter muy estricto para rutas de datos sensibles por pubkey individual
export const strictLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: Math.floor(config.rateLimitMax / 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Límite de consultas alcanzado. Intente más tarde." },
  keyGenerator: clientIp,
  skip: skipLocal,
});
