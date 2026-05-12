import "dotenv/config";
import { Listener } from "./listener";
import { getDb } from "./db";

async function main(): Promise<void> {
  console.log("=== Academic Certification Indexer ===");

  // Inicializa la DB (crea tablas si no existen)
  getDb();

  const listener = new Listener();

  // Manejo limpio de señales de terminación
  const shutdown = () => {
    console.log("\n[Indexer] Deteniendo...");
    listener.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await listener.start();

  console.log("[Indexer] Escuchando eventos. Ctrl+C para detener.");

  // Mantiene el proceso vivo
  await new Promise(() => { /* never resolves */ });
}

main().catch((err) => {
  console.error("[Indexer] Error fatal:", err);
  process.exit(1);
});
