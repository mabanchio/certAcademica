"use client";

import { useEffect, useState } from "react";
import { api, type Certification } from "@/lib/api";
import { StatusChip } from "./StatusChip";
import { QRCodeDisplay } from "./QRCode";

interface Props {
  cert: Certification;
  showQR?: boolean;
  showDni?: boolean;
}

export function CertificationCard({ cert, showQR = false, showDni = false }: Props) {
  const [emisorNombre, setEmisorNombre] = useState<string | null>(null);
  const [emisorLoading, setEmisorLoading] = useState(false);

  useEffect(() => {
    if (!cert.universidad) return;
    
    setEmisorLoading(true);
    api
      .getPerson(cert.universidad)
      .then((res) => {
        const p = res.data;
        // Priorizar role_data (ministerio/institución), luego nombre, luego wallet
        const nombre = (p.role_data && p.role_data.trim()) || 
                       (p.nombre && p.apellido ? `${p.nombre} ${p.apellido}` : p.nombre) || 
                       cert.universidad.slice(0, 8);
        setEmisorNombre(nombre);
      })
      .catch(() => {
        setEmisorNombre(cert.universidad.slice(0, 8));
      })
      .finally(() => setEmisorLoading(false));
  }, [cert.universidad]);

  const verifyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/verify/${cert.pubkey}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-primary">
            {cert.nombre} {cert.apellido}
          </p>
          <p className="text-sm text-gray-500">{cert.carrera}</p>
        </div>
        <StatusChip status={cert.estado ?? ""} />
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        {showDni && cert.dni && (
          <p>
            <span className="font-medium text-gray-700">DNI:</span> {cert.dni}
          </p>
        )}
        <p>
          <span className="font-medium text-gray-700">Emisor:</span>{" "}
          {emisorLoading ? "Cargando..." : emisorNombre || "—"}
        </p>
        {cert.anio_egreso && (
          <p>
            <span className="font-medium text-gray-700">Año de egreso:</span>{" "}
            {cert.anio_egreso}
          </p>
        )}
      </div>

      <a
        href={`/verify/${cert.pubkey}`}
        className="text-accent text-xs hover:underline font-mono"
      >
        {cert.pubkey.slice(0, 12)}…
      </a>

      {showQR && cert.estado === "Activa" && (
        <div className="mt-2 flex justify-center">
          <QRCodeDisplay value={verifyUrl} size={140} label="Escanear para verificar" />
        </div>
      )}
    </div>
  );
}
