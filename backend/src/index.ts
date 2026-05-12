import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[Backend] Escuchando en http://localhost:${config.port}`);
});

const shutdown = () => {
  console.log("\n[Backend] Deteniendo servidor...");
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
