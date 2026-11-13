// D8 — daily-report draft persistence.
//
// The report form used to be all-or-nothing: a coach who closed the modal, lost
// signal or reloaded the tab lost every typed observation. Two layers now exist:
//
//  1. A local snapshot (this module) written on every keystroke, restored when the
//     form is reopened, and scoped per user so a shared tablet never leaks one
//     coach's draft to another.
//  2. A real `daily_reports` row with status 'draft' (is_finalized = false), which
//     the coach can reopen and submit later. `reports_update_own_draft` allows that
//     update; `lock_final_report` still blocks edits once finalized.
//
// The snapshot is deliberately boring: plain JSON, versioned, expiring, and it
// never throws when storage is unavailable (private mode, quota, SSR).

export type ReportCounts = {
  present_count: number;
  absent_count: number;
  late_count: number;
  injured_count: number;
  excused_count: number;
};

export type ReportDraft = {
  v: 1;
  counts: ReportCounts;
  notes: string;
  draftId: string | null;
  savedAt: number;
};

export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const draftKey = (userId: string): string => `tt.report-draft.${userId}`;

function resolveStorage(storage?: DraftStorage | null): DraftStorage | null {
  if (storage !== undefined) return storage;
  try {
    const candidate = (globalThis as unknown as { localStorage?: DraftStorage }).localStorage;
    if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') {
      return candidate;
    }
  } catch {
    /* access can throw in sandboxed iframes */
  }
  return null;
}

const emptyCounts = (): ReportCounts => ({
  present_count: 0,
  absent_count: 0,
  late_count: 0,
  injured_count: 0,
  excused_count: 0,
});

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function sanitizeCounts(raw: unknown): ReportCounts {
  const base = emptyCounts();
  if (!raw || typeof raw !== 'object') return base;
  const source = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof ReportCounts)[]) {
    base[key] = toCount(source[key]);
  }
  return base;
}

/** Persist the in-progress form. Returns false when nothing could be stored. */
export function saveReportDraft(
  userId: string,
  draft: { counts: ReportCounts; notes: string; draftId: string | null },
  storage?: DraftStorage | null,
  now: number = Date.now(),
): boolean {
  if (!userId) return false;
  const store = resolveStorage(storage);
  if (!store) return false;
  const payload: ReportDraft = {
    v: 1,
    counts: sanitizeCounts(draft.counts),
    notes: typeof draft.notes === 'string' ? draft.notes : '',
    draftId: typeof draft.draftId === 'string' && draft.draftId ? draft.draftId : null,
    savedAt: now,
  };
  try {
    store.setItem(draftKey(userId), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/** Read a still-valid draft. Expired, foreign or corrupt snapshots return null. */
export function loadReportDraft(
  userId: string,
  storage?: DraftStorage | null,
  now: number = Date.now(),
): ReportDraft | null {
  if (!userId) return null;
  const store = resolveStorage(storage);
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(draftKey(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;
  if (data.v !== 1) return null;
  const savedAt = Number(data.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > DRAFT_TTL_MS || savedAt > now + 60_000) return null;
  return {
    v: 1,
    counts: sanitizeCounts(data.counts),
    notes: typeof data.notes === 'string' ? data.notes : '',
    draftId: typeof data.draftId === 'string' && data.draftId ? data.draftId : null,
    savedAt,
  };
}

/** True when there is something worth restoring (avoids nagging with an empty draft). */
export function hasDraftContent(draft: ReportDraft | null): boolean {
  if (!draft) return false;
  if (draft.notes.trim().length > 0) return true;
  return Object.values(draft.counts).some((n) => n > 0);
}

export function clearReportDraft(userId: string, storage?: DraftStorage | null): void {
  if (!userId) return;
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(draftKey(userId));
  } catch {
    /* nothing to clean up */
  }
}
