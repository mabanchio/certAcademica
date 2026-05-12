"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { api } from "@/lib/api";
import { usePerson } from "./usePerson";

const PROGRAM_CONFIG_DISCRIMINATOR = Uint8Array.from([155, 12, 170, 224, 30, 250, 204, 130]);

export type AppRole =
  | "Admin"
  | "Universidad"
  | "Ministerio"
  | "Cancilleria"
  | "Egresado"
  | null;

const ACTIVE_DASHBOARD_ROLE_KEY = "active_dashboard_role";

const DASHBOARD_ROLES: AppRole[] = [
  "Admin",
  "Ministerio",
  "Cancilleria",
  "Universidad",
  "Egresado",
];

export function useRole(): {
  primaryRole: AppRole;
  roles: string[];
  loading: boolean;
  setActiveRole: (role: AppRole) => void;
} {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const { person, loading: personLoading } = usePerson();
  const [isSystemAdminWallet, setIsSystemAdminWallet] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [preferredRole, setPreferredRole] = useState<AppRole>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedRole = window.localStorage.getItem(ACTIVE_DASHBOARD_ROLE_KEY);
    if (!storedRole) {
      setPreferredRole(null);
      return;
    }
    if (DASHBOARD_ROLES.includes(storedRole as AppRole)) {
      setPreferredRole(storedRole as AppRole);
    } else {
      setPreferredRole(null);
      window.localStorage.removeItem(ACTIVE_DASHBOARD_ROLE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!connected || !publicKey) {
      setIsSystemAdminWallet(false);
      setAdminChecked(true);
      return;
    }

    let alive = true;
    setAdminLoading(true);
    setAdminChecked(false);

    (async () => {
      let adminWallet = false;
      try {
        // El backend expone el estado leído del contrato para alinear la UI con el admin on-chain real.
        const status = await api.adminStatus();
        if (alive && status.data.initialized) {
          adminWallet = status.data.adminWallet === publicKey.toBase58();
        } else if (alive) {
          // Si no está inicializado en el backend, verificar on-chain
          const programId = new PublicKey(
            process.env.NEXT_PUBLIC_PROGRAM_ID ?? "3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt"
          );
          const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
          const acc = await connection.getAccountInfo(configPda, "confirmed");

          if (acc?.data && acc.data.length >= 40) {
            const isProgramConfig = PROGRAM_CONFIG_DISCRIMINATOR.every(
              (byte, i) => acc.data[i] === byte
            );
            if (isProgramConfig) {
              // Layout ProgramConfig (Anchor account):
              // [0..8): discriminator, [8..40): admin pubkey, [40..48): audit_count, [48]: bump
              const adminPk = new PublicKey(acc.data.subarray(8, 40)).toBase58();
              adminWallet = adminPk === publicKey.toBase58();
            }
          }
        }
      } catch {
        // Si ambas opciones fallan, adminWallet se queda en false
        adminWallet = false;
      } finally {
        if (alive) {
          setIsSystemAdminWallet(adminWallet);
          setAdminLoading(false);
          setAdminChecked(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [connected, publicKey, connection]);

  const roles = useMemo(() => {
    const out = [...(person?.roles ?? [])];
    if (isSystemAdminWallet && !out.includes("Admin")) out.push("Admin");
    return out;
  }, [person?.roles, isSystemAdminWallet]);

  // Prioridad de rol para determinar el dashboard principal
  const priority: AppRole[] = [
    "Admin",
    "Ministerio",
    "Cancilleria",
    "Universidad",
    "Egresado",
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!preferredRole) return;
    if (!roles.includes(preferredRole)) {
      window.localStorage.removeItem(ACTIVE_DASHBOARD_ROLE_KEY);
      setPreferredRole(null);
    }
  }, [preferredRole, roles]);

  const primaryRole =
    (preferredRole && roles.includes(preferredRole) ? preferredRole : null)
    ?? priority.find((r) => r && roles.includes(r))
    ?? null;

  const setActiveRole = (role: AppRole) => {
    if (typeof window === "undefined") return;
    if (!role || !roles.includes(role)) {
      window.localStorage.removeItem(ACTIVE_DASHBOARD_ROLE_KEY);
      setPreferredRole(null);
      return;
    }
    window.localStorage.setItem(ACTIVE_DASHBOARD_ROLE_KEY, role);
    setPreferredRole(role);
  };

  const needsAdminCheck = connected && !!publicKey;
  const loading = personLoading || adminLoading || (needsAdminCheck && !adminChecked);

  return { primaryRole, roles, loading, setActiveRole };
}
