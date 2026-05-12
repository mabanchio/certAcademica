import { getDb } from "./db";

// Convierte un PublicKey de Anchor (que puede ser un objeto con toBase58) a string.
function pk(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof (value as { toBase58?: () => string }).toBase58 === "function") {
    return (value as { toBase58: () => string }).toBase58();
  }
  return String(value);
}

function ts(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  return Number(value);
}

function enumName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length > 0) return keys[0];
  }
  return String(value);
}

// ── Dispatcher principal ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleEvent(name: string, data: any, signature: string): void {
  const db = getDb();
  const now = Date.now();

  switch (name) {
    // ── Roles ────────────────────────────────────────────────────────────

    case "RoleRequestedEvent":
      // Compat: Anchor puede serializar campos como snake_case.
      {
        const requestedRole = data.requestedRole ?? data.requested_role;
      db.prepare(`
        INSERT OR REPLACE INTO role_requests (pubkey, requester, requested_role, status, updated_at)
        VALUES (?, ?, ?, 'Pendiente', ?)
      `).run(pk(data.requester) + "_rr_" + ts(data.timestamp), pk(data.requester), enumName(requestedRole), ts(data.timestamp));
      }
      break;

      case "PersonRegisteredEvent": {
        const wallet = pk(data.wallet);
        // El alta inicial no asigna roles operativos.
        // Los roles se reflejan por eventos explícitos (Initialize/ApproveRole/UpdatePerson).
        const roles: string[] = [];
        db.prepare(`
          INSERT INTO persons (wallet, nombre, apellido, dni, status, roles, role_data, updated_at)
          VALUES (?, ?, ?, ?, 'Activo', ?, ?, ?)
          ON CONFLICT(wallet) DO UPDATE SET
            nombre     = excluded.nombre,
            apellido   = excluded.apellido,
            dni        = excluded.dni,
            status     = 'Activo',
            roles      = persons.roles,
            role_data  = excluded.role_data,
            updated_at = excluded.updated_at
        `).run(
          wallet,
          data.nombre ?? "",
          data.apellido ?? "",
          data.dni ?? "",
          JSON.stringify(roles),
          data.roleData ?? data.role_data ?? "",
          ts(data.timestamp)
        );
        break;
      }

    case "RoleApprovedEvent":
      // Actualiza persona: añade el rol aprobado
      _addRoleToPerson(pk(data.requester), enumName(data.approvedRole ?? data.approved_role), ts(data.timestamp));
      break;

    case "RoleRejectedEvent":
      db.prepare(`
        UPDATE role_requests
           SET status = 'Rechazada',
               rejection_reason = ?,
               updated_at = ?
         WHERE requester = ?
           AND requested_role = ?
           AND status = 'Pendiente'
      `).run(
        data.reason ?? data.motivo ?? "",
        ts(data.timestamp),
        pk(data.requester),
        enumName(data.rejectedRole ?? data.rejected_role)
      );
      break;

    // ── Estado de persona ────────────────────────────────────────────────

    case "StatusChangedEvent":
      db.prepare(`
        INSERT INTO persons (wallet, status, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(wallet) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
      `).run(pk(data.person), enumName(data.status), ts(data.timestamp));
      break;

    case "PersonUpdatedEvent":
      db.prepare(`
        UPDATE persons
           SET nombre = ?,
               apellido = ?,
               dni = ?,
               status = ?,
               roles = ?,
               role_data = ?,
               updated_at = ?
         WHERE wallet = ?
      `).run(
        data.nombre ?? "",
        data.apellido ?? "",
        data.dni ?? "",
        enumName(data.status),
        JSON.stringify(Array.isArray(data.roles) ? data.roles.map((r: unknown) => enumName(r)) : []),
        data.roleData ?? data.role_data ?? "",
        ts(data.timestamp),
        pk(data.wallet)
      );
      break;

    // ── Token Requests ───────────────────────────────────────────────────

    case "TokenRequestedEvent":
      db.prepare(`
        INSERT OR REPLACE INTO token_requests
          (pubkey, universidad, solicitante, carrera, cantidad, estado, updated_at)
        VALUES (?, ?, ?, ?, ?, 'Pendiente', ?)
      `).run(
        pk(data.universidad) + "_tr_" + ts(data.timestamp),
        pk(data.universidad),
        pk(data.solicitante),
        data.carrera,
        data.cantidad,
        ts(data.timestamp)
      );
      break;

    case "TokenRequestApprovedEvent":
      db.prepare(`
        UPDATE token_requests SET estado = 'Aprobada', updated_at = ?
        WHERE universidad = ? AND solicitante = ? AND estado = 'Pendiente'
      `).run(ts(data.timestamp), pk(data.universidad), pk(data.solicitante));
      break;

    case "TokenRequestRejectedEvent":
      db.prepare(`
        UPDATE token_requests SET estado = 'Rechazada', updated_at = ?
        WHERE universidad = ? AND solicitante = ? AND estado = 'Pendiente'
      `).run(ts(data.timestamp), pk(data.universidad), pk(data.solicitante));
      break;

    // ── Certificaciones ──────────────────────────────────────────────────

    case "TokenAssignedEvent":
      db.prepare(`
        INSERT OR REPLACE INTO certifications
          (pubkey, cert_token, universidad, carrera, estado, updated_at)
        VALUES (?, ?, ?, ?, 'Activa', ?)
      `).run(
        pk(data.certification),
        pk(data.certToken),
        pk(data.universidad),
        data.carrera,
        ts(data.timestamp)
      );
      break;

    case "CertificationRevokedEvent":
      db.prepare(`
        UPDATE certifications SET estado = 'Revocada', motivo_revocacion = ?, updated_at = ?
        WHERE pubkey = ?
      `).run(data.motivo, ts(data.timestamp), pk(data.certification));
      break;

    // ── Solicitudes de graduación ────────────────────────────────────────

    case "CertificationRequestedEvent":
      db.prepare(`
        INSERT OR REPLACE INTO graduate_requests
          (pubkey, wallet, tipo, estado, updated_at)
        VALUES (?, ?, ?, 'Pendiente', ?)
      `).run(
        pk(data.graduateRequest),
        pk(data.wallet),
        enumName(data.tipo),
        ts(data.timestamp)
      );
      break;

    case "GraduateRequestResolvedEvent":
      db.prepare(`
        UPDATE graduate_requests SET estado = ?, motivo = ?, updated_at = ?
        WHERE pubkey = ?
      `).run(
        enumName(data.nuevoEstado),
        data.motivo ?? "",
        ts(data.timestamp),
        pk(data.graduateRequest)
      );
      break;

    // ── Auditoría ────────────────────────────────────────────────────────

    case "AuditLogEvent":
      const accion = enumName(data.accion);

      // Al inicializar, el actor es el wallet admin. Si no existe en la vista
      // derivada de personas, lo creamos como Activo con rol Admin.
      if (accion === "Initialize") {
        const adminWallet = pk(data.actor);
        db.prepare(`
          INSERT INTO persons (wallet, status, roles, updated_at)
          VALUES (?, 'Activo', ?, ?)
          ON CONFLICT(wallet) DO UPDATE SET
            status = 'Activo',
            roles = excluded.roles,
            updated_at = excluded.updated_at
        `).run(adminWallet, JSON.stringify(["Admin"]), ts(data.timestamp));
      }

      db.prepare(`
        INSERT INTO audit_entries (signature, actor, accion, entidad, motivo, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        signature,
        pk(data.actor),
        accion,
        pk(data.entidad),
        data.motivo ?? "",
        ts(data.timestamp)
      );

      // El evento TokenRequested no trae la PDA real. La tomamos del AuditLog(RequestTokens).
      if (accion === "RequestTokens") {
        db.prepare(`
          UPDATE token_requests
          SET pubkey = ?
          WHERE solicitante = ? AND updated_at = ?
        `).run(
          pk(data.entidad),
          pk(data.actor),
          ts(data.timestamp)
        );
      }
      break;

    default:
      // Evento desconocido: ya queda registrado en la tabla events
      break;
  }
}

// ── Helper: añadir rol a persona ──────────────────────────────────────────

function _addRoleToPerson(wallet: string, role: string, updatedAt: number): void {
  const db = getDb();
  const row = db.prepare("SELECT roles FROM persons WHERE wallet = ?").get(wallet) as
    | { roles: string }
    | undefined;

  let roles: string[] = [];
  if (row?.roles) {
    try { roles = JSON.parse(row.roles); } catch { roles = []; }
  }
  if (!roles.includes(role)) roles.push(role);

  db.prepare(`
    INSERT INTO persons (wallet, roles, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(wallet) DO UPDATE SET roles = excluded.roles, updated_at = excluded.updated_at
  `).run(wallet, JSON.stringify(roles), updatedAt);
}
