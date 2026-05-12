import type { Certification } from "@/lib/api";
import { StatusChip } from "./StatusChip";
import { QRCodeDisplay } from "./QRCode";

interface Props {
  cert: Certification;
  showQR?: boolean;
}

export function CertificationCard({ cert, showQR = false }: Props) {
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
        <StatusChip status={cert.status} />
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <p>
          <span className="font-medium text-gray-700">Universidad:</span>{" "}
          {cert.universidad_wallet.slice(0, 8)}…
        </p>
        {cert.anio_egreso && (
          <p>
            <span className="font-medium text-gray-700">Año de egreso:</span>{" "}
            {cert.anio_egreso}
          </p>
        )}
        {cert.promedio && (
          <p>
            <span className="font-medium text-gray-700">Promedio:</span>{" "}
            {cert.promedio}
          </p>
        )}
      </div>

      <a
        href={`/verify/${cert.pubkey}`}
        className="text-accent text-xs hover:underline font-mono"
      >
        {cert.pubkey.slice(0, 12)}…
      </a>

      {showQR && cert.status === "Activo" && (
        <div className="mt-2 flex justify-center">
          <QRCodeDisplay value={verifyUrl} size={140} label="Escanear para verificar" />
        </div>
      )}
    </div>
  );
}
