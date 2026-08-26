/**
 * MaatruMitra — HTTP server entry point.
 *
 * Runs migrations on startup, starts the Express app, and launches the job runner.
 * Separate from app.ts so tests can import the app without starting a server.
 */

import { createServer } from "node:http";
import { createApp } from "./app.js";
import { getDb } from "./db/client.js";
import { runMigrations, checkSchemaReady } from "./db/migrate.js";
import { startJobRunner, stopJobRunner } from "./jobs/runner.js";

async function start() {
  const db = getDb();

  // In development, run idempotent migrations automatically on startup
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Checking database migrations (development mode)…");
    await runMigrations({ silent: false });
  } else {
    // In production, enforce that migrations were explicitly applied beforehand
    if (!checkSchemaReady(db)) {
      console.error("FATAL: Database schema is missing or incomplete in production. Run 'pnpm db:migrate' before starting the server.");
      process.exit(1);
    }
  }

  const app = createApp();
  const server = createServer(app);
  const port = parseInt(process.env.PORT ?? "3000", 10);

  server.listen(port, () => {
    console.log(`\nMaatruMitra server running on http://localhost:${port}/`);
    console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);
    console.log(`PROTOTYPE — No live patient data\n`);
    startJobRunner();
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
  function shutdown(signal: string) {
    console.log(`\n[Server] ${signal} received. Shutting down gracefully…`);
    stopJobRunner();
    server.close(() => {
      console.log("[Server] HTTP server closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
