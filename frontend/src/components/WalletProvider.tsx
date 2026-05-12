"use client";

import { type ComponentType, type ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8899";

function resolveNetwork(): WalletAdapterNetwork {
  const cluster = (process.env.NEXT_PUBLIC_CLUSTER ?? "devnet").toLowerCase();
  if (cluster === "mainnet" || cluster === "mainnet-beta") {
    return WalletAdapterNetwork.Mainnet;
  }
  if (cluster === "testnet") {
    return WalletAdapterNetwork.Testnet;
  }
  return WalletAdapterNetwork.Devnet;
}

const ConnectionProviderComponent =
  ConnectionProvider as ComponentType<{ endpoint: string; children?: ReactNode }>;
const WalletProviderComponent =
  WalletProvider as ComponentType<{
    wallets: ReturnType<typeof useMemo>;
    autoConnect?: boolean;
    children?: ReactNode;
  }>;
const WalletModalProviderComponent =
  WalletModalProvider as ComponentType<{ children?: ReactNode }>;

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const network = resolveNetwork();
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );

  return (
    <ConnectionProviderComponent endpoint={RPC_URL}>
      <WalletProviderComponent wallets={wallets} autoConnect>
        <WalletModalProviderComponent>{children}</WalletModalProviderComponent>
      </WalletProviderComponent>
    </ConnectionProviderComponent>
  );
}
