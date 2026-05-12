"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyIndexPage() {
  const [pubkey, setPubkey] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pubkey.trim();
    if (trimmed) router.push(`/verify/${trimmed}`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-20 space-y-6 text-center">
      <h1 className="text-3xl font-bold text-primary">Verificación pública</h1>
      <p className="text-gray-500 text-sm">
        Ingresá la clave pública (pubkey) de una certificación para consultar
        su validez sin necesidad de iniciar sesión.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value)}
          placeholder="Pubkey de la certificación (base58)"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent font-mono"
        />
        <button
          type="submit"
          disabled={!pubkey.trim()}
          className="bg-accent text-white rounded-lg px-6 py-3 font-semibold hover:bg-accent/90 disabled:opacity-40 transition"
        >
          Verificar
        </button>
      </form>
    </div>
  );
}
