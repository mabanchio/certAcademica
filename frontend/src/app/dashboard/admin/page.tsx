"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { api, type Certification, type EventRow, type Person, type Stats, type SystemStatus } from "@/lib/api";
import { RoleBadge } from "@/components/RoleBadge";
import { StatusChip } from "@/components/StatusChip";
import { approveRoleTx, fetchPersonRoleDataOnChain, fetchPersonIdentityOnChain, initializeAsFirstAdminTx, registerPersonAdminTx, rejectRoleTx, revokeCertificationTx, setStatusTx, updatePersonAdminTx, type EditableRole, type RequestableRole } from "@/lib/solanaProgram";

type PendingRoleRequest = {
  requester: string;
  role: RequestableRole;
  signature: string;
  slot: number;
};

function shortAddress(value: string): string {
  if (!value) return "";
  if (value.length <= 11) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function roleContextLabel(role: RequestableRole): string {
  if (role === "Universidad") return "Universidad";
  if (role === "Cancilleria") return "Pais";
  if (role === "Egresado") return "Título";
  return "Organismo";
}

const EDITABLE_ROLES: EditableRole[] = ["Universidad", "Ministerio", "Cancilleria", "Egresado"];

type PersonEditForm = {
  nombre: string;
  apellido: string;
  dni: string;
  active: boolean;
  roles: EditableRole[];
  roleData: string;
  motivo: string;
};

export default function AdminDashboard() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [pendingRoleRequests, setPendingRoleRequests] = useState<PendingRoleRequest[]>([]);
  const [selectedCertification, setSelectedCertification] = useState<Certification | null>(null);
  const [selectedCertificationDetail, setSelectedCertificationDetail] = useState<Certification | null>(null);
  const [selectedCertificationLoading, setSelectedCertificationLoading] = useState(false);
  const [selectedCertificationError, setSelectedCertificationError] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedPersonLoading, setSelectedPersonLoading] = useState(false);
  const [selectedPersonError, setSelectedPersonError] = useState<string | null>(null);
  const [selectedPersonRoleData, setSelectedPersonRoleData] = useState<string | null>(null);
  const [selectedPersonIdentity, setSelectedPersonIdentity] = useState<{ nombre: string | null; apellido: string | null; dni: string | null } | null>(null);
  const [editTarget, setEditTarget] = useState<Person | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PersonEditForm>({
    nombre: "",
    apellido: "",
    dni: "",
    active: true,
    roles: [],
    roleData: "",
    motivo: "",
  });
  const [selectedRequest, setSelectedRequest] = useState<PendingRoleRequest | null>(null);
  const [selectedRequestEvents, setSelectedRequestEvents] = useState<EventRow[]>([]);
  const [selectedRequestLoading, setSelectedRequestLoading] = useState(false);
  const [selectedRequestError, setSelectedRequestError] = useState<string | null>(null);
  const [selectedRequestRoleData, setSelectedRequestRoleData] = useState<string | null>(null);
  const [requestRoleDataMap, setRequestRoleDataMap] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingRoleRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvalMsg, setApprovalMsg] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Tabs ──
  type AdminTab = "solicitudes" | "personas" | "certificaciones";
  const [activeTab, setActiveTab] = useState<AdminTab>("solicitudes");

  // ── Filtros por tab ──
  const [filterSol, setFilterSol] = useState({ wallet: "", nombre: "", rol: "" });
  const [filterPer, setFilterPer] = useState({ nombre: "", apellido: "", wallet: "", rol: "", estado: "" });
  const [filterCert, setFilterCert] = useState({ nombre: "", apellido: "", carrera: "", estado: "", anio: "" });

  const personByWallet = useMemo(() => new Map(persons.map((p) => [p.wallet, p])), [persons]);

  const filteredSolicitudes = useMemo(() => {
    return pendingRoleRequests.filter((r) => {
      const p = personByWallet.get(r.requester);
      const nombre = `${p?.nombre ?? ""} ${p?.apellido ?? ""}`.toLowerCase();
      if (filterSol.wallet && !r.requester.toLowerCase().includes(filterSol.wallet.toLowerCase())) return false;
      if (filterSol.nombre && !nombre.includes(filterSol.nombre.toLowerCase())) return false;
      if (filterSol.rol && r.role.toLowerCase() !== filterSol.rol.toLowerCase()) return false;
      return true;
    });
  }, [pendingRoleRequests, personByWallet, filterSol]);

  const filteredPersons = useMemo(() => {
    return persons.filter((p) => {
      if (filterPer.nombre && !(p.nombre ?? "").toLowerCase().includes(filterPer.nombre.toLowerCase())) return false;
      if (filterPer.apellido && !(p.apellido ?? "").toLowerCase().includes(filterPer.apellido.toLowerCase())) return false;
      if (filterPer.wallet && !p.wallet.toLowerCase().includes(filterPer.wallet.toLowerCase())) return false;
      if (filterPer.rol && !p.roles.some((r) => r.toLowerCase() === filterPer.rol.toLowerCase())) return false;
      if (filterPer.estado && !(p.status ?? "").toLowerCase().includes(filterPer.estado.toLowerCase())) return false;
      return true;
    });
  }, [persons, filterPer]);

  const filteredCertifications = useMemo(() => {
    return certifications.filter((c) => {
      if (filterCert.nombre && !(c.nombre ?? "").toLowerCase().includes(filterCert.nombre.toLowerCase())) return false;
      if (filterCert.apellido && !(c.apellido ?? "").toLowerCase().includes(filterCert.apellido.toLowerCase())) return false;
      if (filterCert.carrera && !(c.carrera ?? "").toLowerCase().includes(filterCert.carrera.toLowerCase())) return false;
      if (filterCert.estado && !(c.estado ?? "").toLowerCase().includes(filterCert.estado.toLowerCase())) return false;
      if (filterCert.anio && !(c.anio_egreso ?? "").toString().includes(filterCert.anio)) return false;
      return true;
    });
  }, [certifications, filterCert]);

  const loadSystemStatus = async () => {
    try {
      const s = await api.adminStatus();
      setSystemStatus(s.data);
    } catch {
      // si falla el status (backend caído), no bloquear el resto
    }
  };

  const loadData = async () => {
    const [s, p, c, requested, approved, rejected] = await Promise.all([
      api.stats(),
      api.getPersons(100),
      api.getCertifications(100, 0),
      api.getTransactions(500, 0, "RoleRequestedEvent"),
      api.getTransactions(500, 0, "RoleApprovedEvent"),
      api.getTransactions(500, 0, "RoleRejectedEvent"),
    ]);

    setStats(s.data);
    setPersons(p.data);
    setCertifications(c.data);
    const pending = buildPendingRoleRequests(requested.data, approved.data, rejected.data);
    setPendingRoleRequests(pending);

    // Cargar role_data desde on-chain para cada solicitante pendiente
    const uniqueRequesters = [...new Set(pending.map((r) => r.requester))];
    const roleDataResults = await Promise.allSettled(
      uniqueRequesters.map((wallet) =>
        fetchPersonRoleDataOnChain({ connection, wallet: new PublicKey(wallet) })
          .then((rd) => ({ wallet, roleData: rd ?? "" }))
      )
    );
    const rdMap: Record<string, string> = {};
    for (const res of roleDataResults) {
      if (res.status === "fulfilled" && res.value.roleData) {
        rdMap[res.value.wallet] = res.value.roleData;
      }
    }
    setRequestRoleDataMap(rdMap);
  };

  const onRevokeCertification = async (cert: Certification) => {
    if (!anchorWallet || !publicKey) {
      setStatusMsg("Conecta una wallet admin para revocar certificaciones.");
      return;
    }
    const motivo = window.prompt("Motivo de revocación")?.trim();
    if (!motivo) return;

    setRevoking(cert.pubkey);
    setStatusMsg(null);
    try {
      const sig = await revokeCertificationTx({
        connection,
        wallet: anchorWallet,
        admin: new PublicKey(publicKey.toBase58()),
        certification: new PublicKey(cert.pubkey),
        motivo,
      });
      setStatusMsg(`Certificación revocada. Tx: ${sig}`);
      await loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo revocar la certificación";
      setStatusMsg(msg);
    } finally {
      setRevoking(null);
    }
  };

  const onOpenCertificationDetail = async (cert: Certification) => {
    setSelectedCertification(cert);
    setSelectedCertificationDetail(null);
    setSelectedCertificationError(null);
    setSelectedCertificationLoading(true);

    try {
      const res = await api.getCertification(cert.pubkey);
      setSelectedCertificationDetail(res.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo cargar el detalle de la certificación";
      setSelectedCertificationError(msg);
    } finally {
      setSelectedCertificationLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([loadSystemStatus(), loadData()])
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApprove = async (req: PendingRoleRequest) => {
    if (!anchorWallet || !publicKey) {
      setApprovalMsg("Conecta una wallet admin para aprobar solicitudes.");
      return;
    }

    setApproving(`${req.requester}:${req.role}`);
    setApprovalMsg(null);
    try {
      const sig = await approveRoleTx({
        connection,
        wallet: anchorWallet,
        admin: new PublicKey(publicKey.toBase58()),
        requester: new PublicKey(req.requester),
        role: req.role,
      });
      setApprovalMsg(`Solicitud aprobada. Tx: ${sig}`);
      await loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo aprobar la solicitud";
      setApprovalMsg(msg);
    } finally {
      setApproving(null);
    }
  };

  const onOpenRequestDetail = async (req: PendingRoleRequest) => {
    setSelectedRequest(req);
    setSelectedRequestEvents([]);
    setSelectedRequestError(null);
    setSelectedRequestRoleData(null);
    setSelectedRequestLoading(true);
    const [txResult, roleDataResult] = await Promise.allSettled([
      api.getTransactionBySignature(req.signature),
      fetchPersonRoleDataOnChain({
        connection,
        wallet: new PublicKey(req.requester),
      }),
    ]);

    if (txResult.status === "fulfilled") {
      setSelectedRequestEvents(txResult.value.data);
    } else {
      const msg = txResult.reason instanceof Error ? txResult.reason.message : "No se pudo cargar el detalle de la transacción";
      setSelectedRequestError(msg);
    }

    if (roleDataResult.status === "fulfilled") {
      setSelectedRequestRoleData(roleDataResult.value);
    }

    setSelectedRequestLoading(false);
  };

  const onOpenRejectModal = (req: PendingRoleRequest) => {
    setRejectTarget(req);
    setRejectReason("");
    setRejectModalOpen(true);
  };

  const onReject = async () => {
    if (!rejectTarget) return;
    if (!anchorWallet || !publicKey) {
      setApprovalMsg("Conecta una wallet admin para rechazar solicitudes.");
      return;
    }
    const reason = rejectReason.trim();
    if (!reason) {
      setApprovalMsg("Debes ingresar un motivo de rechazo.");
      return;
    }

    const key = `${rejectTarget.requester}:${rejectTarget.role}`;
    setRejecting(key);
    setApprovalMsg(null);
    try {
      const sig = await rejectRoleTx({
        connection,
        wallet: anchorWallet,
        admin: new PublicKey(publicKey.toBase58()),
        requester: new PublicKey(rejectTarget.requester),
        role: rejectTarget.role,
        motivo: reason,
      });
      setApprovalMsg(`Solicitud rechazada. Tx: ${sig}`);
      setRejectModalOpen(false);
      setRejectTarget(null);
      setRejectReason("");
      await loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo rechazar la solicitud";
      setApprovalMsg(msg);
    } finally {
      setRejecting(null);
    }
  };

  const onToggleStatus = async (person: Person) => {
    if (!anchorWallet || !publicKey) {
      setStatusMsg("Conecta una wallet admin para cambiar el estado.");
      return;
    }
    const isActive = (person.status ?? "").toLowerCase() === "activo";
    setTogglingStatus(person.wallet);
    setStatusMsg(null);
    try {
      const sig = await setStatusTx({
        connection,
        wallet: anchorWallet,
        admin: new PublicKey(publicKey.toBase58()),
        target: new PublicKey(person.wallet),
        active: !isActive,
        motivo: isActive ? "Deshabilitado por admin" : "Habilitado por admin",
      });
      setStatusMsg(`Estado actualizado. Tx: ${sig}`);
      await loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo cambiar el estado";
      setStatusMsg(msg);
    } finally {
      setTogglingStatus(null);
    }
  };

  const onOpenPersonDetail = async (wallet: string) => {
    setSelectedPerson(null);
    setSelectedPersonError(null);
    setSelectedPersonRoleData(null);
    setSelectedPersonIdentity(null);
    setSelectedPersonLoading(true);
    const [personResult, roleDataResult, identityResult] = await Promise.allSettled([
      api.getPerson(wallet),
      fetchPersonRoleDataOnChain({
        connection,
        wallet: new PublicKey(wallet),
      }),
      fetchPersonIdentityOnChain({
        connection,
        wallet: new PublicKey(wallet),
      }),
    ]);

    if (personResult.status === "fulfilled") {
      const personData = personResult.value.data;
      const identityData = identityResult.status === "fulfilled" ? identityResult.value : null;

      const mergedPerson = {
        ...personData,
        nombre: personData.nombre || identityData?.nombre || personData.nombre,
        apellido: personData.apellido || identityData?.apellido || personData.apellido,
        dni: personData.dni || identityData?.dni || personData.dni,
      };

      setSelectedPerson(mergedPerson);

      // Persistencia transparente: si faltan datos en BD y existen on-chain, guardar sin intervención manual.
      const needsSync =
        (!personData.nombre && !!identityData?.nombre) ||
        (!personData.apellido && !!identityData?.apellido) ||
        (!personData.dni && !!identityData?.dni);

      if (needsSync) {
        void api
          .updatePersonIdentity(
            wallet,
            identityData?.nombre || undefined,
            identityData?.apellido || undefined,
            identityData?.dni || undefined
          )
          .then((res) => {
            setSelectedPerson(res.data);
            setPersons((prev) => prev.map((p) => (p.wallet === wallet ? res.data : p)));
          })
          .catch(() => {
            // Si falla la persistencia, el modal igual muestra datos combinados BD + blockchain.
          });
      }
    } else {
      const msg =
        personResult.reason instanceof Error
          ? personResult.reason.message
          : "No se pudo cargar el detalle del usuario";
      setSelectedPersonError(msg);
    }

    if (roleDataResult.status === "fulfilled") {
      setSelectedPersonRoleData(roleDataResult.value);
    }

    if (identityResult.status === "fulfilled") {
      setSelectedPersonIdentity(identityResult.value);
    }

    setSelectedPersonLoading(false);
  };

  const onOpenEditPerson = async (wallet: string) => {
    setEditTarget(null);
    setEditError(null);
    setEditMsg(null);
    setEditLoading(true);
    try {
      const [personResult, onChainRoleDataResult] = await Promise.allSettled([
        api.getPerson(wallet),
        fetchPersonRoleDataOnChain({
          connection,
          wallet: new PublicKey(wallet),
        }),
      ]);

      if (personResult.status !== "fulfilled") {
        throw personResult.reason;
      }

      const p = personResult.value.data;
      const roleDataFromChain =
        onChainRoleDataResult.status === "fulfilled" ? onChainRoleDataResult.value : null;
      setEditTarget(p);
      setEditForm({
        nombre: p.nombre ?? "",
        apellido: p.apellido ?? "",
        dni: p.dni ?? "",
        active: (p.status ?? "").toLowerCase() === "activo",
        roles: p.roles.filter((r): r is EditableRole => EDITABLE_ROLES.includes(r as EditableRole)),
        roleData: roleDataFromChain ?? p.role_data ?? "",
        motivo: "Actualización de datos por admin",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo cargar el usuario para editar";
      setEditError(msg);
    } finally {
      setEditLoading(false);
    }
  };

  const onSubmitEditPerson = async () => {
    if (!editTarget) return;
    if (!anchorWallet || !publicKey) {
      setEditError("Conecta una wallet admin para editar usuarios.");
      return;
    }

    const nombre = editForm.nombre.trim();
    const apellido = editForm.apellido.trim();
    const dni = editForm.dni.trim();
    const motivo = editForm.motivo.trim();
    const roleData = editForm.roleData.trim();
    const roles = editForm.roles;

    if (!nombre || !apellido || !dni) {
      setEditError("Nombre, apellido y DNI son obligatorios.");
      return;
    }
    if (!motivo) {
      setEditError("Debes indicar un motivo de actualización.");
      return;
    }
    if ((roles.includes("Universidad") || roles.includes("Cancilleria") || roles.includes("Ministerio")) && !roleData) {
      setEditError("Si el usuario tiene rol Universidad/Cancillería/Ministerio, la referencia es obligatoria.");
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    setEditMsg(null);
    try {
      const target = new PublicKey(editTarget.wallet);
      const targetPerson = PublicKey.findProgramAddressSync(
        [Buffer.from("person"), target.toBuffer()],
        new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID ?? "3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt")
      )[0];

      if (!(await connection.getAccountInfo(targetPerson, "confirmed"))) {
        await registerPersonAdminTx({
          connection,
          wallet: anchorWallet,
          admin: new PublicKey(publicKey.toBase58()),
          target,
          nombre,
          apellido,
          dni,
          roleData,
        });
      }

      const sig = await updatePersonAdminTx({
        connection,
        wallet: anchorWallet,
        admin: new PublicKey(publicKey.toBase58()),
        target,
        nombre,
        apellido,
        dni,
        active: editForm.active,
        roles,
        roleData,
        motivo,
      });
      setEditMsg(`Usuario actualizado. Tx: ${sig}`);
      await loadData();
      setEditTarget(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo actualizar el usuario";
      setEditError(msg);
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-primary">Panel Administrador</h1>

      {/* ── Banner de inicialización ── solo visible si el sistema no está listo */}
      {systemStatus && !systemStatus.initialized && (
        <InitBanner
          status={systemStatus}
          connection={connection}
          anchorWallet={anchorWallet}
          publicKey={publicKey}
          onSuccess={() => {
            loadSystemStatus();
            loadData();
          }}
        />
      )}

      {/* Estadísticas */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Personas" value={stats.totalPersons} />
          <StatCard label="Certificaciones" value={stats.totalCertifications} />
          <StatCard label="Activas" value={stats.activeCertifications} color="green" />
          <StatCard label="Revocadas" value={stats.revokedCertifications} color="red" />
        </div>
      )}

      {/* ── Tabs ── */}
      <div>
        {/* Tab headers */}
        <div className="flex border-b border-gray-200 mb-0">
          {(
            [
              { key: "solicitudes", label: "Solicitudes de rol pendientes", count: pendingRoleRequests.length },
              { key: "personas", label: "Personas registradas" },
              { key: "certificaciones", label: "Certificaciones emitidas" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t.label}
              {"count" in t && typeof t.count === "number" && t.count > 0 && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${activeTab === t.key ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Solicitudes de rol pendientes ── */}
        {activeTab === "solicitudes" && (
          <section className="pt-4 space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Filtrar por wallet..."
                value={filterSol.wallet}
                onChange={(e) => setFilterSol((f) => ({ ...f, wallet: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-52"
              />
              <input
                type="text"
                placeholder="Filtrar por nombre..."
                value={filterSol.nombre}
                onChange={(e) => setFilterSol((f) => ({ ...f, nombre: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-44"
              />
              <select
                value={filterSol.rol}
                onChange={(e) => setFilterSol((f) => ({ ...f, rol: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Todos los roles</option>
                <option value="Universidad">Universidad</option>
                <option value="Ministerio">Ministerio</option>
                <option value="Cancilleria">Cancillería</option>
                <option value="Egresado">Egresado</option>
              </select>
              {(filterSol.wallet || filterSol.nombre || filterSol.rol) && (
                <button
                  type="button"
                  onClick={() => setFilterSol({ wallet: "", nombre: "", rol: "" })}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {filteredSolicitudes.length === 0 ? (
              <p className="text-sm text-gray-500">No hay solicitudes pendientes{filterSol.wallet || filterSol.nombre || filterSol.rol ? " con esos filtros" : ""}.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Solicitante</th>
                      <th className="px-4 py-3 text-left">Nombre</th>
                      <th className="px-4 py-3 text-left">Referencia</th>
                      <th className="px-4 py-3 text-left">Rol</th>
                      <th className="px-4 py-3 text-left">Slot</th>
                      <th className="px-4 py-3 text-left">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredSolicitudes.map((r) => {
                      const key = `${r.requester}:${r.role}`;
                      const requesterPerson = personByWallet.get(r.requester);
                      return (
                        <tr key={key} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600" title={r.requester}>{shortAddress(r.requester)}</td>
                          <td className="px-4 py-3 text-gray-700">{requesterPerson?.nombre || "-"} {requesterPerson?.apellido || ""}</td>
                          <td className="px-4 py-3 text-gray-700">
                            <span className="text-xs text-gray-500">{roleContextLabel(r.role)}: </span>
                            <span>{requestRoleDataMap[r.requester] || requesterPerson?.role_data || "Sin dato"}</span>
                          </td>
                          <td className="px-4 py-3"><RoleBadge role={r.role} /></td>
                          <td className="px-4 py-3 text-gray-500">{r.slot}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenRequestDetail(r)}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Ver detalle
                              </button>
                              <button
                                type="button"
                                onClick={() => onApprove(r)}
                                disabled={approving === key}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                              >
                                {approving === key ? "Aprobando..." : "Aprobar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenRejectModal(r)}
                                disabled={rejecting === key}
                                className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                              >
                                {rejecting === key ? "Rechazando..." : "Rechazar"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {approvalMsg && (
              <p className="mt-3 break-all text-xs text-gray-700">{approvalMsg}</p>
            )}
          </section>
        )}

        {/* ── Tab: Personas registradas ── */}
        {activeTab === "personas" && (
          <section className="pt-4 space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Filtrar por nombre..."
                value={filterPer.nombre}
                onChange={(e) => setFilterPer((f) => ({ ...f, nombre: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-40"
              />
              <input
                type="text"
                placeholder="Filtrar por apellido..."
                value={filterPer.apellido}
                onChange={(e) => setFilterPer((f) => ({ ...f, apellido: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-40"
              />
              <input
                type="text"
                placeholder="Filtrar por wallet..."
                value={filterPer.wallet}
                onChange={(e) => setFilterPer((f) => ({ ...f, wallet: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-52"
              />
              <select
                value={filterPer.rol}
                onChange={(e) => setFilterPer((f) => ({ ...f, rol: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Todos los roles</option>
                <option value="Admin">Admin</option>
                <option value="Universidad">Universidad</option>
                <option value="Ministerio">Ministerio</option>
                <option value="Cancilleria">Cancillería</option>
                <option value="Egresado">Egresado</option>
              </select>
              <select
                value={filterPer.estado}
                onChange={(e) => setFilterPer((f) => ({ ...f, estado: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
              {(filterPer.nombre || filterPer.apellido || filterPer.wallet || filterPer.rol || filterPer.estado) && (
                <button
                  type="button"
                  onClick={() => setFilterPer({ nombre: "", apellido: "", wallet: "", rol: "", estado: "" })}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Wallet</th>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Roles</th>
                    <th className="px-4 py-3 text-left">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPersons.map((p) => {
                    const isAdmin = p.roles.some((r) => r.toLowerCase() === "admin");
                    const isSelf = publicKey?.toBase58() === p.wallet;
                    const isActive = (p.status ?? "").toLowerCase() === "activo";
                    const isToggling = togglingStatus === p.wallet;
                    return (
                      <tr key={p.wallet} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[160px]">
                          <span title={p.wallet}>{shortAddress(p.wallet)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {p.nombre} {p.apellido}
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip status={p.status ?? ""} />
                        </td>
                        <td className="px-4 py-3 flex flex-wrap gap-1">
                          {p.roles.map((r) => <RoleBadge key={r} role={r} />)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenPersonDetail(p.wallet)}
                              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Ver detalle
                            </button>
                            {!isAdmin && !isSelf ? (
                              <button
                                type="button"
                                onClick={() => onOpenEditPerson(p.wallet)}
                                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              >
                                Editar
                              </button>
                            ) : null}
                            {!isAdmin && !isSelf ? (
                              <button
                                type="button"
                                onClick={() => onToggleStatus(p)}
                                disabled={isToggling}
                                className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
                                  isActive
                                    ? "bg-red-500 hover:bg-red-600"
                                    : "bg-green-600 hover:bg-green-700"
                                }`}
                              >
                                {isToggling ? "Procesando..." : isActive ? "Deshabilitar" : "Habilitar"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredPersons.length === 0 && (
              <p className="text-sm text-gray-500">No hay personas con esos filtros.</p>
            )}
            {statusMsg && (
              <p className="mt-3 break-all text-xs text-gray-700">{statusMsg}</p>
            )}
          </section>
        )}

        {/* ── Tab: Certificaciones emitidas ── */}
        {activeTab === "certificaciones" && (
          <section className="pt-4 space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Filtrar por nombre..."
                value={filterCert.nombre}
                onChange={(e) => setFilterCert((f) => ({ ...f, nombre: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-40"
              />
              <input
                type="text"
                placeholder="Filtrar por apellido..."
                value={filterCert.apellido}
                onChange={(e) => setFilterCert((f) => ({ ...f, apellido: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-40"
              />
              <input
                type="text"
                placeholder="Filtrar por carrera..."
                value={filterCert.carrera}
                onChange={(e) => setFilterCert((f) => ({ ...f, carrera: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-44"
              />
              <input
                type="text"
                placeholder="Filtrar por año..."
                value={filterCert.anio}
                onChange={(e) => setFilterCert((f) => ({ ...f, anio: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary w-28"
              />
              <select
                value={filterCert.estado}
                onChange={(e) => setFilterCert((f) => ({ ...f, estado: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Todos los estados</option>
                <option value="Activa">Activa</option>
                <option value="Revocada">Revocada</option>
              </select>
              {(filterCert.nombre || filterCert.apellido || filterCert.carrera || filterCert.estado || filterCert.anio) && (
                <button
                  type="button"
                  onClick={() => setFilterCert({ nombre: "", apellido: "", carrera: "", estado: "", anio: "" })}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Pubkey</th>
                    <th className="px-4 py-3 text-left">Titular</th>
                    <th className="px-4 py-3 text-left">Carrera</th>
                    <th className="px-4 py-3 text-left">Año</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCertifications.map((c) => (
                    <tr key={c.pubkey} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs" title={c.pubkey}>{shortAddress(c.pubkey)}</td>
                      <td className="px-4 py-3">{c.nombre ?? ""} {c.apellido ?? ""}</td>
                      <td className="px-4 py-3">{c.carrera ?? "-"}</td>
                      <td className="px-4 py-3">{c.anio_egreso ?? "-"}</td>
                      <td className="px-4 py-3"><StatusChip status={c.estado ?? ""} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenCertificationDetail(c)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Ver detalle
                          </button>
                          {c.estado === "Revocada" ? (
                            <span className="text-xs text-gray-500">Ya revocada</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onRevokeCertification(c)}
                              disabled={revoking === c.pubkey}
                              className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                            >
                              {revoking === c.pubkey ? "Revocando..." : "Revocar"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredCertifications.length === 0 && (
              <p className="text-sm text-gray-500">No hay certificaciones con esos filtros.</p>
            )}
          </section>
        )}
      </div>

      {(selectedCertificationLoading || selectedCertificationError || selectedCertification) && (
        <CertificationDetailModal
          cert={selectedCertificationDetail ?? selectedCertification}
          loading={selectedCertificationLoading}
          error={selectedCertificationError}
          onClose={() => {
            setSelectedCertification(null);
            setSelectedCertificationDetail(null);
            setSelectedCertificationError(null);
            setSelectedCertificationLoading(false);
          }}
        />
      )}

      {(selectedPersonLoading || selectedPersonError || selectedPerson) && (
        <PersonDetailModal
          person={selectedPerson}
          loading={selectedPersonLoading}
          error={selectedPersonError}
          roleData={selectedPersonRoleData}
          identity={selectedPersonIdentity}
          onClose={() => {
            setSelectedPerson(null);
            setSelectedPersonError(null);
            setSelectedPersonLoading(false);
            setSelectedPersonRoleData(null);
            setSelectedPersonIdentity(null);
          }}
        />
      )}

      {(editLoading || editTarget || editError) && (
        <EditPersonModal
          target={editTarget}
          loading={editLoading}
          saving={savingEdit}
          error={editError}
          info={editMsg}
          form={editForm}
          onChange={setEditForm}
          onClose={() => {
            setEditTarget(null);
            setEditError(null);
            setEditLoading(false);
            setSavingEdit(false);
            setEditMsg(null);
          }}
          onSubmit={onSubmitEditPerson}
        />
      )}

      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          events={selectedRequestEvents}
          loading={selectedRequestLoading}
          error={selectedRequestError}
          requestRoleData={selectedRequestRoleData}
          person={personByWallet.get(selectedRequest.requester) ?? null}
          onClose={() => {
            setSelectedRequest(null);
            setSelectedRequestEvents([]);
            setSelectedRequestError(null);
            setSelectedRequestRoleData(null);
          }}
        />
      )}

      {rejectModalOpen && rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setRejectModalOpen(false)}>
          <div
            className="w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-primary">Rechazar solicitud de rol</h3>
                <p className="text-xs text-gray-500">
                  {rejectTarget.role} · {shortAddress(rejectTarget.requester)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <label className="block text-sm font-medium text-gray-700" htmlFor="reject-reason">
                Motivo del rechazo
              </label>
              <textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                maxLength={200}
                placeholder="Ej: Falta documentación respaldatoria de la institución"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="text-xs text-gray-500">{rejectReason.length}/200</p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  disabled={!rejectReason.trim() || !!rejecting}
                  className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                >
                  Confirmar rechazo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CertificationDetailModal({
  cert,
  loading,
  error,
  onClose,
}: {
  cert: Certification | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">Detalle de certificación</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-gray-700">
          {loading && <p className="animate-pulse text-gray-500">Cargando detalle...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!loading && !error && cert && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p><strong>Titular:</strong> {cert.nombre ?? "-"} {cert.apellido ?? ""}</p>
              <p><strong>DNI:</strong> {cert.dni ?? "-"}</p>
              <p><strong>Carrera:</strong> {cert.carrera ?? "-"}</p>
              <p><strong>Año de egreso:</strong> {cert.anio_egreso ?? "-"}</p>
              <p><strong>Estado:</strong> {cert.estado ?? "-"}</p>
              <p><strong>Universidad:</strong> {cert.universidad ?? "-"}</p>
              <p><strong>Token cert.:</strong> {cert.cert_token ?? "-"}</p>
              <p className="break-all"><strong>Pubkey:</strong> {cert.pubkey}</p>
              <p className="break-all"><strong>Hash datos:</strong> {cert.hash_datos ?? "-"}</p>
              <p><strong>Motivo revocación:</strong> {cert.motivo_revocacion ?? "-"}</p>
              <p><strong>Actualizado:</strong> {cert.updated_at ? new Date(cert.updated_at * 1000).toLocaleString() : "-"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonDetailModal({
  person,
  loading,
  error,
  roleData,
  identity,
  onClose,
}: {
  person: Person | null;
  loading: boolean;
  error: string | null;
  roleData: string | null;
  identity: { nombre: string | null; apellido: string | null; dni: string | null } | null;
  onClose: () => void;
}) {
  const resolvedRoleData = roleData ?? person?.role_data ?? null;
  
  // Usar on-chain si no hay en BD
  const displayNombre = person?.nombre || identity?.nombre || "-";
  const displayApellido = person?.apellido || identity?.apellido || "";
  const displayDni = person?.dni || identity?.dni || "-";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">Detalle de usuario</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-gray-700">
          {loading && <p className="animate-pulse text-gray-500">Cargando detalle por wallet...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!loading && !error && person && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p><strong>Nombre:</strong> {displayNombre} {displayApellido}</p>
              <p>
                <strong>DNI:</strong> {displayDni}
                {!person.dni && identity?.dni && (
                  <span className="ml-2 inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">Desde blockchain</span>
                )}
              </p>
              <p className="break-all"><strong>Wallet:</strong> {person.wallet}</p>
              <p><strong>Estado:</strong> {person.status || "-"}</p>
              <p><strong>Roles:</strong> {person.roles.length > 0 ? person.roles.join(", ") : "Sin roles"}</p>
              <p><strong>Referencia:</strong> {resolvedRoleData || "Sin dato"}</p>
              <p><strong>Actualizado:</strong> {person.updated_at ? new Date(person.updated_at * 1000).toLocaleString() : "-"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditPersonModal({
  target,
  loading,
  saving,
  error,
  info,
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  target: Person | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  info: string | null;
  form: PersonEditForm;
  onChange: React.Dispatch<React.SetStateAction<PersonEditForm>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const roleWithReference = EDITABLE_ROLES.find((role) => form.roles.includes(role));
  const roleDataRequired =
    roleWithReference === "Universidad" ||
    roleWithReference === "Cancilleria" ||
    roleWithReference === "Ministerio";
  const roleDataLabel =
    roleWithReference === "Universidad"
      ? "Universidad"
      : roleWithReference === "Cancilleria"
      ? "Pais"
      : roleWithReference === "Ministerio"
      ? "Ministerio"
      : roleWithReference === "Egresado"
      ? "Titulo"
      : "Referencia";

  const toggleRole = (role: EditableRole) => {
    onChange((prev) => {
      const has = prev.roles.includes(role);
      const roles = has ? prev.roles.filter((r) => r !== role) : [...prev.roles, role];
      return { ...prev, roles };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-primary">Editar usuario</h3>
            <p className="text-xs text-gray-500">{target ? shortAddress(target.wallet) : "Cargando..."}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loading && <p className="animate-pulse text-sm text-gray-500">Cargando usuario...</p>}

          {!loading && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  value={form.nombre}
                  onChange={(e) => onChange((prev) => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Nombre"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <input
                  value={form.apellido}
                  onChange={(e) => onChange((prev) => ({ ...prev, apellido: e.target.value }))}
                  placeholder="Apellido"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <input
                  value={form.dni}
                  onChange={(e) => onChange((prev) => ({ ...prev, dni: e.target.value }))}
                  placeholder="DNI"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-700">Estado:</span>
                <button
                  type="button"
                  onClick={() => onChange((prev) => ({ ...prev, active: !prev.active }))}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium text-white ${form.active ? "bg-green-600" : "bg-red-500"}`}
                >
                  {form.active ? "Activo" : "Inactivo"}
                </button>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Roles</p>
                <div className="flex flex-wrap gap-2">
                  {EDITABLE_ROLES.map((role) => {
                    const checked = form.roles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${checked ? "border-primary bg-primary text-white" : "border-gray-300 bg-white text-gray-700"}`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              <input
                value={form.roleData}
                onChange={(e) => onChange((prev) => ({ ...prev, roleData: e.target.value }))}
                placeholder={`${roleDataLabel}${roleDataRequired ? " (obligatorio)" : ""}`}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              />

              <textarea
                value={form.motivo}
                onChange={(e) => onChange((prev) => ({ ...prev, motivo: e.target.value }))}
                rows={3}
                maxLength={240}
                placeholder="Motivo de la actualización"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {info ? <p className="break-all text-xs text-gray-700">{info}</p> : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading || saving}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestDetailModal({
  request,
  events,
  loading,
  error,
  requestRoleData,
  person,
  onClose,
}: {
  request: PendingRoleRequest;
  events: EventRow[];
  loading: boolean;
  error: string | null;
  requestRoleData: string | null;
  person: Person | null;
  onClose: () => void;
}) {
  const roleData = requestRoleData ?? person?.role_data ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-primary">Detalle de solicitud</h3>
            <p className="text-xs text-gray-500">Rol solicitado: {request.role}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <p><strong>Solicitante:</strong> {person?.nombre || "-"} {person?.apellido || ""} ({shortAddress(request.requester)})</p>
            <p className="break-all"><strong>Wallet completa:</strong> {request.requester}</p>
            <p><strong>{roleContextLabel(request.role)}:</strong> {roleData || "Sin dato"}</p>
            <p className="break-all"><strong>Signature:</strong> {request.signature}</p>
            <p><strong>Slot:</strong> {request.slot}</p>
          </div>

          {loading && (
            <p className="text-sm text-gray-500 animate-pulse">Cargando detalle de transacción...</p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && !error && events.length === 0 && (
            <p className="text-sm text-gray-500">No se encontraron eventos para esta transacción.</p>
          )}

          {!loading && !error && events.length > 0 && (
            <div className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-700">{ev.event_type}</span>
                    <span className="text-gray-500">slot {ev.slot}</span>
                    {ev.block_time ? (
                      <span className="text-gray-500">{new Date(ev.block_time * 1000).toLocaleString()}</span>
                    ) : null}
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(ev.data), null, 2);
                      } catch {
                        return ev.data;
                      }
                    })()}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function toRole(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const k = Object.keys(value as Record<string, unknown>)[0];
    if (k) return k.charAt(0).toUpperCase() + k.slice(1);
  }
  return null;
}

function parseData(row: EventRow): Record<string, unknown> {
  try {
    return JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildPendingRoleRequests(
  requested: EventRow[],
  approved: EventRow[],
  rejected: EventRow[]
): PendingRoleRequest[] {
  const reqSorted = [...requested].sort((a, b) => a.slot - b.slot);
  const approvedSorted = [...approved].sort((a, b) => a.slot - b.slot);
  const rejectedSorted = [...rejected].sort((a, b) => a.slot - b.slot);

  const resolved = new Set<string>();
  for (const row of approvedSorted) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : null;
    const role = toRole(d.approvedRole ?? d.approved_role);
    if (requester && role) resolved.add(`${requester}:${role}`);
  }
  for (const row of rejectedSorted) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : null;
    const role = toRole(d.rejectedRole ?? d.rejected_role);
    if (requester && role) resolved.add(`${requester}:${role}`);
  }

  const latestRequests = new Map<string, PendingRoleRequest>();
  for (const row of reqSorted) {
    const d = parseData(row);
    const requester = typeof d.requester === "string" ? d.requester : null;
    const role = toRole(d.requestedRole ?? d.requested_role) as RequestableRole | null;
    if (!requester || !role) continue;
    if (!["Universidad", "Ministerio", "Cancilleria", "Egresado"].includes(role)) continue;

    const key = `${requester}:${role}`;
    latestRequests.set(key, {
      requester,
      role,
      signature: row.signature,
      slot: row.slot,
    });
  }

  return [...latestRequests.entries()]
    .filter(([key]) => !resolved.has(key))
    .map(([, value]) => value)
    .sort((a, b) => b.slot - a.slot);
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const accent =
    color === "green" ? "text-green-600" : color === "red" ? "text-red-600" : "text-accent";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-3xl font-bold ${accent}`}>{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 rounded-full border-4 border-accent border-t-transparent animate-spin" />
    </div>
  );
}

// ── Componente InitBanner ──────────────────────────────────────────────────

function InitBanner({
  status,
  connection,
  anchorWallet,
  publicKey,
  onSuccess,
}: {
  status: SystemStatus;
  connection: unknown;
  anchorWallet: ReturnType<typeof useAnchorWallet>;
  publicKey: PublicKey | null;
  onSuccess: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleInit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anchorWallet || !publicKey) {
      setMsg({ type: "error", text: "Conecta la wallet que será Admin antes de inicializar." });
      return;
    }
    if (!nombre.trim() || !apellido.trim() || !dni.trim()) {
      setMsg({ type: "error", text: "Todos los campos son obligatorios." });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const signature = await initializeAsFirstAdminTx({
        connection,
        wallet: anchorWallet,
        admin: publicKey,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        dni: dni.trim(),
      });
      setMsg({
        type: "success",
        text: `Sistema inicializado correctamente. Wallet admin: ${publicKey.toBase58()}. Tx: ${signature}`,
      });
      onSuccess();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Error desconocido al inicializar.";
      setMsg({ type: "error", text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-yellow-400 bg-yellow-50 p-6 space-y-4">
      {/* Cabecera de advertencia */}
      <div className="flex items-start gap-3">
        <span className="text-2xl select-none">⚠️</span>
        <div>
          <h2 className="text-lg font-bold text-yellow-800">Sistema no inicializado</h2>
          <p className="text-sm text-yellow-700 mt-1">
            El programa en la blockchain aún no ha sido configurado. Hasta que se inicialice,
            no se podrán registrar personas ni emitir certificaciones.
          </p>
        </div>
      </div>

      {/* Info técnica */}
      <div className="rounded-lg bg-white border border-yellow-200 p-4 space-y-2 text-sm">
        <h3 className="font-semibold text-gray-700 mb-2">¿Qué se va a inicializar?</h3>
        <ul className="list-disc list-inside text-gray-600 space-y-1">
          <li>
            <strong>ConfigPDA</strong> — Cuenta de configuración global del programa (semilla{" "}
            <code className="bg-gray-100 px-1 rounded">b&quot;config&quot;</code>).
          </li>
          <li>
            <strong>PersonAccount del admin</strong> — Cuenta de persona on-chain para la wallet
            administradora, con rol <strong>Admin</strong> asignado automáticamente.
          </li>
        </ul>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <InfoItem
            label="Wallet que firmará como admin"
            value={publicKey?.toBase58() ?? "Conecta una wallet para inicializar"}
            mono
          />
          <InfoItem label="Program ID" value={status.programId} mono />
          <InfoItem label="Red" value={status.network} />
        </div>
      </div>

      {/* Formulario */}
      {!msg?.type || msg.type === "error" ? (
        <form onSubmit={handleInit} className="space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm">Datos del administrador</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Apellido</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                placeholder="Apellido"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="DNI / identificación"
                disabled={loading}
              />
            </div>
          </div>
          {msg?.type === "error" && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {msg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-semibold text-sm transition disabled:opacity-50"
          >
            {loading && (
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            )}
            {loading ? "Inicializando…" : "Inicializar sistema"}
          </button>
        </form>
      ) : (
        <div className="rounded-lg bg-green-50 border border-green-300 p-4 text-sm text-green-800">
          ✅ {msg.text}
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-xs text-gray-800 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
