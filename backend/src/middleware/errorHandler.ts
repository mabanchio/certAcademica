import { Request, Response, NextFunction } from "express";

export interface ApiError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  // Express require 4 parámetros para reconocer el middleware de error
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    console.error(
      `[Backend][${req.requestId ?? "no-request-id"}] ${req.method} ${req.originalUrl} -> ${status}`,
      err
    );
  }
  // No exponer detalles internos en producción
  const message =
    status < 500
      ? err.message
      : "Error interno del servidor";

  res.status(status).json({ error: message });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Recurso no encontrado" });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function createError(message: string, statusCode: number): ApiError {
  const err: ApiError = new Error(message);
  err.statusCode = statusCode;
  return err;
}
