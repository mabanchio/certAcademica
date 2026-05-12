"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ClientWalletButton } from "@/components/ClientWalletButton";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePerson } from "@/hooks/usePerson";
import { useRole } from "@/hooks/useRole";
import { Logo } from "@/components/Logo";
import { RoleRequestPanel } from "@/components/RoleRequestPanel";

export default function HomePage() {
  const { connected, publicKey } = useWallet();
  const { person, loading } = usePerson();
  const { primaryRole, loading: roleLoading } = useRole();
  const router = useRouter();
  const [systemAdminWallet, setSystemAdminWallet] = useState<string | null>(null);
  const [systemInitialized, setSystemInitialized] = useState(false);

  useEffect(() => {
    if (connected && !loading && !roleLoading && primaryRole) {
      router.push("/dashboard");
    }
  }, [connected, loading, roleLoading, primaryRole, router]);

  useEffect(() => {
    let alive = true;
    api.adminStatus()
      .then((res) => {
        if (!alive) return;
        setSystemInitialized(res.data.initialized);
        setSystemAdminWallet(res.data.adminWallet);
      })
      .catch(() => {
        if (!alive) return;
        setSystemInitialized(false);
        setSystemAdminWallet(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  const connectedWallet = publicKey?.toBase58() ?? null;
  const isDifferentFromSystemAdmin =
    !!connectedWallet && !!systemAdminWallet && connectedWallet !== systemAdminWallet;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-4">
        <Logo className="h-24 w-24" />
        <h1 className="text-4xl font-bold text-primary text-center">
          CertAcadémica
        </h1>
        <p className="text-gray-500 text-center max-w-md">
          Sistema de certificación académica descentralizado sobre Solana.
          Conecta tu wallet para acceder.
        </p>
      </div>

      <ClientWalletButton />

      {connected && loading && (
        <p className="text-sm text-gray-400 animate-pulse">Cargando perfil…</p>
      )}

      {connected && !loading && !roleLoading && !primaryRole && !person && (
        <div className="w-full max-w-xl space-y-4">
          {systemInitialized && isDifferentFromSystemAdmin && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              El sistema ya fue inicializado. La wallet admin configurada es {systemAdminWallet}.
              La wallet conectada actual no es la admin del sistema.
            </div>
          )}
          <RoleRequestPanel />
        </div>
      )}

      {connected && !loading && !roleLoading && !primaryRole && person && person.roles.length === 0 && (
        <div className="w-full max-w-xl space-y-4">
          {systemInitialized && isDifferentFromSystemAdmin && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              El sistema ya fue inicializado. La wallet admin configurada es {systemAdminWallet}.
              La wallet conectada actual no es la admin del sistema.
            </div>
          )}
          <RoleRequestPanel />
        </div>
      )}

      {/* Sección de verificación pública sin autenticación */}
      <div className="mt-6 border-t border-gray-200 pt-6 w-full max-w-md text-center">
        <p className="text-sm text-gray-500 mb-3">
          ¿Querés verificar una certificación sin iniciar sesión?
        </p>
        <a
          href="/verify"
          className="text-accent font-medium text-sm hover:underline"
        >
          → Verificación pública
        </a>
      </div>
    </div>
  );
}
