"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { ClientWalletButton } from "./ClientWalletButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePerson } from "@/hooks/usePerson";
import { type AppRole, useRole } from "@/hooks/useRole";
import { RoleBadge } from "./RoleBadge";
import { Logo } from "./Logo";

const ROLE_ROUTES: Record<Exclude<AppRole, null>, string> = {
  Admin: "/dashboard/admin",
  Ministerio: "/dashboard/ministerio",
  Cancilleria: "/dashboard/cancilleria",
  Universidad: "/dashboard/universidad",
  Egresado: "/dashboard/egresado",
};

const ROLE_LABELS: Record<Exclude<AppRole, null>, string> = {
  Admin: "Admin",
  Ministerio: "Ministerio",
  Cancilleria: "Cancillería",
  Universidad: "Universidad",
  Egresado: "Egresado",
};

export function Navbar() {
  const { connected } = useWallet();
  const { person } = usePerson();
  const { roles, primaryRole, setActiveRole } = useRole();
  const pathname = usePathname();
  const router = useRouter();

  const isAdmin = roles.includes("Admin");
  const switchableRoles = roles.filter((r): r is Exclude<AppRole, null> => r in ROLE_ROUTES);

  const nav = [
    { href: "/", label: "Inicio" },
    { href: "/verify", label: "Verificación pública" },
    ...(connected ? [{ href: "/dashboard", label: "Panel" }] : []),
    ...(connected && isAdmin ? [{ href: "/audit", label: "Auditoría" }] : []),
  ];

  return (
    <nav className="sticky top-0 z-50 bg-primary/95 text-white shadow-md backdrop-blur supports-[backdrop-filter]:bg-primary/85">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Logo className="h-8 w-8" />
          <span className="font-bold text-lg tracking-tight hidden sm:block">
            CertAcadémica
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {switchableRoles.length > 1 && (
            <label className="hidden sm:flex items-center gap-2 text-xs text-gray-200">
              <span>Panel</span>
              <select
                value={primaryRole ?? ""}
                onChange={(e) => {
                  const nextRole = e.target.value as Exclude<AppRole, null>;
                  if (!nextRole || !(nextRole in ROLE_ROUTES)) return;
                  setActiveRole(nextRole);
                  router.push(ROLE_ROUTES[nextRole]);
                }}
                className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs text-white"
              >
                {switchableRoles.map((role) => (
                  <option key={role} value={role} className="text-gray-900">
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors hover:text-accent ${
                item.href === "/"
                  ? pathname === "/"
                    ? "text-accent"
                    : "text-gray-300"
                  : pathname.startsWith(item.href)
                    ? "text-accent"
                    : "text-gray-300"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {person && (
            <div className="hidden sm:flex items-center gap-2">
              {person.roles.map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </div>
          )}

          <ClientWalletButton />
        </div>
      </div>
    </nav>
  );
}
