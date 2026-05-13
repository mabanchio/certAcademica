import "dotenv/config";
import express, { Request, Response } from "express";
import helmet from "helmet";
import { config } from "./config";
import { generalLimiter } from "./middleware/rateLimiter";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { securityLogger } from "./middleware/securityLogger";
import personsRouter from "./routes/persons";
import certificationsRouter from "./routes/certifications";
import transactionsRouter from "./routes/transactions";
import verifyRouter from "./routes/verify";
import adminRouter from "./routes/admin";
import graduateRequestsRouter from "./routes/graduateRequests";
import { getStats } from "./db";

export function createApp(): express.Application {
  const app = express();

  // ── Correlación de requests ───────────────────────────────────────────
  app.use(requestIdMiddleware);

  // ── Logging de seguridad ──────────────────────────────────────────────
  app.use(securityLogger);

  // ── Cabeceras de seguridad HTTP (OWASP) ───────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          imgSrc: ["'none'"],
          connectSrc: ["'none'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      xssFilter: true,
      frameguard: { action: "deny" },
    })
  );

  // CORS manual (sin dependencia extra)
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? "";
    if (config.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Request-ID");
      res.setHeader("Access-Control-Expose-Headers", "X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Rechaza Content-Type inesperado en rutas POST con cuerpo
  app.use((req: Request, res: Response, next) => {
    if (req.method === "POST") {
      const ct = req.headers["content-type"] ?? "";
      if (!ct.startsWith("application/json")) {
        res.status(415).json({ error: "Content-Type debe ser application/json" });
        return;
      }
    }
    next();
  });

  app.use(express.json({ limit: "20mb" }));

  // Desactiva la cabecera X-Powered-By
  app.disable("x-powered-by");

  // Trust proxy solo en producción (necesario para rate limit por IP real)
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  // ── Rate limiting global ──────────────────────────────────────────────
  app.use(generalLimiter);

  // ── Rutas ─────────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  app.get("/stats", (_req: Request, res: Response) => {
    try {
      res.json({ data: getStats() });
    } catch {
      res.status(503).json({ error: "Base de datos no disponible" });
    }
  });

  app.use("/persons", personsRouter);
  app.use("/certifications", certificationsRouter);
  app.use("/transactions", transactionsRouter);
  app.use("/verify", verifyRouter);
  app.use("/admin", adminRouter);
  app.use("/graduate-requests", graduateRequestsRouter);

  // ── Errores ───────────────────────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
