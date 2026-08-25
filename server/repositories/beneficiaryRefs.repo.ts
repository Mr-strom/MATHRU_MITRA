/**
 * MaatruMitra — Beneficiary references repository.
 */

import { getDb } from "./base.js";

export interface BeneficiaryRefRow {
  id: string;
  external_reference_alias: string;
  area_id: string;
  consent_status: "PENDING" | "GIVEN" | "WITHDRAWN";
  consent_captured_at: string | null;
  data_retention_until: string | null;
  created_at: string;
}

export function findById(id: string): BeneficiaryRefRow | undefined {
  return getDb()
    .prepare("SELECT * FROM beneficiary_references WHERE id = ?")
    .get(id) as BeneficiaryRefRow | undefined;
}

export function findByAlias(alias: string): BeneficiaryRefRow | undefined {
  return getDb()
    .prepare("SELECT * FROM beneficiary_references WHERE external_reference_alias = ?")
    .get(alias) as BeneficiaryRefRow | undefined;
}

export function hasActiveConsent(id: string): boolean {
  const row = findById(id);
  return row?.consent_status === "GIVEN";
}

export function findByArea(areaId: string): BeneficiaryRefRow[] {
  return getDb()
    .prepare("SELECT * FROM beneficiary_references WHERE area_id = ? ORDER BY created_at DESC")
    .all(areaId) as BeneficiaryRefRow[];
}
