"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { api, type AuditEntry, type EventRow, type GraduateRequest, type Person } from "@/lib/api";
import { approveForeignTx, fetchPersonIdentityOnChain, rejectForeignTx } from "@/lib/solanaProgram";

type Tab = "solicitudes" | "actividad";

function parseEventData(row: EventRow): Record<string, unknown> {
  try {
    return JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function shortKey(value: string): string {
  if (!value) return "";
  if (value.length <= 11) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function displayName(person: Person | null): string {
  if (!person) return "-";
  const fullName = `${person.nombre ?? ""} ${person.apellido ?? ""}`.trim();
  return fullName.length > 0 ? fullName : "-";
}

function extractRequesterWallet(events: EventRow[]): string | null {
  for (const ev of events) {
    const data = parseEventData(ev);
    const wallet = data.wallet ?? data.requester;
    if (typeof wallet === "string" && wallet.length > 0) return wallet;
  }
  return null;
}

export default function CancilleriaDashboard() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<Tab>("solicitudes");
  const [requests, setRequests] = useState<GraduateRequest[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [peopleByWallet, setPeopleByWallet] = useState<Record<string, Person>>({});
  const [requestSearch, setRequestSearch] = useState("");
  const [requestCountryFilter, setRequestCountryFilter] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityActionFilter, setActivityActionFilter] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<GraduateRequest | null>(null);
  const [selectedRequestRequester, setSelectedRequestRequester] = useState<Person | null>(null);
  const [selectedRequestResolver, setSelectedRequestResolver] = useState<Person | null>(null);
  const [selectedRequestEvents, setSelectedRequestEvents] = useState<EventRow[]>([]);
  const [selectedRequestError, setSelectedRequestError] = useState<string | null>(null);
  const [selectedRequestLoading, setSelectedRequestLoading] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<AuditEntry | null>(null);
  const [selectedActivityActor, setSelectedActivityActor] = useState<Person | null>(null);
  const [selectedActivityRequester, setSelectedActivityRequester] = useState<Person | null>(null);
  const [selectedActivityEvents, setSelectedActivityEvents] = useState<EventRow[]>([]);
  const [selectedActivityError, setSelectedActivityError] = useState<string | null>(null);
  const [selectedActivityLoading, setSelectedActivityLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<GraduateRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadData = async (wallet: string) => {
    const [a, r, p] = await Promise.all([
      api.getAuditByActor(wallet, 30),
      api.getGraduateRequestsByStatus("DerivadoCancilleria"),
      api.getPersons(200, 0),
    ]);
    setRequests(r.data);
    setAudit(a.data.filter((e) => ["ApproveForeign", "RejectForeign", "DeriveCancilleria"].includes(e.accion)));
    const map: Record<string, Person> = {};
    for (const person of p.data) map[person.wallet] = person;
    setPeopleByWallet(map);
  };

  useEffect(() => {
    if (!publicKey) {
      setAudit([]);
      setRequests([]);
      setPeopleByWallet({});
      setLoading(false);
      return;
    }

    const wallet = publicKey.toBase58();
    loadData(wallet).finally(() => setLoading(false));
  }, [publicKey]);

  const run = async (key: string, action: () => Promise<string>) => {
    if (!anchorWallet || !publicKey) {
      setMsg("Conecta una wallet Cancillería para operar.");
      return;
    }
    setBusyKey(key);
    setMsg(null);
    try {
      const sig = await action();
      setMsg(`Transacción enviada: ${sig}`);
      await loadData(publicKey.toBase58());
    } catch (e) {
      const err = e instanceof Error ? e.message : "Error en transacción";
      setMsg(err);
    } finally {
      setBusyKey(null);
    }
  };

  const cancilleriaPk = publicKey ? new PublicKey(publicKey.toBase58()) : null;

  const confirmReject = async () => {
    if (!rejectTarget || !cancilleriaPk) return;
    const motivo = rejectReason.trim();
    if (!motivo) return;

    const key = `c:${rejectTarget.wallet}`;
    await run(`${key}:reject`, () => rejectForeignTx({
      connection,
      wallet: anchorWallet,
      cancilleria: cancilleriaPk,
      egresadoWallet: new PublicKey(rejectTarget.wallet),
      motivo,
    }));

    setRejectTarget(null);
    setRejectReason("");
  };

  const openRequestDetail = async (request: GraduateRequest) => {
    setSelectedRequest(request);
    setSelectedRequestRequester(peopleByWallet[request.wallet] ?? null);
    setSelectedRequestResolver(null);
    setSelectedRequestEvents([]);
    setSelectedRequestError(null);
    setSelectedRequestLoading(true);

    const auditPromise = request.pubkey ? api.getAuditLog(300, 0) : Promise.resolve({ data: [] as AuditEntry[] });
    const [auditResult, personApiResult, personOnChainResult] = await Promise.allSettled([
      auditPromise,
      api.getPerson(request.wallet),
      fetchPersonIdentityOnChain({
        connection,
        wallet: new PublicKey(request.wallet),
      }),
    ]);

    if (personApiResult.status === "fulfilled") {
      setSelectedRequestRequester(personApiResult.value.data);
    }

    if (personOnChainResult.status === "fulfilled" && personOnChainResult.value) {
      setSelectedRequestRequester((prev) => {
        if (!prev) {
          return {
            wallet: request.wallet,
            nombre: personOnChainResult.value?.nombre ?? null,
            apellido: personOnChainResult.value?.apellido ?? null,
            dni: personOnChainResult.value?.dni ?? null,
            status: null,
            roles: [],
            role_data: null,
            updated_at: null,
          };
        }

        return {
          ...prev,
          nombre: prev.nombre ?? personOnChainResult.value?.nombre ?? null,
          apellido: prev.apellido ?? personOnChainResult.value?.apellido ?? null,
          dni: prev.dni ?? personOnChainResult.value?.dni ?? null,
        };
      });
    }

    let matchedAudit: AuditEntry | null = null;
    if (auditResult.status === "fulfilled" && request.pubkey) {
      matchedAudit = auditResult.value.data.find(
        (entry) => entry.entidad === request.pubkey && ["DeriveCancilleria", "ApproveForeign", "RejectForeign"].includes(entry.accion)
      ) ?? null;
    }

    if (matchedAudit) {
      const [eventsResult] = await Promise.allSettled([
        api.getTransactionBySignature(matchedAudit.signature),
      ]);

      if (eventsResult.status === "fulfilled") setSelectedRequestEvents(eventsResult.value.data);
      setSelectedRequestResolver(peopleByWallet[matchedAudit.actor] ?? null);
    }

    if (!(peopleByWallet[request.wallet] ?? null) && !matchedAudit) {
      setSelectedRequestError("No se pudo cargar el detalle completo de la solicitud.");
    }

    setSelectedRequestLoading(false);
  };

  const openActivityDetail = async (entry: AuditEntry) => {
    setSelectedActivity(entry);
    setSelectedActivityActor(peopleByWallet[entry.actor] ?? null);
    setSelectedActivityRequester(null);
    setSelectedActivityEvents([]);
    setSelectedActivityError(null);
    setSelectedActivityLoading(true);

    const [eventsResult] = await Promise.allSettled([
      api.getTransactionBySignature(entry.signature),
    ]);

    const events = eventsResult.status === "fulfilled" ? eventsResult.value.data : [];
    if (eventsResult.status === "fulfilled") setSelectedActivityEvents(events);

    const requesterWallet = extractRequesterWallet(events);
    if (requesterWallet) {
      setSelectedActivityRequester(peopleByWallet[requesterWallet] ?? null);
    }

    if (eventsResult.status === "rejected") {
      setSelectedActivityError("No se pudo cargar el detalle de la actividad.");
    }

    setSelectedActivityLoading(false);
  };

  const countryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const r of requests) {
      if (r.pais && r.pais.trim().length > 0) values.add(r.pais.trim());
    }
    return [...values].sort((a, b) => a.localeCompare(b, "es"));
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    return requests.filter((r) => {
      const person = peopleByWallet[r.wallet];
      const name = displayName(person).toLowerCase();
      const matchSearch =
        q.length === 0 ||
        name.includes(q) ||
        r.wallet.toLowerCase().includes(q) ||
        (r.tipo ?? "").toLowerCase().includes(q) ||
        (r.pais ?? "").toLowerCase().includes(q);
      const matchCountry = requestCountryFilter.length === 0 || (r.pais ?? "") === requestCountryFilter;
      return matchSearch && matchCountry;
    });
  }, [requests, peopleByWallet, requestSearch, requestCountryFilter]);

  const activityActions = useMemo(() => {
    return [...new Set(audit.map((e) => e.accion))].sort((a, b) => a.localeCompare(b, "es"));
  }, [audit]);

  const filteredAudit = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    return audit.filter((e) => {
      const matchAction = activityActionFilter.length === 0 || e.accion === activityActionFilter;
      const matchSearch =
        q.length === 0 ||
        e.accion.toLowerCase().includes(q) ||
        e.entidad.toLowerCase().includes(q) ||
        e.signature.toLowerCase().includes(q);
      return matchAction && matchSearch;
    });
  }, [audit, activitySearch, activityActionFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-primary">Panel Cancillería</h1>
      <p className="text-sm text-gray-500">
        Solicitudes de certificación extranjera derivadas al área.
      </p>

      <div className="border-b border-gray-200 flex gap-1 overflow-x-auto">
        {[
          { key: "solicitudes", label: "Solicitudes extranjeras" },
          { key: "actividad", label: "Mi actividad" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              tab === t.key ? "border-b-2 border-accent text-accent" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 rounded-full border-4 border-accent border-t-transparent animate-spin" />
        </div>
      ) : tab === "solicitudes" && requests.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No hay solicitudes derivadas a Cancillería en este momento.
        </div>
      ) : tab === "actividad" && audit.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No hay actividad registrada de tu rol en Cancillería.
        </div>
      ) : tab === "solicitudes" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={requestSearch}
              onChange={(e) => setRequestSearch(e.target.value)}
              placeholder="Filtrar por solicitante, wallet, tipo o país"
              className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={requestCountryFilter}
              onChange={(e) => setRequestCountryFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Todos los países</option>
              {countryOptions.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Wallet</th>
                <th className="px-4 py-3 text-left">Solicitante</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">País</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRequests.map((r) => {
                const key = `c:${r.wallet}`;
                const requester = peopleByWallet[r.wallet] ?? null;
                return (
                  <tr key={r.wallet}>
                    <td className="px-4 py-3 font-mono text-xs" title={r.wallet}>{shortKey(r.wallet)}</td>
                    <td className="px-4 py-3">{displayName(requester)}</td>
                    <td className="px-4 py-3">{r.tipo ?? "-"}</td>
                    <td className="px-4 py-3">{r.pais ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openRequestDetail(r)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >Ver detalle</button>
                        <button
                          type="button"
                          disabled={busyKey === key || !cancilleriaPk}
                          onClick={() => run(`${key}:approve`, () => approveForeignTx({
                            connection,
                            wallet: anchorWallet,
                            cancilleria: cancilleriaPk!,
                            egresadoWallet: new PublicKey(r.wallet),
                          }))}
                          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >Aprobar</button>
                        <button
                          type="button"
                          disabled={busyKey === key || !cancilleriaPk}
                          onClick={() => {
                            setRejectTarget(r);
                            setRejectReason("");
                          }}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >Rechazar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No hay solicitudes que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Filtrar por acción, entidad o firma"
              className="min-w-[240px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={activityActionFilter}
              onChange={(e) => setActivityActionFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Todas las acciones</option>
              {activityActions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Acción</th>
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Motivo</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAudit.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{e.accion}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[140px]">
                    {shortKey(e.actor)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.motivo || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(e.timestamp * 1000).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openActivityDetail(e)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >Ver detalle</button>
                  </td>
                </tr>
              ))}
              {filteredAudit.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No hay actividades que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </section>
      )}

      {selectedRequest && (
        <TransactionDetailModal
          title="Detalle de solicitud extranjera"
          request={selectedRequest}
          requester={selectedRequestRequester}
          resolver={selectedRequestResolver}
          events={selectedRequestEvents}
          loading={selectedRequestLoading}
          error={selectedRequestError}
          onClose={() => {
            setSelectedRequest(null);
            setSelectedRequestRequester(null);
            setSelectedRequestResolver(null);
            setSelectedRequestEvents([]);
            setSelectedRequestError(null);
            setSelectedRequestLoading(false);
          }}
        />
      )}

      {selectedActivity && (
        <TransactionDetailModal
          title="Detalle de actividad"
          auditEntry={selectedActivity}
          request={null}
          requester={selectedActivityRequester}
          resolver={selectedActivityActor}
          events={selectedActivityEvents}
          loading={selectedActivityLoading}
          error={selectedActivityError}
          onClose={() => {
            setSelectedActivity(null);
            setSelectedActivityActor(null);
            setSelectedActivityRequester(null);
            setSelectedActivityEvents([]);
            setSelectedActivityError(null);
            setSelectedActivityLoading(false);
          }}
        />
      )}

      {rejectTarget && (
        <RejectReasonModal
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onCancel={() => {
            setRejectTarget(null);
            setRejectReason("");
          }}
          onConfirm={confirmReject}
        />
      )}
      {msg && <p className="text-xs break-all text-gray-700">{msg}</p>}
    </div>
  );
}

function RejectReasonModal({
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">Rechazar trámite</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-gray-700">
          <p>Ingresa el motivo para registrar el rechazo en auditoría.</p>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Describe el motivo..."
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={reason.trim().length === 0}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Confirmar rechazo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionDetailModal({
  title,
  auditEntry,
  request,
  requester,
  resolver,
  events,
  loading,
  error,
  onClose,
}: {
  title: string;
  auditEntry?: AuditEntry | null;
  request: GraduateRequest | null;
  requester: Person | null;
  resolver: Person | null;
  events: EventRow[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const rejectReason = (() => {
    if (auditEntry?.motivo && auditEntry.motivo.trim().length > 0) return auditEntry.motivo;
    for (const ev of events) {
      const d = parseEventData(ev);
      const reason = d.reason ?? d.motivo;
      if (typeof reason === "string" && reason.trim().length > 0) return reason;
    }
    return null;
  })();

  const txSignature = auditEntry?.signature ?? events[0]?.signature ?? null;
  const txSlot = events[0]?.slot ?? null;
  const txBlockTime = events[0]?.block_time ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4 text-sm text-gray-700">
          {loading && <p className="animate-pulse text-gray-500">Cargando detalle...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!loading && (
            <>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p><strong>Solicitante:</strong> {displayName(requester)}</p>
                <p><strong>DNI solicitante:</strong> {requester?.dni ?? "-"}</p>
                <p className="break-all"><strong>Wallet solicitante:</strong> {requester?.wallet ?? request?.wallet ?? "-"}</p>
                <p><strong>Resolvió:</strong> {displayName(resolver)}</p>
                <p className="break-all"><strong>Wallet resolvió:</strong> {resolver?.wallet ?? auditEntry?.actor ?? "-"}</p>
                <p><strong>Tipo:</strong> {request?.tipo ?? "-"}</p>
                <p><strong>País:</strong> {request?.pais ?? "-"}</p>
                <p><strong>Estado:</strong> {request?.estado ?? "-"}</p>
                <p><strong>Observaciones rechazo:</strong> {rejectReason ?? "-"}</p>
                <p className="break-all"><strong>Entidad (PDA):</strong> {auditEntry?.entidad ?? request?.pubkey ?? "-"}</p>
                <p className="break-all"><strong>Signature:</strong> {txSignature ?? "-"}</p>
                <p><strong>Slot:</strong> {txSlot ?? "-"}</p>
                <p><strong>Fecha bloque:</strong> {txBlockTime ? new Date(txBlockTime * 1000).toLocaleString("es-AR") : "-"}</p>
              </div>

              {events.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">Eventos de la transacción</p>
                  {events.map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-gray-200 p-3">
                      <p className="mb-2 text-xs text-gray-500">{ev.event_type} · slot {ev.slot}</p>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
