"use client";

import { useEffect, useState } from "react";
import { api, type VerifyResult } from "@/lib/api";
import { StatusChip } from "@/components/StatusChip";
import { QRCodeDisplay } from "@/components/QRCode";

export default function VerifyPage({ params }: { params: { pubkey: string } }) {
  const { pubkey } = params;
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.verifyGet(pubkey)
      .then((r) => setResult(r.data))
      .catch(() => setError("Certificación no encontrada o inválida."))
      .finally(() => setLoading(false));
  }, [pubkey]);

  const verifyUrl =
    typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-2xl font-bold text-primary">Verificación de Certificación</h1>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 rounded-full border-4 border-accent border-t-transparent animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-5 text-red-700 text-sm">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Estado prominente */}
          <div
            className={`rounded-xl px-6 py-5 flex items-center gap-4 ${
              result.valid && result.certification?.estado === "Activa"
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <span className="text-4xl">
              {result.valid && result.certification?.estado === "Activa" ? "✅" : "❌"}
            </span>
            <div>
              <p className="font-semibold text-lg">
                {result.valid && result.certification?.estado === "Activa"
                  ? "Certificación válida"
                  : "Certificación inválida o revocada"}
              </p>
              <p className="text-sm text-gray-500">Pubkey: {pubkey}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm font-medium text-primary">Validación contra blockchain</p>
            <p className={result.blockchainVerified ? "text-sm text-green-700" : "text-sm text-red-700"}>
              {result.blockchainVerified
                ? "La certificación coincide con el estado on-chain del programa."
                : "La certificación no pudo validarse completamente contra blockchain."}
            </p>
            {result.validationErrors.length > 0 && (
              <ul className="text-sm text-red-700 list-disc pl-5 space-y-1">
                {result.validationErrors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Datos de la certificación */}
          {result.certification && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 grid sm:grid-cols-2 gap-4">
              <Field label="Nombre"
                value={`${result.certification.nombre} ${result.certification.apellido}`} />
              <Field label="Carrera" value={result.certification.carrera ?? undefined} />
              <Field label="Estado">
                <StatusChip status={result.certification.estado ?? ""} />
              </Field>
              <Field
                label="Institución"
                value={result.universidadNombre ?? result.certification.universidad ?? undefined}
              />
            </div>
          )}

          {/* QR */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-gray-500">Compartir esta verificación:</p>
            <QRCodeDisplay value={verifyUrl} size={200} label={verifyUrl} />
          </div>

          {/* Historial de auditoría */}
          {result.auditHistory.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-primary mb-3">Historial de la certificación</h2>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Acción</th>
                      <th className="px-4 py-3 text-left">Actor</th>
                      <th className="px-4 py-3 text-left">Motivo</th>
                      <th className="px-4 py-3 text-left">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.auditHistory.map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-3 font-medium">{e.accion}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {e.actor.slice(0, 12)}…
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {e.motivo
                            ? e.motivo
                            : e.accion === "AssignToken"
                            ? "Emisión de certificación"
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(e.timestamp * 1000).toLocaleString("es-AR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase mb-0.5">{label}</p>
      {children ?? <p className="font-medium text-primary">{value}</p>}
    </div>
  );
}
