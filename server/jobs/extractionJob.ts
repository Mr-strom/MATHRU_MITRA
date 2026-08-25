/**
 * MaatruMitra — Background job: extraction.
 * Delegates to extraction service for schema-validated administrative draft creation.
 */

import * as backgroundJobsRepo from "../repositories/backgroundJobs.repo.js";
import * as extractionService from "../services/extraction.service.js";

export async function runExtractionJob(job: backgroundJobsRepo.BackgroundJobRow): Promise<void> {
  await extractionService.runExtraction(job.entity_id, job.id);
}
