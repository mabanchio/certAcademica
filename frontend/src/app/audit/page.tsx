"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type AuditEntry, type EventRow, type Person } from "@/lib/api";
import { useRole } from "@/hooks/useRole";

function resolveEntityLabel(person: Person | undefined): string {
  const roleData = (person?.role_data ?? "").trim();
  if (roleData) return roleData;
  if (person?.roles.includes("Admin")) return "Administración del sistema";
  return "Sin entidad registrada";
}

function resolveActorLabel(person: Person | undefined): string {
  const fullName = `${person?.nombre ?? ""} ${person?.apellido ?? ""}`.trim();
  if (fullName) return fullName;
  return "Actor sin nombre registrado";
}

export default function AuditPage() {
  const { roles, loading: roleLoading } = useRole();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<EventRow[]>([]);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [operationType, setOperationType] = useState("");
  const LIMIT = 50;

  const isAdmin = roles.includes("Admin");
  const personsByWallet = useMemo(() => new Map(persons.map((person) => [person.wallet, person])), [persons]);

  const normalizedEntries = useMemo(
    () =>
      entries.map((entry) => ({
        person: personsByWallet.get(entry.actor),
        ...entry,
        actionText: entry.accion.trim(),
        actorText: resolveActorLabel(personsByWallet.get(entry.actor)),
        entityText: resolveEntityLabel(personsByWallet.get(entry.actor)),
        signatureText: entry.signature.trim(),
        dateText: new Date(entry.timestamp * 1000).toLocaleString("es-AR"),
      })),
    [entries, personsByWallet]
  );

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();

    return normalizedEntries.filter((entry) => {
      if (operationType.length > 0 && entry.actionText !== operationType) return false;

      if (q) {
        const haystack = [
          entry.actionText,
          entry.actorText,
          entry.entityText,
          entry.signatureText,
          entry.dateText,
          entry.actor,
          entry.entidad,
          entry.motivo ?? "",
          entry.person?.role_data ?? "",
          entry.person?.wallet ?? "",
          String(entry.id),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [search, operationType, normalizedEntries]);

  const operationOptions = useMemo(
    () => [...new Set(entries.map((entry) => entry.accion.trim()))].sort((a, b) => a.localeCompare(b, "es")),
    [entries]
  );

  const openTransactionDetail = async (entry: AuditEntry) => {
    setSelectedEntry(entry);
    setSelectedEvents([]);
    setSelectedError(null);
    setSelectedLoading(true);
    try {
      const tx = await api.getTransactionBySignature(entry.signature);
      setSelectedEvents(tx.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el detalle de la transacción.";
      setSelectedError(message);
    } finally {
      setSelectedLoading(false);
    }
  };

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([api.getAuditLog(LIMIT, offset), api.getPersons(500, 0)])
      .then(([auditResult, personsResult]) => {
        setEntries(auditResult.data);
        setPersons(personsResult.data);
      })
      .finally(() => setLoading(false));
  }, [offset, isAdmin, roleLoading]);

  if (roleLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 rounded-full border-4 border-accent border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold text-primary">Registro de Auditoría</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Acceso restringido: solo el administrador puede visualizar el panel de auditoría.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-primary">Registro de Auditoría</h1>
      <p className="text-sm text-gray-500">
        Todas las acciones registradas on-chain, indexadas en tiempo real. Esta vista consolida transacciones de todos los actores.
      </p>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 rounded-full border-4 border-accent border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="mb-1 flex flex-wrap gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por cualquier campo (acción, actor, entidad, firma, wallet, fecha...)"
              className="min-w-[260px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={operationType}
              onChange={(e) => setOperationType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Todos los tipos de operación</option>
              {operationOptions.map((operation) => (
                <option key={operation} value={operation}>{operation}</option>
              ))}
            </select>
          </div>

          <div className="mb-3 text-xs text-gray-500">
            Mostrando {filteredEntries.length} de {entries.length} transacciones
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Acción</th>
                  <th className="px-4 py-3 text-left">Actor</th>
                  <th className="px-4 py-3 text-left">Entidad</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Firma</th>
                  <th className="px-4 py-3 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{offset + e.id}</td>
                    <td className="px-4 py-3 font-medium">{e.actionText}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="block truncate max-w-[220px]">{e.actorText}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="block truncate max-w-[220px]">{e.entityText}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {e.dateText}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <a
                        href={`https://explorer.solana.com/tx/${e.signature}?cluster=custom`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline font-mono"
                        title={e.signature}
                      >
                        {e.signature.slice(0, 10)}…
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openTransactionDetail(e)}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      No hay transacciones que coincidan con los filtros actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              ← Anterior
            </button>
            <button
              disabled={entries.length < LIMIT}
              onClick={() => setOffset(offset + LIMIT)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Siguiente →
            </button>
          </div>

          {selectedEntry && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setSelectedEntry(null)}>
              <div
                className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                  <h3 className="text-base font-semibold text-primary">Detalle de transacción</h3>
                  <button
                    type="button"
                    onClick={() => setSelectedEntry(null)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cerrar
                  </button>
                </div>

                <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4 text-sm text-gray-700">
                  {selectedLoading && <p className="animate-pulse text-gray-500">Cargando detalle...</p>}
                  {selectedError && <p className="text-red-600">{selectedError}</p>}

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <p><strong>Acción:</strong> {selectedEntry.accion}</p>
                    <p><strong>Actor:</strong> {resolveActorLabel(personsByWallet.get(selectedEntry.actor))}</p>
                    <p><strong>Entidad:</strong> {resolveEntityLabel(personsByWallet.get(selectedEntry.actor))}</p>
                    <p><strong>Fecha:</strong> {new Date(selectedEntry.timestamp * 1000).toLocaleString("es-AR")}</p>
                    <p className="break-all"><strong>Firma:</strong> {selectedEntry.signature}</p>
                    <p className="break-all"><strong>Referencia:</strong> {selectedEntry.entidad}</p>
                  </div>

                  {!selectedLoading && !selectedError && selectedEvents.length === 0 && (
                    <p className="text-sm text-gray-500">No se encontraron eventos para esta transacción.</p>
                  )}

                  {selectedEvents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-primary">Eventos de la transacción</p>
                      {selectedEvents.map((eventRow) => (
                        <div key={eventRow.id} className="rounded-lg border border-gray-200 p-3">
                          <p className="mb-2 text-xs text-gray-500">{eventRow.event_type} · slot {eventRow.slot}</p>
                          <pre className="overflow-x-auto rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(eventRow.data), null, 2);
                              } catch {
                                return eventRow.data;
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
          )}
        </>
      )}
    </div>
  );
}
