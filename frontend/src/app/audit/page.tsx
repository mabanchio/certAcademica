"use client";

import { useEffect, useState } from "react";
import { api, type AuditEntry } from "@/lib/api";
import { useRole } from "@/hooks/useRole";

export default function AuditPage() {
  const { roles, loading: roleLoading } = useRole();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const isAdmin = roles.includes("Admin");

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.getAuditLog(LIMIT, offset)
      .then((r) => setEntries(r.data))
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
        Todas las acciones registradas on-chain, indexadas en tiempo real.
      </p>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 rounded-full border-4 border-accent border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Acción</th>
                  <th className="px-4 py-3 text-left">Actor</th>
                  <th className="px-4 py-3 text-left">Entidad</th>
                  <th className="px-4 py-3 text-left">Motivo</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Firma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400">{offset + e.id}</td>
                    <td className="px-4 py-3 font-medium">{e.accion}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[120px]">
                      {e.actor}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[120px]">
                      {e.entidad}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                      {e.motivo || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(e.timestamp * 1000).toLocaleString("es-AR")}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://explorer.solana.com/tx/${e.signature}?cluster=custom`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent text-xs hover:underline font-mono"
                      >
                        {e.signature.slice(0, 8)}…
                      </a>
                    </td>
                  </tr>
                ))}
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
        </>
      )}
    </div>
  );
}
