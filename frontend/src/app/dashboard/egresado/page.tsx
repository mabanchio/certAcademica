"use client";

import { useEffect, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { api, type AuditEntry, type Certification, type GraduateRequest } from "@/lib/api";
import { CertificationCard } from "@/components/CertificationCard";
import { requestCertificationTx, sha256FromFile } from "@/lib/solanaProgram";

type Tab = "certs" | "solicitar" | "actividad";

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
  const [pais, setPais] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadData = async (wallet: string) => {
    const [c, a, r] = await Promise.all([
      api.getCertifications(100, 0),
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
    if (tipo === "Extranjero" && !pais.trim()) {
      setMsg("Debes indicar el país para solicitudes extranjeras.");
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
        pais: tipo === "Extranjero" ? pais.trim() : undefined,
      });
      setMsg(`Solicitud enviada. Tx: ${sig}`);
      await loadData(publicKey.toBase58());
    } catch (e) {
      const err = e instanceof Error ? e.message : "No se pudo enviar la solicitud";
      setMsg(err);
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "certs", label: "Mis certificaciones" },
    { key: "solicitar", label: "Solicitar certificación" },
    { key: "actividad", label: "Mi actividad" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-primary">Mi Panel</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="font-semibold text-primary">Estado de mi solicitud actual</p>
        <p className="mt-1 text-gray-600">
          {request ? `Estado: ${request.estado ?? "Sin estado"}` : "Todavía no registras una solicitud."}
        </p>
        {request?.motivo && <p className="mt-1 text-red-600">Motivo: {request.motivo}</p>}
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
                <CertificationCard key={c.pubkey} cert={c} showQR />
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
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              placeholder="País (solo extranjero)"
              disabled={tipo !== "Extranjero"}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
            />
          </div>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}
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
