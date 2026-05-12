#!/usr/bin/env node
/**
 * scripts/stop-all.js
 *
 * Para todos los procesos del stack:
 *   - solana-test-validator
 *   - frontend  (next dev, puerto 3000)
 *   - backend   (tsx watch / ts-node, puerto 3001)
 *   - indexer   (tsx watch / ts-node)
 *   - phantom-proxy (node server.js, puerto 8443)
 *
 * Uso:
 *   npm run stop
 *   o bien: node scripts/stop-all.js
 */

const { execSync } = require("child_process");

function tryKill(cmd) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const steps = [
  { label: "solana-test-validator", cmd: "pkill -f solana-test-validator" },
  { label: "frontend (next dev)",   cmd: "pkill -f 'next dev'" },
  { label: "frontend (next start)", cmd: "pkill -f 'next start'" },
  { label: "backend (tsx watch)",   cmd: "pkill -f 'tsx watch'" },
  { label: "indexer (tsx watch)",   cmd: "pkill -f 'tsx watch'" },
  { label: "ts-node",               cmd: "pkill -f ts-node" },
  { label: "phantom-proxy",         cmd: "pkill -f 'server.js'" },
  { label: "puertos 3000,3001,8443,8899,8900",
    cmd: "lsof -ti:3000,3001,8443,8899,8900 | xargs kill -9" },
];

console.log("\n▶  Deteniendo stack...\n");

let stopped = 0;
for (const { label, cmd } of steps) {
  const ok = tryKill(cmd);
  if (ok) {
    console.log(`   ✓ ${label}`);
    stopped++;
  }
}

if (stopped === 0) {
  console.log("   (No había procesos activos del stack)\n");
} else {
  console.log(`\n   ${stopped} proceso(s) detenido(s)\n`);
}
