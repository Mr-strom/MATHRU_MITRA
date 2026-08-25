/**
 * MaatruMitra — SOP excerpts repository.
 * Returns only APPROVED documents with ACTIVE excerpts.
 */

import { getDb, parseJsonColumn } from "./base.js";

export interface SopDocumentRow {
  id: string;
  title: string;
  version: string;
  effective_date: string;
  approval_status: string;
  approved_at: string | null;
}

export interface SopExcerptRow {
  id: string;
  document_id: string;
  section_label: string;
  page_reference: string;
  excerpt_text: string;
  tags: string; // JSON array string
  active: number;
}

export interface SopExcerptWithDoc extends SopExcerptRow {
  document: SopDocumentRow;
  tags_parsed: string[];
}

function joinExcerptsWithDoc(rows: SopExcerptRow[], docs: Map<string, SopDocumentRow>): SopExcerptWithDoc[] {
  return rows
    .filter((r) => docs.has(r.document_id))
    .map((r) => ({
      ...r,
      document: docs.get(r.document_id)!,
      tags_parsed: parseJsonColumn<string[]>(r.tags, []),
    }));
}

/** Full-text keyword search over active, approved SOP excerpts. */
export function search(keywords: string, limit = 10): SopExcerptWithDoc[] {
  const like = `%${keywords.toLowerCase()}%`;
  const rows = getDb().prepare(`
    SELECT e.* FROM sop_excerpts e
    JOIN sop_documents d ON d.id = e.document_id
    WHERE e.active = 1
      AND d.approval_status = 'APPROVED'
      AND (LOWER(e.excerpt_text) LIKE ? OR LOWER(e.section_label) LIKE ? OR LOWER(e.tags) LIKE ?)
    ORDER BY e.section_label ASC
    LIMIT ?
  `).all(like, like, like, limit) as SopExcerptRow[];

  const docIds = [...new Set(rows.map((r) => r.document_id))];
  const docs = new Map(
    docIds.map((id) => {
      const d = getDb()
        .prepare("SELECT id, title, version, effective_date, approval_status, approved_at FROM sop_documents WHERE id = ?")
        .get(id) as SopDocumentRow;
      return [id, d] as const;
    })
  );
  return joinExcerptsWithDoc(rows, docs);
}

export function findById(id: string): SopExcerptWithDoc | undefined {
  const row = getDb()
    .prepare("SELECT * FROM sop_excerpts WHERE id = ? AND active = 1")
    .get(id) as SopExcerptRow | undefined;
  if (!row) return undefined;
  const doc = getDb()
    .prepare("SELECT id, title, version, effective_date, approval_status, approved_at FROM sop_documents WHERE id = ? AND approval_status = 'APPROVED'")
    .get(row.document_id) as SopDocumentRow | undefined;
  if (!doc) return undefined;
  return { ...row, document: doc, tags_parsed: parseJsonColumn<string[]>(row.tags, []) };
}
