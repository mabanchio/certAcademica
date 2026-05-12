import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  dbPath: process.env.DB_PATH ?? "../indexer/data/indexer.db",
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899",
  programId:
    process.env.PROGRAM_ID ?? "3A6PEQXB3UUrgNMEDnYYApx5B3jxwSfr7bTpjt5AEEpt",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()),
};
