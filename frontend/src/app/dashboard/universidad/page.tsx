"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { api, type AuditEntry, type CertTokenAvailable, type Certification, type TokenRequest } from "@/lib/api";
import { assignTokenTx, fetchTokenRequestDetailOnChain, mintTokenTx, requestTokensTx, sha256FromText } from "@/lib/solanaProgram";

// ── Tipos de solapas ───────────────────────────────────────────────────────
type Tab = "certificaciones" | "solicitudes" | "acciones" | "actividad";

// ── Utilidades ─────────────────────────────────────────────────────────────
function fmt(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function shortKey(key: string) {
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

const ACTION_LABEL: Record<string, string> = {
  RequestTokens: "Solicitud de tokens",
  MintToken: "Acuñación de token",
  AssignToken: "Asignación / Certificación",
};

const ESTADO_COLORS: Record<string, string> = {
  Pendiente: "bg-yellow-100 text-yellow-800",
  Aprobada: "bg-green-100 text-green-800",
  Rechazada: "bg-red-100 text-red-800",
  Activa: "bg-emerald-100 text-emerald-700",
  Revocada: "bg-red-100 text-red-700",
};

function EstadoChip({ estado }: { estado: string | null }) {
  const label = estado ?? "—";
  const cls = ESTADO_COLORS[label] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Modal genérico ─────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-primary">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1">
      <span className="text-xs font-medium text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 break-all">{value ?? "—"}</span>
    </div>
  );
}

// ── Filtro de texto + año ──────────────────────────────────────────────────
function SearchBar({ search, year, years, onSearch, onYear }: {
  search: string; year: string; years: number[]; onSearch: (v: string) => void; onYear: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        type="text"
        placeholder="Buscar…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <select
        value={year}
        onChange={(e) => onYear(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <option value="">Todos los años</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </select>
    </div>
  );
}

// ── Tab: Certificaciones ───────────────────────────────────────────────────
function TabCertificaciones({ certs }: { certs: Certification[] }) {
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [selected, setSelected] = useState<Certification | null>(null);

  const years = useMemo(
    () => [...new Set(certs.map((c) => c.anio_egreso).filter(Boolean) as number[])].sort((a, b) => b - a),
    [certs]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return certs.filter((c) => {
      const matchText = !q || [c.nombre, c.apellido, c.carrera].some((v) => v?.toLowerCase().includes(q));
      const matchYear = !year || String(c.anio_egreso) === year;
      return matchText && matchYear;
    });
  }, [certs, search, year]);

  return (
    <>
      {selected && (
        <Modal title="Detalle de certificación" onClose={() => setSelected(null)}>
          <DetailRow label="Titular" value={`${selected.nombre ?? ""} ${selected.apellido ?? ""}`} />
          <DetailRow label="Carrera" value={selected.carrera} />
          <DetailRow label="Año de egreso" value={selected.anio_egreso} />
          <DetailRow label="Estado" value={<EstadoChip estado={selected.status} />} />
          <DetailRow label="Token cert." value={selected.cert_token ? shortKey(selected.cert_token) : null} />
          <DetailRow label="Pubkey" value={<span className="font-mono text-xs">{selected.pubkey}</span>} />
          {selected.motivo_revocacion && (
            <DetailRow label="Motivo revocación" value={selected.motivo_revocacion} />
          )}
          <DetailRow label="Actualizado" value={fmt(selected.updated_at)} />
          <a
            href={`/verify/${selected.pubkey}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2 text-xs text-accent hover:underline"
          >
            Ver verificación pública →
          </a>
        </Modal>
      )}

      <SearchBar search={search} year={year} years={years} onSearch={setSearch} onYear={setYear} />

      {filtered.length === 0 ? (
        <EmptyState message="No se encontraron certificaciones con los filtros aplicados." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Titular</th>
                <th className="px-4 py-3 text-left">Carrera</th>
                <th className="px-4 py-3 text-left">Año</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.pubkey} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{c.nombre} {c.apellido}</td>
                  <td className="px-4 py-3 text-gray-600">{c.carrera ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.anio_egreso ?? "—"}</td>
                  <td className="px-4 py-3"><EstadoChip estado={c.status} /></td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(c.updated_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(c)}
                      className="text-xs text-accent hover:underline font-medium"
                    >
                      Ver detalles
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Tab: Solicitudes de Tokens ─────────────────────────────────────────────
type TokenRequestOnChainDetail = {
  carrera: string | null;
  plan: string | null;
  resolucion: string | null;
  anioEgreso: number | null;
  cantidad: number | null;
};

function TabSolicitudes({ requests, connection }: { requests: TokenRequest[]; connection: unknown }) {
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [selected, setSelected] = useState<TokenRequest | null>(null);
  const [onChainByPubkey, setOnChainByPubkey] = useState<Record<string, TokenRequestOnChainDetail>>({});
  const [selectedRequesterName, setSelectedRequesterName] = useState<{ nombre: string | null; apellido: string | null } | null>(null);

  const years = useMemo(
    () => [...new Set(requests.map((r) => r.anio_egreso).filter(Boolean) as number[])].sort((a, b) => b - a),
    [requests]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return requests.filter((r) => {
      const onChain = r.pubkey ? onChainByPubkey[r.pubkey] : null;
      const carrera = r.carrera ?? onChain?.carrera ?? null;
      const plan = r.plan ?? onChain?.plan ?? null;
      const resolucion = r.resolucion ?? onChain?.resolucion ?? null;
      const anioEgreso = r.anio_egreso ?? onChain?.anioEgreso ?? null;
      const matchText = !q || [carrera, plan, resolucion].some((v) => v?.toLowerCase().includes(q));
      const matchYear = !year || String(r.anio_egreso) === year;
      return matchText && (!year || String(anioEgreso) === year);
    });
  }, [requests, search, year, onChainByPubkey]);

  useEffect(() => {
    const pending = requests.filter(
      (r) =>
        !!r.pubkey &&
        (r.plan == null || r.resolucion == null || r.anio_egreso == null) &&
        !onChainByPubkey[r.pubkey]
    );

    if (pending.length === 0) return;

    let cancelled = false;
    const loadAllOnChain = async () => {
      const results = await Promise.all(
        pending.map(async (r) => {
          try {
            const detail = await fetchTokenRequestDetailOnChain({
              connection,
              tokenRequest: new PublicKey(r.pubkey),
            });
            return { pubkey: r.pubkey, detail };
          } catch {
            return { pubkey: r.pubkey, detail: null };
          }
        })
      );

      if (cancelled) return;

      const next: Record<string, TokenRequestOnChainDetail> = {};
      for (const item of results) {
        if (item.detail) next[item.pubkey] = item.detail;
      }

      if (Object.keys(next).length > 0) {
        setOnChainByPubkey((prev) => ({ ...prev, ...next }));
      }
    };

    loadAllOnChain();
    return () => {
      cancelled = true;
    };
  }, [requests, connection, onChainByPubkey]);

  useEffect(() => {
    if (!selected?.solicitante) {
      setSelectedRequesterName(null);
      return;
    }

    let cancelled = false;
    const loadRequester = async () => {
      try {
        const res = await api.getPerson(selected.solicitante);
        if (!cancelled) {
          setSelectedRequesterName({
            nombre: res.data.nombre ?? null,
            apellido: res.data.apellido ?? null,
          });
        }
      } catch {
        if (!cancelled) setSelectedRequesterName(null);
      }
    };

    loadRequester();
    return () => {
      cancelled = true;
    };
  }, [selected?.solicitante]);

  const selectedMerged = selected
    ? {
        onChain: selected.pubkey ? onChainByPubkey[selected.pubkey] : null,
        ...selected,
        carrera: selected.carrera ?? (selected.pubkey ? onChainByPubkey[selected.pubkey]?.carrera : null) ?? null,
        plan: selected.plan ?? (selected.pubkey ? onChainByPubkey[selected.pubkey]?.plan : null) ?? null,
        resolucion: selected.resolucion ?? (selected.pubkey ? onChainByPubkey[selected.pubkey]?.resolucion : null) ?? null,
        anio_egreso: selected.anio_egreso ?? (selected.pubkey ? onChainByPubkey[selected.pubkey]?.anioEgreso : null) ?? null,
        cantidad: selected.cantidad ?? (selected.pubkey ? onChainByPubkey[selected.pubkey]?.cantidad : null) ?? null,
      }
    : null;

  return (
    <>
      {selectedMerged && (
        <Modal title="Detalle de solicitud de tokens" onClose={() => setSelected(null)}>
          <DetailRow
            label="Solicitante"
            value={`${selectedRequesterName?.nombre ?? "—"} ${selectedRequesterName?.apellido ?? ""}`.trim() || "—"}
          />
          <DetailRow label="Wallet solicitante" value={selectedMerged.solicitante} />
          <DetailRow label="Carrera" value={selectedMerged.carrera} />
          <DetailRow label="Plan" value={selectedMerged.plan} />
          <DetailRow label="Resolución" value={selectedMerged.resolucion} />
          <DetailRow label="Año de egreso" value={selectedMerged.anio_egreso} />
          <DetailRow label="Cantidad solicitada" value={selectedMerged.cantidad} />
          <DetailRow label="Estado" value={<EstadoChip estado={selectedMerged.estado} />} />
          {selectedMerged.motivo_rechazo && (
            <DetailRow label="Motivo rechazo" value={selectedMerged.motivo_rechazo} />
          )}
          <DetailRow label="Pubkey PDA" value={<span className="font-mono text-xs">{selectedMerged.pubkey}</span>} />
          <DetailRow label="Actualizado" value={fmt(selectedMerged.updated_at)} />
        </Modal>
      )}

      <SearchBar search={search} year={year} years={years} onSearch={setSearch} onYear={setYear} />

      {filtered.length === 0 ? (
        <EmptyState message="No se encontraron solicitudes de tokens con los filtros aplicados." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Solicitante</th>
                <th className="px-4 py-3 text-left">Carrera</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Resolución</th>
                <th className="px-4 py-3 text-left">Año</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.pubkey} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600" title={r.solicitante}>{shortKey(r.solicitante)}</td>
                  <td className="px-4 py-3 font-medium">{r.carrera ?? onChainByPubkey[r.pubkey]?.carrera ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.plan ?? onChainByPubkey[r.pubkey]?.plan ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.resolucion ?? onChainByPubkey[r.pubkey]?.resolucion ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.anio_egreso ?? onChainByPubkey[r.pubkey]?.anioEgreso ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.cantidad ?? onChainByPubkey[r.pubkey]?.cantidad ?? "—"}</td>
                  <td className="px-4 py-3"><EstadoChip estado={r.estado} /></td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(r.updated_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(r)}
                      className="text-xs text-accent hover:underline font-medium"
                    >
                      Ver detalles
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Tab: Mi Actividad ─────────────────────────────────────────────────────
function TabActividad({ audit }: { audit: AuditEntry[] }) {
  if (audit.length === 0) {
    return <EmptyState message="No hay actividad registrada para este rol todavía." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
          <tr>
            <th className="px-4 py-3 text-left">Acción</th>
            <th className="px-4 py-3 text-left">Entidad</th>
            <th className="px-4 py-3 text-left">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {audit.map((e) => (
            <tr key={e.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{ACTION_LABEL[e.accion] ?? e.accion}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate max-w-[160px]">{shortKey(e.entidad)}</td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(e.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TokenRequestDetail {
  cantidad: number;
  mintedCount: number;
}

function TabAcciones({
  wallet,
  anchorWallet,
  connection,
  tokenRequests,
  availableTokens,
  onDone,
}: {
  wallet: PublicKey;
  anchorWallet: unknown;
  connection: unknown;
  tokenRequests: TokenRequest[];
  availableTokens: CertTokenAvailable[];
  onDone: () => Promise<void>;
}) {
  const [id, setId] = useState("1");
  const [carrera, setCarrera] = useState("");
  const [plan, setPlan] = useState("");
  const [resolucion, setResolucion] = useState("");
  const [anio, setAnio] = useState("");
  const [cantidad, setCantidad] = useState("");

  const [mintTarget, setMintTarget] = useState("");
  const [mintQuantity, setMintQuantity] = useState("1");
  const [mintDetail, setMintDetail] = useState<TokenRequestDetail | null>(null);

  const [assignToken, setAssignToken] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reloadingTokens, setReloadingTokens] = useState(false);
  const [processingMsg, setProcessingMsg] = useState<string | null>(null);

  const approvedRequests = tokenRequests.filter((r) => r.estado === "Aprobada" && !!r.pubkey);

  const handleReloadTokens = async () => {
    setReloadingTokens(true);
    try {
      await onDone();
    } finally {
      setReloadingTokens(false);
    }
  };

  // Cargar detalle on-chain cuando se selecciona una solicitud para acuñar
  useEffect(() => {
    if (!mintTarget) {
      setMintDetail(null);
      return;
    }

    let cancelled = false;
    const loadMintDetail = async () => {
      try {
        const detail = await fetchTokenRequestDetailOnChain({
          connection,
          tokenRequest: new PublicKey(mintTarget),
        });
        if (!cancelled) {
          if (detail) {
            setMintDetail({
              cantidad: detail.cantidad ?? 0,
              mintedCount: detail.mintedCount ?? 0,
            });
          } else {
            setMintDetail(null);
          }
        }
      } catch {
        if (!cancelled) {
          setMintDetail(null);
        }
      }
    };

    loadMintDetail();
    return () => {
      cancelled = true;
    };
  }, [mintTarget, connection]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    setProcessingMsg(null);
    try {
      const sig = await action();
      setMsg(`Transacción enviada: ${sig}`);
      setProcessingMsg("Esperando que el indexador procese el evento...");
      
      // Reintentar cargar datos hasta que aparezca el nuevo token
      // El indexador tarda en procesar, así que hacemos polling
      let retries = 0;
      const maxRetries = 15;
      let tokenLoaded = false;

      while (retries < maxRetries && !tokenLoaded) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retries++;
        
        setProcessingMsg(`Buscando en indexador... (intento ${retries}/${maxRetries})`);
        
        try {
          await onDone();
          // Si la recarga fue exitosa, asumimos que se cargó
          tokenLoaded = true;
          setProcessingMsg("✓ Datos cargados correctamente");
          // Esperar un poco para que se vea el mensaje
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch {
          // Si hay error en onDone, seguimos reintentando
        }
      }
      
      setProcessingMsg(null);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Operación fallida";
      setMsg(err);
      setProcessingMsg(null);
    } finally {
      setBusy(false);
    }
  };

  const runMultipleMints = async () => {
    if (!mintTarget || !mintDetail) return;
    
    setBusy(true);
    setMsg(null);
    setProcessingMsg(null);
    
    try {
      const quantity = Math.max(1, Number(mintQuantity));
      const startIndex = mintDetail.mintedCount;
      const endIndex = startIndex + quantity;
      
      // Validar que no nos pasamos de la cantidad solicitada
      if (endIndex > mintDetail.cantidad) {
        setMsg(`Error: No puedes acuñar más de ${mintDetail.cantidad - mintDetail.mintedCount} tokens`);
        setBusy(false);
        return;
      }
      
      let successCount = 0;
      
      for (let index = startIndex; index < endIndex; index++) {
        try {
          setProcessingMsg(`Acuñando token ${index - startIndex + 1}/${quantity} (índice ${index})...`);
          
          const sig = await mintTokenTx({
            connection,
            wallet: anchorWallet,
            universidad: wallet,
            tokenRequest: new PublicKey(mintTarget),
            index,
          });
          
          successCount++;
          setMsg(`Token ${index} acuñado: ${sig}`);
          
          // Esperar 2 segundos entre transacciones
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (e) {
          const err = e instanceof Error ? e.message : "Error desconocido";
          setMsg(`Error en token ${index}: ${err}`);
          setProcessingMsg(null);
          break;
        }
      }
      
      if (successCount > 0) {
        setProcessingMsg(`✓ ${successCount} token(s) acuñado(s) correctamente. Sincronizando...`);
        
        // Polling para sincronizar
        let retries = 0;
        const maxRetries = 20;
        
        while (retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          retries++;
          
          setProcessingMsg(`Sincronizando con indexador... (${retries}/${maxRetries})`);
          
          try {
            await onDone();
            setProcessingMsg("✓ Sincronización completada");
            await new Promise((resolve) => setTimeout(resolve, 1000));
            break;
          } catch {
            // Seguir reintentando
          }
        }
        
        setProcessingMsg(null);
        setMintQuantity("1");
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : "Operación fallida";
      setMsg(err);
      setProcessingMsg(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h3 className="font-semibold text-primary">1) Solicitar tokens</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ID (u64)" className="rounded-md border px-3 py-2 text-sm" />
          <input value={carrera} onChange={(e) => setCarrera(e.target.value)} placeholder="Carrera" className="rounded-md border px-3 py-2 text-sm" />
          <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Plan" className="rounded-md border px-3 py-2 text-sm" />
          <input value={resolucion} onChange={(e) => setResolucion(e.target.value)} placeholder="Resolución" className="rounded-md border px-3 py-2 text-sm" />
          <input value={anio} onChange={(e) => setAnio(e.target.value)} placeholder="Año egreso" className="rounded-md border px-3 py-2 text-sm" />
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cantidad" className="rounded-md border px-3 py-2 text-sm" />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => requestTokensTx({
            connection,
            wallet: anchorWallet,
            solicitante: wallet,
            id: BigInt(id),
            carrera,
            plan,
            resolucion,
            anioEgreso: Number(anio),
            cantidad: Number(cantidad),
          }))}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Enviar solicitud
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h3 className="font-semibold text-primary">2) Acuñar tokens de certificación</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={mintTarget} onChange={(e) => setMintTarget(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
            <option value="">Selecciona solicitud aprobada</option>
            {approvedRequests.map((r) => (
              <option key={r.pubkey} value={r.pubkey}>{r.carrera ?? "Carrera"} · {shortKey(r.pubkey)}</option>
            ))}
          </select>
          <input 
            type="number"
            min="1"
            value={mintQuantity} 
            onChange={(e) => setMintQuantity(e.target.value)} 
            placeholder="Cantidad a acuñar" 
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>
        
        {mintDetail && (
          <div className="flex gap-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex-1">
              <div className="text-xs text-gray-600 font-medium">Acuñados</div>
              <div className="text-lg font-bold text-blue-600">{mintDetail.mintedCount}</div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-600 font-medium">Disponibles</div>
              <div className="text-lg font-bold text-emerald-600">{mintDetail.cantidad - mintDetail.mintedCount}</div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-600 font-medium">Total Solicitado</div>
              <div className="text-lg font-bold text-gray-700">{mintDetail.cantidad}</div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-600 font-medium">Acuñando desde</div>
              <div className="text-lg font-bold text-accent">{mintDetail.mintedCount}</div>
            </div>
          </div>
        )}
        
        <button
          type="button"
          disabled={busy || !mintTarget || !mintDetail}
          onClick={runMultipleMints}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Acuñando..." : "Acuñar token(s)"}
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-primary">3) Asignar token a egresado</h3>
          <button
            onClick={handleReloadTokens}
            disabled={reloadingTokens || busy}
            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            title="Recarga la lista de tokens disponibles"
          >
            {reloadingTokens ? "Recargando…" : "↻ Recargar"}
          </button>
        </div>
        
        <div className="rounded-md bg-gray-50 p-3 border border-gray-200">
          <div className="text-xs font-medium text-gray-600 mb-2">
            Tokens acuñados disponibles: <span className="text-base font-bold text-primary">{availableTokens.length}</span>
          </div>
          {availableTokens.length === 0 ? (
            <div className="text-xs text-gray-500 italic">No hay tokens disponibles. Acuña uno primero en la sección anterior.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableTokens.map((t) => (
                <div
                  key={t.cert_token_pubkey}
                  onClick={() => setAssignToken(t.cert_token_pubkey)}
                  className={`p-2 rounded border cursor-pointer transition-colors ${
                    assignToken === t.cert_token_pubkey
                      ? "border-primary bg-blue-50"
                      : "border-gray-300 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="font-mono text-xs font-medium">{shortKey(t.cert_token_pubkey)}</div>
                  <div className="text-xs text-gray-500">{new Date(t.timestamp * 1000).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI" className="rounded-md border px-3 py-2 text-sm" />
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="rounded-md border px-3 py-2 text-sm" />
          <input value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Apellido" className="rounded-md border px-3 py-2 text-sm" />
        </div>
        <button
          type="button"
          disabled={busy || !assignToken}
          onClick={() => run(async () => {
            const hashDatos = await sha256FromText(JSON.stringify({ nombre, apellido, dni }));
            return assignTokenTx({
              connection,
              wallet: anchorWallet,
              universidad: wallet,
              certToken: new PublicKey(assignToken),
              nombre,
              apellido,
              dni,
              hashDatos,
            });
          })}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Asignar token
        </button>
      </div>

      {msg && <p className="text-xs break-all text-gray-700">{msg}</p>}
      {processingMsg && <p className="text-xs break-all text-blue-600 font-medium">{processingMsg}</p>}
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function UniversidadDashboard() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<Tab>("certificaciones");
  const [certs, setCerts] = useState<Certification[]>([]);
  const [tokenRequests, setTokenRequests] = useState<TokenRequest[]>([]);
  const [availableTokens, setAvailableTokens] = useState<CertTokenAvailable[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async (wallet: string) => {
    const [certRes, trRes, auditRes, availableRes] = await Promise.all([
      api.getCertificationsByUniversidad(wallet),
      api.getTokenRequestsByUniversidad(wallet),
      api.getAuditByActor(wallet, 100),
      api.getAvailableCertTokens(wallet),
    ]);
    const universityActions = new Set(["RequestTokens", "MintToken", "AssignToken"]);
    setCerts(certRes.data);
    setTokenRequests(trRes.data);
    setAvailableTokens(availableRes.data);
    setAudit(auditRes.data.filter((e) => universityActions.has(e.accion)));
  };

  useEffect(() => {
    if (!publicKey) {
      setLoading(false);
      setCerts([]);
      setTokenRequests([]);
      setAvailableTokens([]);
      setAudit([]);
      return;
    }

    const wallet = publicKey.toBase58();
    setLoading(true);
    loadData(wallet).finally(() => setLoading(false));
  }, [publicKey]);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "certificaciones", label: "Certificaciones emitidas", count: certs.length },
    { key: "solicitudes", label: "Solicitudes de tokens", count: tokenRequests.length },
    { key: "acciones", label: "Acciones" },
    { key: "actividad", label: "Mi actividad", count: audit.length },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Panel Universidad</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestión de certificaciones, solicitudes de tokens y seguimiento de actividad.
        </p>
      </div>

      {/* Solapas */}
      <div className="border-b border-gray-200 flex gap-1 overflow-x-auto">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key
                ? "border-b-2 border-accent text-accent"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
            {!loading && count !== undefined && count > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {loading ? (
        <Spinner />
      ) : (
        <div className="min-h-[200px]">
          {tab === "certificaciones" && <TabCertificaciones certs={certs} />}
          {tab === "solicitudes" && <TabSolicitudes requests={tokenRequests} connection={connection} />}
          {tab === "acciones" && publicKey && anchorWallet && (
            <TabAcciones
              wallet={new PublicKey(publicKey.toBase58())}
              anchorWallet={anchorWallet}
              connection={connection}
              tokenRequests={tokenRequests}
              availableTokens={availableTokens}
              onDone={() => loadData(publicKey.toBase58())}
            />
          )}
          {tab === "actividad" && <TabActividad audit={audit} />}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="h-8 w-8 rounded-full border-4 border-accent border-t-transparent animate-spin" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-gray-400 text-sm">{message}</div>
  );
}

