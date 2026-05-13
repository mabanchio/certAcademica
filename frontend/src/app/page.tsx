"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ClientWalletButton } from "@/components/ClientWalletButton";
import { usePerson } from "@/hooks/usePerson";
import { useRole } from "@/hooks/useRole";
import { Logo } from "@/components/Logo";
import { RoleRequestPanel } from "@/components/RoleRequestPanel";

export default function HomePage() {
  const { connected } = useWallet();
  const { person, loading } = usePerson();
  const { primaryRole, loading: roleLoading } = useRole();

  return (
    <div className="landing-bg relative min-h-[80vh] overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-orb bg-orb--a" />
        <div className="bg-orb bg-orb--b" />
        <div className="bg-orb bg-orb--c" />
      </div>

      <section className="relative z-10 max-w-7xl mx-auto px-4 py-12 sm:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-sky-200 bg-sky-50/80 px-4 py-2 text-xs text-sky-800">
            <Logo className="h-5 w-5" />
            Credenciales academicas verificables en segundos
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold text-primary leading-tight">
            CertAcadémica
          </h1>

          <p className="text-gray-700 max-w-2xl text-sm sm:text-base">
            La plataforma que acelera la emision y validacion de certificaciones con evidencia
            criptografica, trazabilidad total y verificacion publica 24/7.
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <MetricCard value="100%" label="Trazabilidad de operaciones" />
            <MetricCard value="24/7" label="Verificacion publica disponible" />
            <MetricCard value="1 click" label="Acceso publico a validacion" />
            <MetricCard value="0 friccion" label="Consulta sin wallet" />
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <Link
              href="/verify"
              className="rounded-lg bg-accent px-5 py-3 text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
            >
              Verificacion publica ahora
            </Link>
            {connected && !loading && !roleLoading && primaryRole ? (
              <Link
                href="/dashboard"
                className="rounded-lg border border-primary px-5 py-3 text-primary text-sm font-semibold hover:bg-primary hover:text-white transition-colors"
              >
                Entrar a mi panel
              </Link>
            ) : (
              <div className="rounded-lg border border-gray-300 px-3 py-2">
                <ClientWalletButton />
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4 hover-lift">
          <h2 className="text-lg font-semibold text-primary">Beneficios clave para tu institucion</h2>
          <ul className="space-y-3 text-sm text-gray-700">
            <li>Reduce tiempos de validacion y respuesta ante solicitudes academicas.</li>
            <li>Evita dudas de autenticidad con datos verificables y auditoria permanente.</li>
            <li>Centraliza el flujo entre Ministerio, Cancilleria, Universidad y Egresado.</li>
            <li>Publica verificacion abierta por pubkey o identidad sin exigir autenticacion.</li>
          </ul>
        </div>
      </section>

      <section className="relative z-10 max-w-7xl mx-auto px-4 pb-14 sm:pb-20">
        <h2 className="text-2xl font-bold text-primary mb-5">Roles que impulsan el ecosistema</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <RoleCard
            title="Ministerio"
            pitch="Coordina aprobaciones y asegura gobernanza del proceso con control operativo y seguimiento continuo."
          />
          <RoleCard
            title="Cancillería"
            pitch="Valida solicitudes extranjeras con trazabilidad y respaldo en cada decision institucional."
          />
          <RoleCard
            title="Universidad"
            pitch="Emite y asigna certificaciones con respaldo criptografico y registro verificable."
          />
          <RoleCard
            title="Egresado"
            pitch="Solicita y monitorea su tramite en tiempo real, con evidencia clara de cada estado."
          />
        </div>
      </section>

      <section className="relative z-10 max-w-7xl mx-auto px-4 pb-16">
        <div className="glass-panel rounded-2xl border border-sky-200 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover-lift">
          <div>
            <h3 className="text-base font-semibold text-primary">Convierte la confianza en ventaja competitiva</h3>
            <p className="text-sm text-gray-700">
              Verificacion publica accesible para ciudadanos, empresas y organismos, sin dependencia de wallet.
            </p>
          </div>
          <Link
            href="/verify"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-white text-sm font-semibold hover:bg-primary/90"
          >
            Abrir verificacion publica
          </Link>
        </div>
      </section>

      <section className="relative z-10 max-w-7xl mx-auto px-4 pb-20">
        <div className="glass-panel rounded-2xl border border-gray-200 p-6 space-y-4 hover-lift">
          <h3 className="text-base font-semibold text-primary">Activar acceso operativo</h3>
          <p className="text-sm text-gray-700">
            Para gestionar solicitudes y operaciones internas, conecta tu wallet y accede a tu flujo por rol.
          </p>

          {!connected && (
            <div className="rounded-lg border border-gray-300 px-3 py-2 w-fit">
              <ClientWalletButton />
            </div>
          )}

          {connected && loading && (
            <p className="text-sm text-gray-400 animate-pulse">Cargando perfil...</p>
          )}

          {connected && !loading && !roleLoading && !primaryRole && !person && (
            <div className="w-full max-w-xl space-y-4">
              <RoleRequestPanel />
            </div>
          )}

          {connected && !loading && !roleLoading && !primaryRole && person && person.roles.length === 0 && (
            <div className="w-full max-w-xl space-y-4">
              <RoleRequestPanel />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <article className="glass-panel rounded-xl border border-gray-200 p-4 shadow-sm hover-lift">
      <p className="text-xl font-bold text-primary">{value}</p>
      <p className="text-xs text-gray-600 mt-1">{label}</p>
    </article>
  );
}

function RoleCard({ title, pitch }: { title: string; pitch: string }) {
  return (
    <article className="glass-panel rounded-xl border border-gray-200 p-5 shadow-sm hover-lift">
      <h3 className="text-base font-semibold text-primary">{title}</h3>
      <p className="mt-2 text-sm text-gray-700">{pitch}</p>
    </article>
  );
}
