"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { api, type Person } from "@/lib/api";

export function usePerson() {
  const { publicKey, connected } = useWallet();
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setPerson(null);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getPerson(publicKey.toBase58())
      .then((res) => setPerson(res.data))
      .catch((err: Error) => {
        if (err.message.includes("404") || err.message.includes("no encontrada")) {
          setPerson(null);
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [publicKey, connected]);

  return { person, loading, error };
}
