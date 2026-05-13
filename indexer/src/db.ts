import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { config } from "./config";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(config.dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  migrate(_db);
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    -- Firmas ya procesadas (evita doble procesamiento)
    CREATE TABLE IF NOT EXISTS processed_sigs (
      signature  TEXT    PRIMARY KEY,
      slot       INTEGER NOT NULL,
      processed_at INTEGER NOT NULL
    );

    -- Todos los eventos raw emitidos por el programa
    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      signature    TEXT    NOT NULL,
      slot         INTEGER NOT NULL,
      block_time   INTEGER,
      event_type   TEXT    NOT NULL,
      data         TEXT    NOT NULL,   -- JSON
      processed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_type      ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_slot      ON events(slot);
    CREATE INDEX IF NOT EXISTS idx_events_signature ON events(signature);

    -- Estado derivado: personas
    CREATE TABLE IF NOT EXISTS persons (
      wallet     TEXT PRIMARY KEY,
      nombre     TEXT,
      apellido   TEXT,
      dni        TEXT,
      status     TEXT,
      roles      TEXT,   -- JSON array de strings
      role_data  TEXT,
      updated_at INTEGER
    );

    -- Estado derivado: solicitudes de rol
    CREATE TABLE IF NOT EXISTS role_requests (
      pubkey         TEXT PRIMARY KEY,
      requester      TEXT NOT NULL,
      requested_role TEXT NOT NULL,
      status         TEXT NOT NULL,
      rejection_reason TEXT,
      updated_at     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_role_requests_requester ON role_requests(requester);

    -- Estado derivado: solicitudes de tokens
    CREATE TABLE IF NOT EXISTS token_requests (
      pubkey           TEXT PRIMARY KEY,
      universidad      TEXT NOT NULL,
      solicitante      TEXT NOT NULL,
      carrera          TEXT,
      plan             TEXT,
      resolucion       TEXT,
      anio_egreso      INTEGER,
      cantidad         INTEGER,
      estado           TEXT,
      motivo_rechazo   TEXT,
      updated_at       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_token_requests_universidad ON token_requests(universidad);
    CREATE INDEX IF NOT EXISTS idx_token_requests_estado      ON token_requests(estado);

    -- Estado derivado: certificaciones
    CREATE TABLE IF NOT EXISTS certifications (
      pubkey            TEXT PRIMARY KEY,
      cert_token        TEXT,
      nombre            TEXT,
      apellido          TEXT,
      dni               TEXT,
      carrera           TEXT,
      universidad       TEXT,
      estado            TEXT,
      hash_datos        TEXT,
      motivo_revocacion TEXT,
      updated_at        INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_certifications_dni        ON certifications(dni);
    CREATE INDEX IF NOT EXISTS idx_certifications_universidad ON certifications(universidad);
    CREATE INDEX IF NOT EXISTS idx_certifications_estado     ON certifications(estado);

    -- Estado derivado: solicitudes de graduación
    CREATE TABLE IF NOT EXISTS graduate_requests (
      pubkey     TEXT PRIMARY KEY,
      wallet     TEXT NOT NULL,
      tipo       TEXT,
      pdf_hash   TEXT,
      estado     TEXT,
      motivo     TEXT,
      pais       TEXT,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_graduate_requests_wallet ON graduate_requests(wallet);
    CREATE INDEX IF NOT EXISTS idx_graduate_requests_estado ON graduate_requests(estado);

    -- Auditoría completa
    CREATE TABLE IF NOT EXISTS audit_entries (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      signature TEXT    NOT NULL,
      actor     TEXT    NOT NULL,
      accion    TEXT    NOT NULL,
      entidad   TEXT    NOT NULL,
      motivo    TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_entries(actor);
    CREATE INDEX IF NOT EXISTS idx_audit_accion  ON audit_entries(accion);
    CREATE INDEX IF NOT EXISTS idx_audit_entidad ON audit_entries(entidad);
    CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_entries(timestamp);
  `);

  // Migraciones incrementales (columnas añadidas después del schema inicial)
  const addColIfMissing = (sql: string) => { try { db.exec(sql); } catch { /* ya existe */ } };
  addColIfMissing("ALTER TABLE certifications ADD COLUMN anio_egreso INTEGER");

  // Repara solicitudes de graduación históricas cuando el parser tomó campos
  // snake_case/camelCase de forma inconsistente (ej: pubkey/estado = 'undefined').
  const normalizeEnum = (value: unknown): string => {
    if (typeof value === "string") {
      const v = value.trim();
      if (!v) return v;
      if (v.includes("_")) {
        return v
          .split("_")
          .filter(Boolean)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join("");
      }
      return v.charAt(0).toUpperCase() + v.slice(1);
    }
    if (value && typeof value === "object") {
      const keys = Object.keys(value as object);
      if (keys.length > 0) return normalizeEnum(keys[0]);
    }
    return String(value ?? "");
  };

  const toTs = (value: unknown, fallback: number): number => {
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const s = value.trim();
      if (/^\d+$/.test(s)) return Number(s);
      if (/^[0-9a-fA-F]+$/.test(s)) {
        const n = Number.parseInt(s, 16);
        if (Number.isFinite(n)) return n;
      }
    }
    return fallback;
  };

  try {
    const eventRows = db
      .prepare(
        `SELECT event_type, data, slot, processed_at
         FROM events
         WHERE event_type IN ('CertificationRequestedEvent', 'GraduateRequestResolvedEvent')
         ORDER BY id ASC`
      )
      .all() as Array<{ event_type: string; data: string; slot: number; processed_at: number }>;

    const upsertRequested = db.prepare(`
      INSERT OR REPLACE INTO graduate_requests
        (pubkey, wallet, tipo, estado, updated_at)
      VALUES (?, ?, ?, 'Pendiente', ?)
    `);

    const updateResolved = db.prepare(`
      UPDATE graduate_requests
      SET estado = ?, motivo = ?, updated_at = ?
      WHERE pubkey = ?
    `);

    for (const row of eventRows) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        continue;
      }

      const ts = toTs(parsed.timestamp, row.processed_at || row.slot || 0);

      if (row.event_type === "CertificationRequestedEvent") {
        const pubkey = String(parsed.graduate_request ?? parsed.graduateRequest ?? "").trim();
        const wallet = String(parsed.wallet ?? "").trim();
        if (!pubkey || !wallet) continue;
        upsertRequested.run(pubkey, wallet, normalizeEnum(parsed.tipo), ts);
      }

      if (row.event_type === "GraduateRequestResolvedEvent") {
        const pubkey = String(parsed.graduate_request ?? parsed.graduateRequest ?? "").trim();
        if (!pubkey) continue;
        updateResolved.run(
          normalizeEnum(parsed.nuevo_estado ?? parsed.nuevoEstado),
          String(parsed.motivo ?? ""),
          ts,
          pubkey
        );
      }
    }

    db.exec("DELETE FROM graduate_requests WHERE pubkey = 'undefined' OR wallet = 'undefined'");
  } catch {
    // Si algo falla en la reparación, no interrumpir el arranque del indexer.
  }

  // Dedupe histórico de auditoría: conserva un único registro por evento lógico.
  db.exec(`
    DELETE FROM audit_entries
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM audit_entries
      GROUP BY signature, actor, accion, entidad, COALESCE(motivo, ''), timestamp
    )
  `);

  // Evita duplicados futuros (ej. carreras entre WS y polling fallback).
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_unique_event
      ON audit_entries(signature, actor, accion, entidad, COALESCE(motivo, ''), timestamp)
    `);
  } catch {
    // Si por cualquier motivo no se puede crear, el indexador sigue funcionando.
  }
}
