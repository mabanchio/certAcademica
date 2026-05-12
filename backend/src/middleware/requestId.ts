import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";

// Extiende el tipo de Request para incluir el ID de correlación
declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
  }
}

/**
 * Asigna un ID único (UUID v4) a cada request entrante.
 * Lo expone en la cabecera X-Request-ID de la respuesta para facilitar
 * el rastreo en logs.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const id = randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}
