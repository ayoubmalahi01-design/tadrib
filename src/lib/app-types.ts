import type { Lang } from "./i18n";

export type AppRole = "owner" | "manager" | "admin" | "coach" | string;

/** Structural mirror of the profile object App.tsx keeps in state. */
export interface AppProfile {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  institution_id: string | null;
  account_status: string;
  preferred_language: Lang;
}

export type T = (key: string) => string;

export const ADMIN_ROLES = ["owner", "manager", "admin"];

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.includes(String(role));
}
