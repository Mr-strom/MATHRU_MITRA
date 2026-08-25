/**
 * MaatruMitra — SOP citation service.
 * Returns only APPROVED, ACTIVE excerpts with full document citation metadata.
 */

import * as sopRepo from "../repositories/sopExcerpts.repo.js";

export function search(keywords: string, limit = 10) {
  return sopRepo.search(keywords, limit);
}

export function findExcerpt(id: string) {
  return sopRepo.findById(id);
}
