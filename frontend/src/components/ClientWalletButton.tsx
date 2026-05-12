"use client";

import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/**
 * Wrapper que evita el error de hidratación de WalletMultiButton.
 * WalletMultiButton usa APIs del navegador y no puede renderizarse en SSR.
 */
export function ClientWalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <WalletMultiButton />;
}
