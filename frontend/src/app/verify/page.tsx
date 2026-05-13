"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Certification } from "@/lib/api";

export default function VerifyIndexPage() {
  const [pubkey, setPubkey] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [results, setResults] = useState<Certification[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pubkey.trim();
    if (trimmed) router.push(`/verify/${trimmed}`);
  }

  async function handleSearchIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() && !apellido.trim() && !dni.trim()) {
      setSearchMsg("Debes completar al menos uno de los campos: nombre, apellido o DNI.");
      setResults([]);
      return;
    }

    setSearching(true);
    setSearchMsg(null);
    try {
      const res = await api.verifySearch({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        dni: dni.trim(),
      });
      setResults(res.data);
      if (res.data.length === 0) {
        setSearchMsg("No se encontraron certificaciones con esos datos.");
      }
    } catch {
      setResults([]);
      setSearchMsg("No se pudo realizar la búsqueda en este momento.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 space-y-10">
      <div className="text-center space-y-3">
      <h1 className="text-3xl font-bold text-primary">Verificación pública</h1>
      <p className="text-gray-500 text-sm">
        Ingresá la clave pública (pubkey) de una certificación para consultar
        su validez sin necesidad de iniciar sesión.
      </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold text-primary">Buscar por pubkey</h2>
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
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold text-primary">Buscar por identidad</h2>
          <p className="text-xs text-gray-500">
            Puedes buscar por nombre, apellido y/o DNI para localizar certificaciones asociadas.
          </p>
          <form onSubmit={handleSearchIdentity} className="grid grid-cols-1 gap-3">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="text"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              placeholder="Apellido"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="text"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="DNI"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={searching}
              className="bg-primary text-white rounded-lg px-6 py-3 font-semibold hover:bg-primary/90 disabled:opacity-40 transition"
            >
              {searching ? "Buscando..." : "Buscar certificaciones"}
            </button>
          </form>
          {searchMsg && <p className="text-sm text-gray-600">{searchMsg}</p>}
        </section>
      </div>

      {results.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-primary">Resultados encontrados ({results.length})</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Titular</th>
                  <th className="px-4 py-3 text-left">Carrera</th>
                  <th className="px-4 py-3 text-left">Año</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((cert) => (
                  <tr key={cert.pubkey}>
                    <td className="px-4 py-3 font-medium">{cert.nombre ?? ""} {cert.apellido ?? ""}</td>
                    <td className="px-4 py-3 text-gray-600">{cert.carrera ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{cert.anio_egreso ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{cert.estado ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/verify/${cert.pubkey}`} className="text-accent hover:underline font-medium">
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
