const STATUS_STYLES: Record<string, string> = {
  Activo: "bg-green-100 text-green-700",
  Activa: "bg-green-100 text-green-700",
  Inactivo: "bg-gray-100 text-gray-600",
  Suspendido: "bg-red-100 text-red-700",
  Pendiente: "bg-yellow-100 text-yellow-700",
  Aprobado: "bg-blue-100 text-blue-700",
  Rechazado: "bg-red-100 text-red-700",
  Revocado: "bg-red-100 text-red-700",
  Revocada: "bg-red-100 text-red-700",
};

export function StatusChip({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status || "—"}
    </span>
  );
}
