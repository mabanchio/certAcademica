/**
 * Tests de integración del backend (supertest).
 *
 * NO se conecta a la base de datos real ni a la RPC de Solana.
 * Se mockean los módulos `db` y `solana` para aislar el HTTP layer.
 */

import request from "supertest";
import { createApp } from "./app";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("./db", () => ({
  getStats: jest.fn(() => ({ persons: 5, certifications: 3 })),
  getAllPersons: jest.fn(() => []),
  getPersonByWallet: jest.fn(() => null),
  getPersonsByRole: jest.fn(() => []),
  getAllCertifications: jest.fn(() => []),
  getCertificationByPubkey: jest.fn(() => null),
  getCertificationsByUniversidad: jest.fn(() => []),
  getCertificationsByEgresadoWallet: jest.fn(() => []),
  getActiveCertifications: jest.fn(() => []),
  getTokenRequestsByUniversidad: jest.fn(() => []),
  getTokenRequestsByStatus: jest.fn(() => []),
  getAvailableCertTokens: jest.fn(() => []),
  getGraduateRequestsByStatus: jest.fn(() => []),
  getGraduateRequestByWallet: jest.fn(() => null),
  getAllEvents: jest.fn(() => []),
  getEventsByType: jest.fn(() => []),
  getEventsBySignature: jest.fn(() => []),
  getAuditLog: jest.fn(() => []),
  getAuditByActor: jest.fn(() => []),
  verifyCertification: jest.fn(async () => ({
    valid: false,
    certification: null,
    auditHistory: [],
    blockchainVerified: false,
    validationErrors: ["La certificación no existe en la base indexada"],
  })),
}));

jest.mock("./solana", () => ({
  fetchOnChainCertification: jest.fn(async () => null),
}));

jest.mock("./adminOnChain", () => ({
  getSystemStatus: jest.fn(async () => ({
    initialized: false,
    adminWallet: "",
    adminPersonExists: false,
    programId: "3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt",
    network: "localnet",
  })),
}));

// ── Setup ─────────────────────────────────────────────────────────────────────

const app = createApp();

