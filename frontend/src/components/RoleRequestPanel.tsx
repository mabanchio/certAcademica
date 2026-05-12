"use client";

import { useEffect, useState } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { api, type EventRow } from "@/lib/api";
import {
  initializeAsFirstAdminTx,
  isSystemInitialized,
  requestRoleTx,
  type RequestableRole,
} from "@/lib/solanaProgram";

const REQUESTABLE_ROLES: RequestableRole[] = [
  "Universidad",
  "Ministerio",
  "Cancilleria",
  "Egresado",
];

type RejectedRoleInfo = {
  role: RequestableRole;
  reason: string;
};

export function RoleRequestPanel() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [selectedRole, setSelectedRole] = useState<RequestableRole>("Universidad");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [roleData, setRoleData] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<RequestableRole[]>([]);
  const [rejectedInfo, setRejectedInfo] = useState<RejectedRoleInfo | null>(null);
  const [systemInitialized, setSystemInitialized] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    isSystemInitialized(connection)
      .then((ok) => {
        if (active) setSystemInitialized(ok);
      })
      .catch(() => {
        // Si el RPC falla asumimos no inicializado para no bloquear el flujo
        if (active) setSystemInitialized(false);
      });

    return () => {
      active = false;
    };
  }, [connection, publicKey]);

  useEffect(() => {
    if (!publicKey) {
      setPendingRoles([]);
      setRejectedInfo(null);
      return;
    }

    let active = true;
    const wallet = publicKey.toBase58();

    const refresh = async () => {
      try {
        const pending = await getPendingRolesForWallet(wallet);
        if (active) setPendingRoles(pending);

        const rejected = await getLatestRejectedRoleForWallet(wallet);
        if (active) setRejectedInfo(rejected);
      } catch {
        // Mantiene el estado actual para evitar mostrar el formulario por un fallo transitorio.
      }
    };

    refresh();
    const timer = setInterval(refresh, 12000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [publicKey]);

  const onSubmit = async () => {
    if (!publicKey || !anchorWallet) {
      setError("Conecta tu wallet para continuar.");
      return;
    }

    if (pendingRoles.includes(selectedRole)) {
      setError(`Ya tienes una solicitud de rol (${selectedRole}) en espera de autorización.`);
      return;
    }

    if (systemInitialized !== false) {
      const requiresContext =
        selectedRole === "Universidad"
        || selectedRole === "Cancilleria"
        || selectedRole === "Ministerio"
        || selectedRole === "Egresado";
      if (requiresContext && !roleData.trim()) {
        setError(
          selectedRole === "Universidad"
            ? "Debes indicar la universidad de referencia para solicitar este rol."
            : selectedRole === "Ministerio"
              ? "Debes indicar el organismo de referencia para solicitar este rol."
            : selectedRole === "Egresado"
              ? "Debes indicar una referencia para solicitar este rol."
            : "Debes indicar el pais de referencia para solicitar este rol."
        );
        return;
      }
    }

    setSending(true);
    setError(null);
    setTxSig(null);

    try {
      if (systemInitialized === false) {
        const sig = await initializeAsFirstAdminTx({
          connection,
          wallet: anchorWallet,
          admin: new PublicKey(publicKey.toBase58()),
          nombre,
          apellido,
          dni,
        });
        setTxSig(sig);
        setSystemInitialized(true);
        setError("Sistema inicializado. Esta wallet quedó vinculada como Admin. Recarga la página.");
        return;
      }

      const sig = await requestRoleTx({
        connection,
        wallet: anchorWallet,
        requester: new PublicKey(publicKey.toBase58()),
        role: selectedRole,
        nombre,
        apellido,
        dni,
        roleData,
      });
      setTxSig(sig);
      setPendingRoles((prev) => (prev.includes(selectedRole) ? prev : [...prev, selectedRole]));
      setRejectedInfo(null);
    } catch (e) {
      const mapped = mapRoleRequestError(e, {
        selectedRole,
        wallet: publicKey.toBase58(),
      });
      if (mapped.signature) setTxSig(mapped.signature);
      if (mapped.pendingRole) {
        setPendingRoles((prev) => (prev.includes(mapped.pendingRole as RequestableRole)
          ? prev
          : [...prev, mapped.pendingRole as RequestableRole]));
      }
      setError(mapped.message);
    } finally {
      setSending(false);
    }
  };

  if (systemInitialized === null) {
    return (
      <div className="w-full max-w-md rounded-lg border border-blue-200 bg-blue-50 px-5 py-4">
        <p className="text-sm text-blue-700 animate-pulse">Comprobando estado del sistema…</p>
      </div>
    );
  }

  if (systemInitialized !== false && pendingRoles.length > 0) {
    return (
      <div className="w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 px-5 py-4">
        <h3 className="text-sm font-semibold text-amber-900">Solicitudes en espera</h3>
        <p className="mt-1 text-sm text-amber-800">
          Tienes solicitudes pendientes para: <strong>{pendingRoles.join(", ")}</strong>.
        </p>
        {txSig && (
          <p className="mt-3 break-all text-xs text-amber-900">
            Tx: {txSig}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-blue-200 bg-blue-50 px-5 py-4">
      <h3 className="text-sm font-semibold text-blue-900">
        {systemInitialized === false ? "Inicializar sistema" : "Solicitar rol"}
      </h3>
      <p className="mt-1 text-sm text-blue-800">
        {systemInitialized === false
          ? "El sistema no está inicializado. La primera wallet en inicializar quedará vinculada como Admin."
          : "La wallet conectada firmará tu alta on-chain y la solicitud de rol. El admin solo interviene para aprobar o rechazar con observación."}
      </p>

      {rejectedInfo && systemInitialized !== false && pendingRoles.length === 0 && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          Tu última solicitud de rol <strong>{rejectedInfo.role}</strong> fue rechazada.
          <br />
          Motivo: {rejectedInfo.reason || "Sin motivo informado"}.
          <br />
          Puedes corregir los datos y volver a solicitar un rol.
        </div>
      )}

      {pendingRoles.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Tienes solicitudes pendientes para: <strong>{pendingRoles.join(", ")}</strong>.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm"
        />
        <input
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
          placeholder="Apellido"
          className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm"
        />
        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          placeholder="DNI"
          className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm"
        />
        {systemInitialized !== false && (
          <input
            value={roleData}
            onChange={(e) => setRoleData(e.target.value)}
            placeholder={
              selectedRole === "Universidad"
                ? "Universidad de referencia"
                : selectedRole === "Cancilleria"
                  ? "Pais de referencia"
                  : selectedRole === "Egresado"
                    ? "Referencia del egresado"
                  : "Organismo / dato de referencia"
            }
            className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm"
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {systemInitialized !== false && (
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as RequestableRole)}
            className="flex-1 rounded-md border border-blue-300 bg-white px-3 py-2 text-sm"
          >
            {REQUESTABLE_ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={sending || pendingRoles.includes(selectedRole) || !nombre.trim() || !apellido.trim() || !dni.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {sending
            ? "Enviando..."
            : systemInitialized === false
              ? "Inicializar como Admin"
              : pendingRoles.includes(selectedRole)
                ? "Pendiente de autorización"
                : "Solicitar"}
        </button>
      </div>

      {txSig && (
        <p className="mt-3 break-all text-xs text-green-700">
          Solicitud enviada. Tx: {txSig}
        </p>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}

async function getPendingRolesForWallet(wallet: string): Promise<RequestableRole[]> {
  const [requested, approved, rejected] = await Promise.all([
    api.getTransactions(500, 0, "RoleRequestedEvent"),
    api.getTransactions(500, 0, "RoleApprovedEvent"),
    api.getTransactions(500, 0, "RoleRejectedEvent"),
  ]);

  const requestedByRole = new Set<RequestableRole>();
  const resolvedByRole = new Set<RequestableRole>();

  for (const row of requested.data) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : "";
    if (requester !== wallet) continue;
    const role = toRole(d.requestedRole ?? d.requested_role);
    if (role) requestedByRole.add(role);
  }

  for (const row of approved.data) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : "";
    if (requester !== wallet) continue;
    const role = toRole(d.approvedRole ?? d.approved_role);
    if (role) resolvedByRole.add(role);
  }

  for (const row of rejected.data) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : "";
    if (requester !== wallet) continue;
    const role = toRole(d.rejectedRole ?? d.rejected_role);
    if (role) resolvedByRole.add(role);
  }

  const priority: RequestableRole[] = ["Universidad", "Ministerio", "Cancilleria", "Egresado"];
  return priority.filter((role) => requestedByRole.has(role) && !resolvedByRole.has(role));
}

async function getLatestRejectedRoleForWallet(wallet: string): Promise<RejectedRoleInfo | null> {
  const [requested, approved, rejected] = await Promise.all([
    api.getTransactions(500, 0, "RoleRequestedEvent"),
    api.getTransactions(500, 0, "RoleApprovedEvent"),
    api.getTransactions(500, 0, "RoleRejectedEvent"),
  ]);

  const latestByRole = new Map<RequestableRole, { kind: "requested" | "approved" | "rejected"; slot: number; reason?: string }>();

  for (const row of requested.data) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : "";
    if (requester !== wallet) continue;
    const role = toRole(d.requestedRole ?? d.requested_role);
    if (!role) continue;
    const curr = latestByRole.get(role);
    if (!curr || row.slot >= curr.slot) {
      latestByRole.set(role, { kind: "requested", slot: row.slot });
    }
  }

  for (const row of approved.data) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : "";
    if (requester !== wallet) continue;
    const role = toRole(d.approvedRole ?? d.approved_role);
    if (!role) continue;
    const curr = latestByRole.get(role);
    if (!curr || row.slot >= curr.slot) {
      latestByRole.set(role, { kind: "approved", slot: row.slot });
    }
  }

  for (const row of rejected.data) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : "";
    if (requester !== wallet) continue;
    const role = toRole(d.rejectedRole ?? d.rejected_role);
    if (!role) continue;
    const reason = typeof d.reason === "string"
      ? d.reason
      : typeof d.motivo === "string"
        ? d.motivo
        : "";
    const curr = latestByRole.get(role);
    if (!curr || row.slot >= curr.slot) {
      latestByRole.set(role, { kind: "rejected", slot: row.slot, reason });
    }
  }

  let latestRejected: RejectedRoleInfo | null = null;
  let latestSlot = -1;

  for (const [role, info] of latestByRole.entries()) {
    if (info.kind === "rejected" && info.slot > latestSlot) {
      latestSlot = info.slot;
      latestRejected = {
        role,
        reason: info.reason ?? "",
      };
    }
  }

  return latestRejected;
}

function parseData(row: EventRow): Record<string, unknown> {
  try {
    return JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toRole(value: unknown): RequestableRole | null {
  if (typeof value === "string") {
    if (
      value === "Universidad"
      || value === "Ministerio"
      || value === "Cancilleria"
      || value === "Egresado"
    ) {
      return value;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const k = Object.keys(value as object)[0] ?? "";
    if (!k) return null;
    const normalized = k.charAt(0).toUpperCase() + k.slice(1);
    if (
      normalized === "Universidad"
      || normalized === "Ministerio"
      || normalized === "Cancilleria"
      || normalized === "Egresado"
    ) {
      return normalized;
    }
  }

  return null;
}

function mapRoleRequestError(
  error: unknown,
  context?: { selectedRole?: RequestableRole; wallet?: string }
): { message: string; signature?: string; pendingRole?: RequestableRole } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();

  if (
    lower.includes("solicitudyapendiente")
    || lower.includes("error number: 6005")
    || (lower.includes("ya existe una solicitud pendiente") && lower.includes("rol"))
  ) {
    const pendingRole = context?.selectedRole;
    const cluster = process.env.NEXT_PUBLIC_CLUSTER ?? "desconocida";
    const programId = process.env.NEXT_PUBLIC_PROGRAM_ID ?? "desconocido";
    const wallet = context?.wallet ?? "desconocida";

    return {
      pendingRole,
      message:
        `Ya existe una solicitud pendiente para ${pendingRole ?? "ese rol"}. `
        + "Se marcó como pendiente para evitar reintentos duplicados. "
        + `Contexto: wallet=${wallet}, red=${cluster}, programa=${programId}.`,
    };
  }

  if (
    lower.includes("attempt to debit an account")
    || lower.includes("no record of a prior credit")
    || lower.includes("insufficient funds")
    || lower.includes("insufficient lamports")
  ) {
    return {
      message:
        "Tu wallet no tiene saldo suficiente (SOL) para pagar la transacción. "
        + "Recarga fondos y vuelve a intentarlo.",
    };
  }

  if (lower.includes("transaction was not confirmed in")) {
    const signature = extractSignature(raw);
    return {
      signature,
      message: signature
        ? "La transacción fue enviada pero no se confirmó a tiempo. "
          + "Es posible que sí se haya procesado. Verifica la firma mostrada abajo antes de reintentar."
        : "La transacción fue enviada pero no se confirmó a tiempo. "
          + "Podría haberse procesado igualmente; verifica en el explorador o vuelve a consultar en unos segundos.",
    };
  }

  if (lower.includes("constraintmut") && lower.includes("requester_person")) {
    return {
      message:
        "Error de validación de cuenta al solicitar el rol. "
        + "Actualiza el frontend y vuelve a intentar.",
    };
  }

  if (lower.includes("already in use") || lower.includes("ya está inicializado")) {
    return {
      message:
        "El sistema ya fue inicializado por otra wallet. Recarga y vuelve a conectar para continuar.",
    };
  }

  return {
    message: raw || "No se pudo solicitar el rol",
  };
}

function extractSignature(message: string): string | undefined {
  const fromCheck = message.match(/check signature\s+([1-9A-HJ-NP-Za-km-z]{32,})/i);
  if (fromCheck?.[1]) return fromCheck[1];

  const generic = message.match(/\b([1-9A-HJ-NP-Za-km-z]{80,100})\b/);
  if (generic?.[1]) return generic[1];

  return undefined;
}
