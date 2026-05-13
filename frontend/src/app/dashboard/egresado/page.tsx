"use client";

import { useEffect, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BASE, api, type AuditEntry, type Certification, type EventRow, type GraduateRequest } from "@/lib/api";
import { CertificationCard } from "@/components/CertificationCard";
import { requestCertificationTx, sha256FromFile } from "@/lib/solanaProgram";

type Tab = "certs" | "solicitar" | "actividad";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function EgresadoDashboard() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<Tab>("certs");
  const [certs, setCerts] = useState<Certification[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [request, setRequest] = useState<GraduateRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState<"Local" | "Extranjero">("Local");
  const [tituloPais, setTituloPais] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [tituloNombre, setTituloNombre] = useState("");
  const [tituloCarrera, setTituloCarrera] = useState("");
  const [tituloInstitucion, setTituloInstitucion] = useState("");
  const [tituloAnio, setTituloAnio] = useState("");
  const [tituloObs, setTituloObs] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<AuditEntry | null>(null);
  const [selectedActivityEvents, setSelectedActivityEvents] = useState<EventRow[]>([]);
  const [selectedActivityLoading, setSelectedActivityLoading] = useState(false);
  const [selectedActivityError, setSelectedActivityError] = useState<string | null>(null);

  const loadData = async (wallet: string) => {
    const [c, a, r] = await Promise.all([
      api.getCertificationsByEgresado(wallet, 100, 0),
      api.getAuditByActor(wallet, 30),
      api.getGraduateRequestByWallet(wallet),
    ]);
    setCerts(c.data);
    setAudit(a.data);
    setRequest(r.data);
  };

  useEffect(() => {
    if (!publicKey) {
      setLoading(false);
      setCerts([]);
      setAudit([]);
      setRequest(null);
      setSelectedActivity(null);
      setSelectedActivityEvents([]);
      setSelectedActivityLoading(false);
      setSelectedActivityError(null);
      return;
    }
    const wallet = publicKey.toBase58();
    setLoading(true);
    loadData(wallet).finally(() => setLoading(false));
  }, [publicKey]);

  const onRequestCertification = async () => {
    if (!publicKey || !anchorWallet) {
      setMsg("Conecta una wallet para solicitar la certificación.");
      return;
    }
    if (!pdf) {
      setMsg("Debes adjuntar el PDF de respaldo.");
      return;
    }
    if (tipo === "Extranjero" && !tituloPais.trim()) {
      setMsg("Debes indicar el país de emisión del título para solicitudes extranjeras.");
      return;
    }
    if (!tituloNombre.trim() || !tituloCarrera.trim() || !tituloInstitucion.trim() || !tituloAnio.trim() || !tituloPais.trim()) {
      setMsg("Debes completar los datos del título (nombre, carrera, institución, año y país de emisión). ");
      return;
    }
    const anioTitulo = Number(tituloAnio.trim());
    if (!Number.isInteger(anioTitulo) || anioTitulo < 1900 || anioTitulo > 2100) {
      setMsg("El año del título no es válido.");
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const pdfHash = await sha256FromFile(pdf);
      const sig = await requestCertificationTx({
        connection,
        wallet: anchorWallet,
        egresado: new PublicKey(publicKey.toBase58()),
        tipo,
        pdfHash,
        pais: tipo === "Extranjero" ? tituloPais.trim() : undefined,
      });

      let uploadError: string | null = null;
      try {
        const pdfBase64 = await fileToBase64(pdf);
        await api.uploadGraduateRequestDocument({
          wallet: publicKey.toBase58(),
          pdf_base64: pdfBase64,
          pdf_hash: Array.from(pdfHash).map((b) => b.toString(16).padStart(2, "0")).join(""),
          file_name: pdf.name || "titulo.pdf",
          mime_type: pdf.type || "application/pdf",
          titulo_nombre: tituloNombre.trim(),
          titulo_carrera: tituloCarrera.trim(),
          titulo_institucion: tituloInstitucion.trim(),
          titulo_anio: anioTitulo,
          titulo_pais: tituloPais.trim(),
          titulo_observaciones: tituloObs.trim(),
        });
      } catch (e) {
        uploadError = e instanceof Error ? e.message : "No se pudo persistir el PDF";
      }

      setMsg(uploadError ? `Solicitud enviada. Tx: ${sig}. Advertencia: ${uploadError}` : `Solicitud enviada. Tx: ${sig}`);
      await loadData(publicKey.toBase58());
    } catch (e) {
      const err = e instanceof Error ? e.message : "No se pudo enviar la solicitud";
      setMsg(err);
    } finally {
      setSubmitting(false);
    }
  };

  const hasPendingRequest = (() => {
    const estado = (request?.estado ?? "").trim();
    if (!estado) return false;
    return ["Pendiente", "AprobadoLocal", "DerivadoCancilleria"].includes(estado);
  })();

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "certs", label: "Mis certificaciones" },
    { key: "solicitar", label: "Solicitar certificación", count: hasPendingRequest ? 1 : undefined },
    { key: "actividad", label: "Mi actividad" },
  ];

  const openActivityDetail = async (entry: AuditEntry) => {
    setSelectedActivity(entry);
    setSelectedActivityEvents([]);
    setSelectedActivityError(null);
    setSelectedActivityLoading(true);

    try {
      const tx = await api.getTransactionBySignature(entry.signature);
      setSelectedActivityEvents(tx.data);
    } catch {
      setSelectedActivityError("No se pudieron cargar los eventos de la transacción.");
    } finally {
      setSelectedActivityLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-primary">Mi Panel</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="font-semibold text-primary">Estado de mi solicitud actual</p>
        <p className="mt-1 text-gray-600">
          {request ? `Estado: ${request.estado ?? "Sin estado"}` : "Todavía no registras una solicitud."}
        </p>
        {(request?.motivo || request?.motivo_rechazo) && (
          <p className="mt-1 text-red-600">Motivo: {request.motivo ?? request.motivo_rechazo}</p>
        )}
      </div>

      <div className="border-b border-gray-200 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              tab === t.key ? "border-b-2 border-accent text-accent" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "certs" && (
        <section>
          {loading ? (
            <Spinner />
          ) : certs.length === 0 ? (
            <p className="text-sm text-gray-400">No se encontraron certificaciones.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {certs.map((c) => (
                <CertificationCard key={c.pubkey} cert={c} showQR showDni />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "solicitar" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold text-primary">Nueva solicitud</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "Local" | "Extranjero")}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="Local">Local</option>
              <option value="Extranjero">Extranjero</option>
            </select>
            <input
              value={tituloPais}
              onChange={(e) => setTituloPais(e.target.value)}
              placeholder="País de emisión del título"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={tituloNombre}
              onChange={(e) => setTituloNombre(e.target.value)}
              placeholder="Nombre del título"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={tituloCarrera}
              onChange={(e) => setTituloCarrera(e.target.value)}
              placeholder="Carrera"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={tituloInstitucion}
              onChange={(e) => setTituloInstitucion(e.target.value)}
              placeholder="Institución emisora"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={tituloAnio}
              onChange={(e) => setTituloAnio(e.target.value)}
              placeholder="Año de egreso"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={tituloObs}
              onChange={(e) => setTituloObs(e.target.value)}
              placeholder="Observaciones"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {tipo === "Extranjero" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">Instrucciones para evaluación de título extranjero</p>
              <p className="mt-1">
                El PDF adjunto debe incluir obligatoriamente: título, analítico y documento de
                identidad actualizado del solicitante. Si falta alguno de estos documentos,
                la solicitud no podrá ser evaluada.
              </p>
            </div>
          )}

          <div>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">Se calcula SHA-256 del PDF antes de enviar.</p>
          </div>
          <button
            type="button"
            onClick={onRequestCertification}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Enviando..." : "Solicitar certificación"}
          </button>
          {msg && <p className="text-xs break-all text-gray-700">{msg}</p>}
        </section>
      )}

      {tab === "actividad" && (
        <section>
          <h2 className="text-lg font-semibold text-primary mb-3">Mi actividad reciente</h2>
          {audit.length === 0 ? (
            <p className="text-sm text-gray-400">Sin actividad reciente.</p>
          ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Acción</th>
                  <th className="px-4 py-3 text-left">Entidad</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {audit.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-medium">{e.accion}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[180px]">
                      {e.entidad}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(e.timestamp * 1000).toLocaleString("es-AR")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openActivityDetail(e)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}

      {selectedActivity && (
        <ActivityDetailModal
          entry={selectedActivity}
          events={selectedActivityEvents}
          loading={selectedActivityLoading}
          error={selectedActivityError}
          request={request}
          onClose={() => {
            setSelectedActivity(null);
            setSelectedActivityEvents([]);
            setSelectedActivityLoading(false);
            setSelectedActivityError(null);
          }}
        />
      )}
    </div>
  );
}

function ActivityDetailModal({
  entry,
  events,
  loading,
  error,
  request,
  onClose,
}: {
  entry: AuditEntry;
  events: EventRow[];
  loading: boolean;
  error: string | null;
  request: GraduateRequest | null;
  onClose: () => void;
}) {
  const parseEventData = (row: EventRow): Record<string, unknown> => {
    try {
      return JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const firstEventData = events.length > 0 ? parseEventData(events[0]) : {};

  const displayOperationDetail = () => {
    if (entry.accion === "RequestCertification") {
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-primary">Detalle de solicitud de certificación</p>
          <p><strong>Estado:</strong> {request?.estado ?? "-"}</p>
          <p><strong>Tipo:</strong> {request?.tipo ?? String(firstEventData.tipo ?? "-")}</p>
          <p><strong>Título:</strong> {request?.titulo_nombre ?? "-"}</p>
          <p><strong>Carrera:</strong> {request?.titulo_carrera ?? "-"}</p>
          <p><strong>Institución:</strong> {request?.titulo_institucion ?? "-"}</p>
          <p><strong>Año:</strong> {request?.titulo_anio ?? "-"}</p>
          <p><strong>País de emisión del título:</strong> {request?.titulo_pais ?? request?.pais ?? String(firstEventData.pais ?? "-")}</p>
          <p className="break-all"><strong>Hash PDF:</strong> {request?.pdf_hash ?? String(firstEventData.pdf_hash ?? firstEventData.pdfHash ?? "-")}</p>
          <p>
            <strong>Documento:</strong>{" "}
            {request?.pdf_url ? (
              <a
                href={`${BASE}${request.pdf_url}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                {request.pdf_file_name ?? "Ver PDF"}
              </a>
            ) : (
              "No cargado"
            )}
          </p>
        </div>
      );
    }

    if (entry.accion === "RequestRole") {
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-primary">Detalle de solicitud de rol</p>
          <p><strong>Rol solicitado:</strong> {String(firstEventData.requested_role ?? firstEventData.requestedRole ?? "-")}</p>
          <p><strong>Referencia / rol data:</strong> {String(firstEventData.role_data ?? firstEventData.roleData ?? "-")}</p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <p className="text-sm font-semibold text-primary">Detalle de operación</p>
        <p>Esta operación no tiene un detalle especializado; se muestra el resumen técnico y eventos.</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-primary">Detalle de actividad</h3>
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

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <p><strong>Acción:</strong> {entry.accion}</p>
            <p className="break-all"><strong>Entidad (PDA):</strong> {entry.entidad}</p>
            <p className="break-all"><strong>Signature:</strong> {entry.signature}</p>
            <p><strong>Fecha:</strong> {new Date(entry.timestamp * 1000).toLocaleString("es-AR")}</p>
            <p><strong>Motivo:</strong> {entry.motivo ?? "-"}</p>
          </div>

          {displayOperationDetail()}

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
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 rounded-full border-4 border-accent border-t-transparent animate-spin" />
    </div>
  );
}