// ── /health ───────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  test("retorna 200 con status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.ts).toBe("number");
  });

  test("incluye cabecera X-Request-ID", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  test("incluye cabecera X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

// ── /stats ────────────────────────────────────────────────────────────────────

describe("GET /stats", () => {
  test("retorna 200 con datos de estadísticas", async () => {
    const res = await request(app).get("/stats");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.persons).toBe(5);
  });
});

// ── Ruta inexistente ──────────────────────────────────────────────────────────

describe("Ruta no existente", () => {
  test("retorna 404 con error estructurado", async () => {
    const res = await request(app).get("/ruta-que-no-existe");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

// ── /persons ──────────────────────────────────────────────────────────────────

describe("GET /persons", () => {
  test("retorna 200 con lista vacía", async () => {
    const res = await request(app).get("/persons");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("pagina con limit y offset", async () => {
    const res = await request(app).get("/persons?limit=10&offset=0");
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(0);
  });
});

describe("GET /persons/role/:role", () => {
  test("retorna 200 para rol válido", async () => {
    const res = await request(app).get("/persons/role/Egresado");
    expect(res.status).toBe(200);
  });

  test("retorna 400 para rol no reconocido", async () => {
    const res = await request(app).get("/persons/role/Hacker");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("GET /persons/:pubkey", () => {
  test("retorna 404 cuando la persona no existe", async () => {
    const res = await request(app).get(
      "/persons/Fg6PaFpoGXkYsidMpWxTWqkZkqk7R8M4hFfYjE9C9m6N"
    );
    expect(res.status).toBe(404);
  });

  test("retorna 400 con pubkey inválida", async () => {
    const res = await request(app).get("/persons/clave-invalida-!!!");
    expect(res.status).toBe(400);
  });
});

describe("POST /persons/bootstrap", () => {
  test("retorna 410 porque el preregistro por backend quedó deshabilitado", async () => {
    const res = await request(app)
      .post("/persons/bootstrap")
      .set("Content-Type", "application/json")
      .send({
        wallet: "3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt",
        nombre: "Lucia",
        apellido: "Perez",
        dni: "12345678A",
        roleData: "Universidad Demo",
      });

    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/ruta deshabilitada/i);
  });

  test("mantiene 410 incluso con wallet inválida", async () => {
    const res = await request(app)
      .post("/persons/bootstrap")
      .set("Content-Type", "application/json")
      .send({
        wallet: "wallet-mala",
        nombre: "Lucia",
        apellido: "Perez",
        dni: "12345678A",
      });

    expect(res.status).toBe(410);
  });

  test("retorna 400 con campo extra no permitido", async () => {
    const res = await request(app)
      .post("/persons/bootstrap")
      .set("Content-Type", "application/json")
      .send({
        wallet: "3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt",
        nombre: "Lucia",
        apellido: "Perez",
        dni: "12345678A",
        extra: "no permitido",
      });

    expect(res.status).toBe(400);
  });
});

// ── /certifications ───────────────────────────────────────────────────────────

describe("GET /certifications", () => {
  test("retorna 200 con lista", async () => {
    const res = await request(app).get("/certifications");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("filtra por estado=Activa", async () => {
    const res = await request(app).get("/certifications?estado=Activa");
    expect(res.status).toBe(200);
  });
});

describe("GET /certifications/egresado/:wallet", () => {
  test("devuelve las certificaciones privadas del egresado", async () => {
    const db = require("./db");
    db.getCertificationsByEgresadoWallet.mockReturnValueOnce([
      {
        pubkey: "cert-1",
        cert_token: "token-1",
        nombre: "Marcela",
        apellido: "Aguirre",
        dni: "38944529",
        carrera: "Derecho",
        anio_egreso: 2023,
        universidad: "uni-1",
        estado: "Activa",
        hash_datos: "hash",
        motivo_revocacion: null,
        updated_at: 123,
      },
    ]);

    const res = await request(app).get(
      "/certifications/egresado/Fg6PaFpoGXkYsidMpWxTWqkZkqk7R8M4hFfYjE9C9m6N"
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].dni).toBe("38944529");
  });
});

describe("GET /certifications/:pubkey", () => {
  test("retorna 404 cuando no existe", async () => {
    const res = await request(app).get(
      "/certifications/Fg6PaFpoGXkYsidMpWxTWqkZkqk7R8M4hFfYjE9C9m6N"
    );
    expect(res.status).toBe(404);
  });

  test("retorna 400 con pubkey inválida", async () => {
    const res = await request(app).get("/certifications/INVALID_KEY!!!");
    expect(res.status).toBe(400);
  });
});

// ── /verify ───────────────────────────────────────────────────────────────────

describe("POST /verify", () => {
  const VALID_PUBKEY = "Fg6PaFpoGXkYsidMpWxTWqkZkqk7R8M4hFfYjE9C9m6N";
  const VALID_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  test("retorna 400 cuando falta pubkey", async () => {
    const res = await request(app)
      .post("/verify")
      .set("Content-Type", "application/json")
      .send({});
    expect(res.status).toBe(400);
  });

  test("retorna 400 con pubkey inválida", async () => {
    const res = await request(app)
      .post("/verify")
      .set("Content-Type", "application/json")
      .send({ pubkey: "no-valida" });
    expect(res.status).toBe(400);
  });

  test("retorna 400 con hash inválido (no SHA-256 hex)", async () => {
    const res = await request(app)
      .post("/verify")
      .set("Content-Type", "application/json")
      .send({ pubkey: VALID_PUBKEY, hash: "no-es-hex" });
    expect(res.status).toBe(400);
  });

  test("retorna 400 con campo extra no permitido", async () => {
    const res = await request(app)
      .post("/verify")
      .set("Content-Type", "application/json")
      .send({ pubkey: VALID_PUBKEY, extra: "campo_malicioso" });
    expect(res.status).toBe(400);
  });

  test("retorna 415 si Content-Type no es application/json", async () => {
    const res = await request(app)
      .post("/verify")
      .set("Content-Type", "text/plain")
      .send("pubkey=abc");
    expect(res.status).toBe(415);
  });

  test("retorna 200 con resultado de verificación válido (cert no encontrada)", async () => {
    const res = await request(app)
      .post("/verify")
      .set("Content-Type", "application/json")
      .send({ pubkey: VALID_PUBKEY });
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.blockchainVerified).toBe(false);
    expect(Array.isArray(res.body.data.validationErrors)).toBe(true);
  });

  test("acepta hash SHA-256 válido", async () => {
    const res = await request(app)
      .post("/verify")
      .set("Content-Type", "application/json")
      .send({ pubkey: VALID_PUBKEY, hash: VALID_HASH });
    expect(res.status).toBe(200);
  });
});

describe("GET /verify/:pubkey", () => {
  test("retorna 404 cuando la cert no existe", async () => {
    const res = await request(app).get(
      "/verify/Fg6PaFpoGXkYsidMpWxTWqkZkqk7R8M4hFfYjE9C9m6N"
    );
    expect(res.status).toBe(404);
  });

  test("retorna 400 con pubkey inválida", async () => {
    const res = await request(app).get("/verify/CLAVE!!MALA");
    expect(res.status).toBe(400);
  });
});

// ── Seguridad: cabeceras ──────────────────────────────────────────────────────

describe("Cabeceras de seguridad", () => {
  test("no expone X-Powered-By", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  test("incluye X-Frame-Options: DENY o SAMEORIGIN", async () => {
    const res = await request(app).get("/health");
    const xfo = res.headers["x-frame-options"];
    expect(xfo).toBeDefined();
    expect(["DENY", "SAMEORIGIN"]).toContain(xfo?.toUpperCase());
  });

  test("CORS: no incluye Access-Control-Allow-Origin para origen desconocido", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://malicious.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("CORS preflight OPTIONS retorna 204 para origen permitido", async () => {
    const res = await request(app)
      .options("/health")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});
