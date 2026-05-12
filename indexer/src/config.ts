import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable de entorno requerida: ${name}`);
  return value;
}

export const config = {
  rpcUrl: process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899",
  wsUrl: process.env.SOLANA_WS_URL ?? "ws://127.0.0.1:8900",
  programId: process.env.PROGRAM_ID ?? "3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt",
  dbPath: process.env.DB_PATH ?? "./data/indexer.db",
  startSlot: parseInt(process.env.START_SLOT ?? "0", 10),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10),
};
