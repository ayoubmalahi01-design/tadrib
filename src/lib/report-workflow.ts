/**
 * Report review workflow — pure helpers, no Supabase, no React.
 *
 * Least-privilege rules enforced here (and mirrored by RLS in migration 0004):
 *  - a coach may edit only their own report, and only while it is a draft or was
 *    returned for changes;
 *  - administrators review but never edit the coach's content;
 *  - a reviewed report is locked for everybody;
 *  - the platform owner gets no review rights inside an institution.
 */

export type ReportStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "reviewed"
  | "needs_changes";

export type ReportLike = {
  status?: string | null;
  is_finalized?: boolean | null;
  reviewed_at?: string | null;
  coach_id?: string | null;
};

export const REPORT_STATUSES: ReportStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "reviewed",
  "needs_changes",
];

/** Administrator roles allowed to review reports of their own institution. */
export const REVIEWER_ROLES = ["manager", "admin"];

const KNOWN = new Set<string>(REPORT_STATUSES);

/**
 * Normalises legacy rows written before the workflow existed:
 * a row with `reviewed_at` is reviewed, a finalized row was submitted, and
 * anything else is still a draft.
 */
export function reportStatus(row: ReportLike | null | undefined): ReportStatus {
  const raw = String(row?.status ?? "")
    .trim()
    .toLowerCase();
  if (KNOWN.has(raw)) return raw as ReportStatus;
  if (row?.reviewed_at) return "reviewed";
  if (row?.is_finalized) return "submitted";
  return "draft";
}

/** True when the report is closed for editing. */
export function isReportLocked(row: ReportLike | null | undefined): boolean {
  return reportStatus(row) === "reviewed";
}

/** Only the authoring coach, and only while editable, may change the content. */
export function canEditReport(
  row: ReportLike | null | undefined,
  role: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (String(role) !== "coach") return false;
  if (!userId || !row?.coach_id || row.coach_id !== userId) return false;
  const status = reportStatus(row);
  return status === "draft" || status === "needs_changes";
}

/** Reviewers may act on a submitted report, never on a draft or a closed one. */
export function canReviewReport(
  row: ReportLike | null | undefined,
  role: string | null | undefined,
): boolean {
  if (!REVIEWER_ROLES.includes(String(role))) return false;
  return reportStatus(row) === "submitted";
}

/** A reviewed report may not be reviewed again. */
export function canReopenReport(
  row: ReportLike | null | undefined,
  role: string | null | undefined,
): boolean {
  return canReviewReport(row, role);
}

/** Translation key for a status badge. */
export function statusKey(status: ReportStatus): string {
  switch (status) {
    case "submitted":
      return "statusSubmitted";
    case "under_review":
      return "statusUnderReview";
    case "reviewed":
      return "statusReviewed";
    case "needs_changes":
      return "statusNeedsChanges";
    default:
      return "statusDraft";
  }
}

/** Counts per status, used by the dashboard and the filter chips. */
export function countByStatus(
  rows: (ReportLike | null | undefined)[],
): Record<ReportStatus, number> {
  const out: Record<ReportStatus, number> = {
    draft: 0,
    submitted: 0,
    under_review: 0,
    reviewed: 0,
    needs_changes: 0,
  };
  for (const row of rows) out[reportStatus(row)] += 1;
  return out;
}

/** The payload an administrator writes when reviewing a report. */
export function reviewPayload(
  action: "approve" | "request_changes",
  reviewerId: string,
  note: string,
  now: string,
): Record<string, unknown> {
  const clean = String(note ?? "").trim();
  if (action === "approve") {
    return {
      status: "reviewed",
      is_finalized: true,
      reviewed_by: reviewerId,
      reviewed_at: now,
      review_note: clean || null,
    };
  }
  return {
    status: "needs_changes",
    is_finalized: false,
    reviewed_by: reviewerId,
    reviewed_at: now,
    changes_requested_at: now,
    review_note: clean || null,
  };
}

/** A coach may resubmit a returned report; the draft keeps its identity. */
export function submitPayload(now: string): Record<string, unknown> {
  return {
    status: "submitted",
    is_finalized: true,
    finalized_at: now,
    submitted_at: now,
    review_note: null,
  };
}
