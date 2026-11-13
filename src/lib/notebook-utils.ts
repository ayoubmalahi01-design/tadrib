/** Pure helpers for the private coach notebook. No Supabase, no React. */

export type NotebookEntry = {
  id: string;
  title?: string | null;
  body?: string | null;
  entry_date?: string | null;
  created_at?: string | null;
  coach_id?: string | null;
};

export type NotebookFilter = {
  query?: string;
  from?: string;
  to?: string;
};

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function dayOf(entry: NotebookEntry): string {
  const raw = entry.entry_date || entry.created_at || "";
  return String(raw).slice(0, 10);
}

/**
 * Filters notebook entries by free text (title/body) and an inclusive date range.
 * An empty filter returns the list untouched, preserving server ordering.
 */
export function filterNotebook<T extends NotebookEntry>(
  list: T[],
  filter: NotebookFilter,
): T[] {
  const q = norm(filter.query);
  const from = String(filter.from ?? "").trim();
  const to = String(filter.to ?? "").trim();
  if (!q && !from && !to) return list;
  return list.filter((entry) => {
    if (q && !norm(entry.title).includes(q) && !norm(entry.body).includes(q)) {
      return false;
    }
    const day = dayOf(entry);
    if (from && day && day < from) return false;
    if (to && day && day > to) return false;
    return true;
  });
}

/** Summary used in the notebook header: total entries and the latest day. */
export function notebookSummary(list: NotebookEntry[]): {
  total: number;
  lastDay: string;
} {
  if (!list.length) return { total: 0, lastDay: "" };
  const days = list.map(dayOf).filter(Boolean).sort();
  return { total: list.length, lastDay: days[days.length - 1] || "" };
}

/**
 * A notebook entry belongs to exactly one coach. Used to reject rows that a
 * misconfigured backend might return for another author.
 */
export function belongsToCoach(
  entry: NotebookEntry | null | undefined,
  coachId: string,
): boolean {
  if (!entry || !coachId) return false;
  return entry.coach_id === coachId;
}

/** Local draft key so a half-written entry survives a page reload per coach. */
export function notebookDraftKey(coachId: string): string {
  return coachId ? `tt.notebook.draft.${coachId}` : "";
}

export function isNotebookDraftUsable(
  draft: unknown,
): draft is { title: string; body: string; id?: string | null } {
  if (!draft || typeof draft !== "object") return false;
  const d = draft as Record<string, unknown>;
  const title = typeof d.title === "string" ? d.title.trim() : "";
  const body = typeof d.body === "string" ? d.body.trim() : "";
  return Boolean(title || body);
}
