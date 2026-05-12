import {
  isValidPublicKey,
  isValidSha256Hex,
  sanitizeStringParam,
  parsePagination,
  allowedBodyFields,
} from "../middleware/validation";
import type { Request, Response, NextFunction } from "express";

// ── isValidPublicKey ──────────────────────────────────────────────────────────

describe("isValidPublicKey", () => {
  const VALID_KEYS = [
    "Fg6PaFpoGXkYsidMpWxTWqkZkqk7R8M4hFfYjE9C9m6N", // 44 chars
    "11111111111111111111111111111111",               // 32 chars (mínimo)
    "So11111111111111111111111111111111111111112",     // 43 chars
  ];
  const INVALID_KEYS = [
    "",
    "abc",                              // demasiado corto
    "0OIl" + "a".repeat(40),           // caracteres inválidos base58
    "a".repeat(45),                    // demasiado largo
    "Fg6PaFpoGXkYsidMpWxTWqkZkqk7R8M4hFfYjE9C9m6N!", // símbolo inválido
  ];

  test.each(VALID_KEYS)("acepta clave válida: %s", (key) => {
    expect(isValidPublicKey(key)).toBe(true);
  });

  test.each(INVALID_KEYS)("rechaza clave inválida: '%s'", (key) => {
    expect(isValidPublicKey(key)).toBe(false);
  });
});

// ── isValidSha256Hex ──────────────────────────────────────────────────────────

describe("isValidSha256Hex", () => {
  test("acepta SHA-256 hex válido (minúsculas)", () => {
    const h = "a".repeat(64);
    expect(isValidSha256Hex(h)).toBe(true);
  });

  test("acepta SHA-256 hex válido (mayúsculas)", () => {
    const h = "A".repeat(64);
    expect(isValidSha256Hex(h)).toBe(true);
  });

  test("acepta hash mixto válido", () => {
    expect(isValidSha256Hex("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(true);
  });

  test("rechaza string de 63 chars", () => {
    expect(isValidSha256Hex("a".repeat(63))).toBe(false);
  });

  test("rechaza string de 65 chars", () => {
    expect(isValidSha256Hex("a".repeat(65))).toBe(false);
  });

  test("rechaza caracteres no hexadecimales", () => {
    expect(isValidSha256Hex("g".repeat(64))).toBe(false);
  });

  test("rechaza string vacío", () => {
    expect(isValidSha256Hex("")).toBe(false);
  });
});

// ── sanitizeStringParam ───────────────────────────────────────────────────────

describe("sanitizeStringParam", () => {
  test("retorna string recortado", () => {
    expect(sanitizeStringParam("  hola  ")).toBe("hola");
  });

  test("retorna null si no es string", () => {
    expect(sanitizeStringParam(123)).toBeNull();
    expect(sanitizeStringParam(null)).toBeNull();
    expect(sanitizeStringParam(undefined)).toBeNull();
  });

  test("retorna null si vacío tras trim", () => {
    expect(sanitizeStringParam("   ")).toBeNull();
  });

  test("retorna null si excede maxLen", () => {
    expect(sanitizeStringParam("a".repeat(101))).toBeNull();
    expect(sanitizeStringParam("a".repeat(101), 100)).toBeNull();
  });

  test("acepta string con longitud exactamente maxLen", () => {
    expect(sanitizeStringParam("a".repeat(100))).toBe("a".repeat(100));
  });

  test("acepta maxLen personalizado", () => {
    expect(sanitizeStringParam("abc", 3)).toBe("abc");
    expect(sanitizeStringParam("abcd", 3)).toBeNull();
  });
});

// ── parsePagination ───────────────────────────────────────────────────────────

describe("parsePagination", () => {
  function makeReq(query: Record<string, string>): Request {
    return { query } as unknown as Request;
  }

  test("usa valores por defecto cuando no hay query", () => {
    const { limit, offset } = parsePagination(makeReq({}));
    expect(limit).toBe(50);
    expect(offset).toBe(0);
  });

  test("parsea limit y offset correctamente", () => {
    const { limit, offset } = parsePagination(makeReq({ limit: "20", offset: "10" }));
    expect(limit).toBe(20);
    expect(offset).toBe(10);
  });

  test("limita el máximo de limit a 200", () => {
    const { limit } = parsePagination(makeReq({ limit: "999" }));
    expect(limit).toBe(200);
  });

  test("offset nunca es negativo", () => {
    const { offset } = parsePagination(makeReq({ offset: "-5" }));
    expect(offset).toBe(0);
  });

  test("valores no numéricos usan valor por defecto", () => {
    const { limit, offset } = parsePagination(makeReq({ limit: "abc", offset: "xyz" }));
    expect(limit).toBe(50);
    expect(offset).toBe(0);
  });
});

// ── allowedBodyFields ─────────────────────────────────────────────────────────

describe("allowedBodyFields", () => {
  function runMiddleware(
    middleware: (req: Request, res: Response, next: NextFunction) => void,
    body: Record<string, unknown>
  ): Promise<{ status?: number; json?: unknown; next: boolean }> {
    return new Promise((resolve) => {
      const req = { body } as unknown as Request;
      const res = {
        status(s: number) { return { json: (j: unknown) => resolve({ status: s, json: j, next: false }) }; },
      } as unknown as Response;
      const next: NextFunction = (err?: unknown) => {
        if (err) {
          resolve({ status: (err as { statusCode?: number }).statusCode, next: false });
        } else {
          resolve({ next: true });
        }
      };
      middleware(req, res, next);
    });
  }

  test("pasa cuando body tiene solo campos permitidos", async () => {
    const mw = allowedBodyFields("pubkey", "hash");
    const result = await runMiddleware(mw, { pubkey: "abc" });
    expect(result.next).toBe(true);
  });

  test("pasa cuando body está vacío", async () => {
    const mw = allowedBodyFields("pubkey", "hash");
    const result = await runMiddleware(mw, {});
    expect(result.next).toBe(true);
  });

  test("rechaza campos no permitidos", async () => {
    const mw = allowedBodyFields("pubkey");
    const result = await runMiddleware(mw, { pubkey: "abc", malicious: "x" });
    expect(result.next).toBe(false);
    expect(result.status).toBe(400);
  });

  test("rechaza múltiples campos inesperados", async () => {
    const mw = allowedBodyFields("pubkey");
    const result = await runMiddleware(mw, { a: 1, b: 2, pubkey: "ok" });
    expect(result.next).toBe(false);
    expect(result.status).toBe(400);
  });
});
