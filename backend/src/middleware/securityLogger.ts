import { Request, Response, NextFunction } from "express";

type LogLevel = "INFO" | "WARN" | "ERROR";

interface SecurityEvent {
  ts: string;
  requestId: string;
  method: string;
  path: string;
  ip: string;
  status: number;
  durationMs: number;
  level: LogLevel;
  msg: string;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(",")[0] ?? req.ip ?? "unknown");
  return raw.trim();
}

function levelForStatus(status: number): LogLevel {
  if (status >= 500) return "ERROR";
  if (status >= 400) return "WARN";
  return "INFO";
}

function msgForStatus(status: number): string {
  switch (status) {
    case 400: return "Solicitud inválida";
    case 401: return "No autenticado";
    case 403: return "Acceso denegado";
    case 404: return "Recurso no encontrado";
    case 429: return "Rate limit excedido";
    default:
      if (status >= 500) return "Error interno";
      return "OK";
  }
}

/**
 * Middleware de logging de seguridad estructurado.
 * Registra todas las peticiones en JSON por stdout.
 * Para 4xx/5xx incluye nivel WARN/ERROR para facilitar alertas.
 */
export function securityLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const status = res.statusCode;
    const level = levelForStatus(status);

    // Solo loguea INFO en modo verbose (evita spam en producción)
    if (level === "INFO" && process.env.NODE_ENV === "production") {
      return;
    }

    const event: SecurityEvent = {
      ts: new Date().toISOString(),
      requestId: req.requestId ?? "unknown",
      method: req.method,
      path: req.path,
      ip: getClientIp(req),
      status,
      durationMs: Date.now() - start,
      level,
      msg: msgForStatus(status),
    };

    const line = JSON.stringify(event);

    if (level === "ERROR") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  });

  next();
}
