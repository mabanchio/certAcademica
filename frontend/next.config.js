/** @type {import('next').NextConfig} */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8899";

// Content Security Policy para el frontend
const cspHeader = [
  "default-src 'self'",
  // Scripts: solo self + inline eval para Next.js
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Estilos: self + inline (necesario para Tailwind CSS)
  "style-src 'self' 'unsafe-inline'",
  // Imágenes: self + data URIs (QR codes)
  "img-src 'self' data: blob:",
  // Fuentes: self
  "font-src 'self'",
  // Conexiones permitidas: backend + wallets RPC (Phantom, Solflare usan su propio RPC)
  `connect-src 'self' ${BACKEND_URL} ${RPC_URL} https://*.helius-rpc.com https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://api.testnet.solana.com wss://*.helius-rpc.com`,
  // Frames: denegado (no embebemos iframes)
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite importar módulos que usan Buffer (Solana web3.js)
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
