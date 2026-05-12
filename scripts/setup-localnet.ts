/**
 * scripts/setup-localnet.ts
 *
 * Arranca el sistema desde cero en localnet:
 *   1. Para todos los procesos del stack (validator, backend, frontend, indexer)
 *   2. Levanta solana-test-validator --reset (ledger limpio)
 *   3. anchor build && anchor deploy
 *   4. (Opcional) Llama a `initialize` en el programa (ProgramConfig + persona admin)
 *
 * Uso:
 *   npm run setup
 */
// @ts-nocheck
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── Configuración ─────────────────────────────────────────────────────────────

const RPC_URL    = "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey("3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt");
const AUTO_INITIALIZE = process.env.SETUP_AUTO_INITIALIZE === "1";

// Datos del admin en el programa (solo para la cuenta on-chain, no afecta la wallet)
const ADMIN_NOMBRE   = "Admin";
const ADMIN_APELLIDO = "Sistema";
const ADMIN_DNI      = "00000000A";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pda(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function log(msg: string) { console.log(`\n▶  ${msg}`); }

function tryKill(cmd: string) {
  try { execSync(cmd, { stdio: "pipe" }); } catch { /* proceso no existía */ }
}

function run(cmd: string) {
  console.log(`   $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForRpc(maxRetries = 40): Promise<void> {
  process.stdout.write("   Esperando validator");
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      const json = await res.json() as any;
      if (json.result === "ok") { console.log(" ✓"); return; }
    } catch { /* aún arrancando */ }
    process.stdout.write(".");
    await sleep(1000);
  }
  throw new Error("El validator no respondió tras 40 segundos");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Parar todos los procesos del stack
  log("Deteniendo procesos previos del stack...");
  tryKill("pkill -f solana-test-validator");
  tryKill("pkill -f 'next dev'");
  tryKill("pkill -f 'tsx watch'");
  tryKill("lsof -ti:3000,3001,8899,8900 | xargs kill -9");
  await sleep(1500);
  console.log("   ✓ Procesos anteriores detenidos");

  // Borrar la DB del indexer para que refleje exactamente el estado on-chain nuevo.
  // Sin esto, un --reset del validator deja datos huérfanos en la DB.
  const dbPath = path.join(__dirname, "..", "indexer", "data", "indexer.db");
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath);
    console.log("   ✓ DB del indexer eliminada (se reconstruirá desde eventos on-chain)");
  }

  // 2. Arrancar validator con ledger limpio
  log("Arrancando solana-test-validator --reset ...");
  const validator = spawn("solana-test-validator", ["--reset"], {
    detached: true,
    stdio: "ignore",
  });
  validator.unref();
  await waitForRpc();

  // 3. Compilar y desplegar el programa
  log("Compilando el programa (anchor build)...");
  run("anchor build");
  log("Desplegando el programa (anchor deploy)...");
  run("anchor deploy");

  // 4. Inicialización opcional del estado on-chain
  if (AUTO_INITIALIZE) {
    log("Inicializando estado del programa on-chain...");

    const keypairRaw = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8")
    );
    const keypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(keypairRaw));

    const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
    const wallet     = new anchor.Wallet(keypair);
    const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    anchor.setProvider(provider);

    const idlPath = path.join(__dirname, "..", "target", "idl", "academic_certification.json");
    if (!fs.existsSync(idlPath)) {
      console.error("   ✗ IDL no encontrado. Algo falló en anchor build.");
      process.exit(1);
    }
    const idl     = JSON.parse(fs.readFileSync(idlPath, "utf8"));
    const program = new anchor.Program(idl, provider);

    const configAddr      = pda([Buffer.from("config")]);
    const adminPersonAddr = pda([Buffer.from("person"), keypair.publicKey.toBuffer()]);

    const already = await connection.getAccountInfo(configAddr);
    if (already) {
      console.log("   ⚠  ProgramConfig ya existe (se re-desplegó sobre el mismo ledger).");
    } else {
      await program.methods
        .initialize(ADMIN_NOMBRE, ADMIN_APELLIDO, ADMIN_DNI)
        .accounts({
          admin: keypair.publicKey,
          config: configAddr,
          adminPerson: adminPersonAddr,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("   ✓ ProgramConfig + AdminPerson creados");
    }
  } else {
    console.log("\n▶  Setup completado SIN initialize on-chain (modo recomendado para probar alta de primer admin).");
  }

  // 5. Resumen
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Localnet lista
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RPC:        ${RPC_URL}
  Program ID: ${PROGRAM_ID.toBase58()}

  Initialize on-chain ejecutado: ${AUTO_INITIALIZE ? "SI" : "NO"}

  Levanta el resto del stack en terminales separadas:
    cd indexer  && npm run dev
    cd backend  && npm run dev
    cd frontend && npm run dev

  Si NO inicializaste, abre el frontend y la primera wallet conectada
  podrá inicializar el sistema y quedar como Admin.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch(err => {
  console.error("\n✗ Error durante el setup:", err?.message ?? err);
  process.exit(1);
});
