/**
 * MaatruMitra — HTTP server entry point.
 *
 * Runs migrations on startup, starts the Express app, and launches the job runner.
 * Separate from app.ts so tests can import the app without starting a server.
 */

import { createServer } from "node:http";
import { createApp } from "./app.js";
import { getDb } from "./db/client.js";
import { startJobRunner, stopJobRunner } from "./jobs/runner.js";

// Ensure DB is initialized and WAL mode is set
getDb();

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
