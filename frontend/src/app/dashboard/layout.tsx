"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const previousWalletRef = useRef<string | null>(null);

  useEffect(() => {
    if (!connected) {
      router.replace("/");
      previousWalletRef.current = null;
      return;
    }

    const currentWallet = publicKey?.toBase58() ?? null;
    const previousWallet = previousWalletRef.current;

    if (previousWallet && currentWallet && previousWallet !== currentWallet) {
      router.replace("/");
    }

    previousWalletRef.current = currentWallet;
  }, [connected, publicKey, router]);

  return <>{children}</>;
}
