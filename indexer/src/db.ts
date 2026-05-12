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
}
