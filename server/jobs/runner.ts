/**
 * MaatruMitra — Background job runner.
 *
 * Polls the background_jobs table every POLL_INTERVAL_MS.
 * Claims QUEUED jobs, runs the appropriate handler, marks DONE or FAILED.
 * Idempotent via idempotency_key (INSERT OR IGNORE in enqueue).
 * Retryable: failed jobs can be manually reset to QUEUED by an admin.
 *
 * Note: This is a simple polling runner for development.
 * For production, use a proper job queue (BullMQ, pg-boss, etc.).
 */

import * as backgroundJobsRepo from "../repositories/backgroundJobs.repo.js";
import { runTranscriptionJob } from "./transcriptionJob.js";
import { runExtractionJob } from "./extractionJob.js";

const POLL_INTERVAL_MS = parseInt(process.env.JOB_POLL_INTERVAL_MS ?? "15000", 10);
const MAX_ATTEMPTS = 3;

let _runnerTimer: ReturnType<typeof setTimeout> | null = null;
let _running = false;

async function processNextJob(): Promise<void> {
  if (_running) return;
  _running = true;

  try {
    const job = backgroundJobsRepo.claimNext();
    if (!job) return;

    if (job.attempt_count > MAX_ATTEMPTS) {
      backgroundJobsRepo.markFailed(job.id, `Max attempts (${MAX_ATTEMPTS}) exceeded.`);
      return;
    }

    console.log(`[JobRunner] Processing ${job.type} job ${job.id} (attempt ${job.attempt_count})`);

    try {
      switch (job.type) {
        case "TRANSCRIPTION":
          await runTranscriptionJob(job);
          break;
        case "EXTRACTION":
          await runExtractionJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${(job as { type: string }).type}`);
      }
      backgroundJobsRepo.markDone(job.id);
      console.log(`[JobRunner] Completed ${job.type} job ${job.id}`);
    } catch (err) {
      const safeMsg =
        err instanceof Error
          ? err.message.substring(0, 200).replace(/['"]/g, "")
          : "Unknown error";
      backgroundJobsRepo.markFailed(job.id, safeMsg);
      console.error(`[JobRunner] Failed ${job.type} job ${job.id}:`, safeMsg);
    }
  } finally {
    _running = false;
  }
}

export function startJobRunner(): void {
  console.log(`[JobRunner] Starting with ${POLL_INTERVAL_MS}ms poll interval`);

  const tick = async () => {
    await processNextJob();
    _runnerTimer = setTimeout(tick, POLL_INTERVAL_MS);
  };

  _runnerTimer = setTimeout(tick, 1000); // first tick after 1s
}

export function stopJobRunner(): void {
  if (_runnerTimer) {
    clearTimeout(_runnerTimer);
    _runnerTimer = null;
  }
}
