/**
 * MaatruMitra — Role definitions.
 * These are the only roles the authorization system recognizes.
 * SYSTEM is for background jobs only and must not make medical or messaging actions.
 */

export const ROLES = {
  ASHA_WORKER: "ASHA_WORKER",
  ANM_REVIEWER: "ANM_REVIEWER",
  PHC_ADMIN: "PHC_ADMIN",
  SYSTEM: "SYSTEM",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

/** Roles that can be assigned to human users */
export const HUMAN_ROLES: Role[] = [
  ROLES.ASHA_WORKER,
  ROLES.ANM_REVIEWER,
  ROLES.PHC_ADMIN,
];
