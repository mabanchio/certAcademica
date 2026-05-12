"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRole } from "@/hooks/useRole";

// Redirige al sub-dashboard del rol principal
const ROLE_ROUTES: Record<string, string> = {
  Admin: "/dashboard/admin",
  Ministerio: "/dashboard/ministerio",
  Cancilleria: "/dashboard/cancilleria",
  Universidad: "/dashboard/universidad",
  Egresado: "/dashboard/egresado",
};

export default function DashboardPage() {
  const { connected } = useWallet();
  const { primaryRole, loading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!connected) { router.push("/"); return; }
    if (!loading && primaryRole) {
      router.replace(ROLE_ROUTES[primaryRole] ?? "/");
    }
  }, [connected, loading, primaryRole, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-gray-400 animate-pulse">Cargando dashboard…</p>
    </div>
  );
}
