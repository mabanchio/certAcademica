const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-red-100 text-red-700",
  Universidad: "bg-blue-100 text-blue-700",
  Ministerio: "bg-purple-100 text-purple-700",
  Cancilleria: "bg-yellow-100 text-yellow-700",
  Egresado: "bg-green-100 text-green-700",
};

export function RoleBadge({ role }: { role: string }) {
  const colors = ROLE_COLORS[role] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors}`}>
      {role}
    </span>
  );
}
