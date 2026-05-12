import type { Metadata } from "next";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "CertAcadémica — Certificación Académica en Blockchain",
  description: "Sistema de certificación académica sobre Solana",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen flex flex-col">
        <SolanaWalletProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="bg-primary text-gray-400 text-center text-xs py-3">
            © {new Date().getFullYear()} CertAcadémica · Powered by Solana
          </footer>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}
