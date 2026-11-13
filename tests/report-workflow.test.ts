import { describe, expect, it } from "vitest";
import {
  REPORT_STATUSES,
  canEditReport,
  canReviewReport,
  countByStatus,
  isReportLocked,
  reportStatus,
  reviewPayload,
  statusKey,
  submitPayload,
} from "../src/lib/report-workflow";

const coach = "coach-1";

describe("reportStatus normalisation", () => {
  it("keeps known workflow statuses", () => {
    for (const s of REPORT_STATUSES) {
      expect(reportStatus({ status: s })).toBe(s);
    }
  });

  it("derives legacy rows from reviewed_at / is_finalized", () => {
    expect(reportStatus({ status: null, reviewed_at: "2026-01-01" })).toBe(
      "reviewed",
    );
    expect(reportStatus({ status: null, is_finalized: true })).toBe("submitted");
    expect(reportStatus({ status: null })).toBe("draft");
    expect(reportStatus(null)).toBe("draft");
  });

  it("treats unknown values as draft rather than crashing", () => {
    expect(reportStatus({ status: "ARCHIVED" })).toBe("draft");
  });
});

describe("edit permissions", () => {
  it("lets the authoring coach edit a draft", () => {
    expect(canEditReport({ coach_id: coach, status: "draft" }, "coach", coach)).toBe(
      true,
    );
  });

  it("lets the authoring coach edit a report returned for changes", () => {
    expect(
      canEditReport({ coach_id: coach, status: "needs_changes" }, "coach", coach),
    ).toBe(true);
  });

  it("blocks editing once submitted or reviewed", () => {
    expect(
      canEditReport({ coach_id: coach, status: "submitted" }, "coach", coach),
    ).toBe(false);
    expect(
      canEditReport({ coach_id: coach, status: "reviewed" }, "coach", coach),
    ).toBe(false);
  });

  it("blocks a different coach from editing someone else's report", () => {
    expect(
      canEditReport({ coach_id: "other", status: "draft" }, "coach", coach),
    ).toBe(false);
  });

  it("never lets administrators edit coach content", () => {
    for (const role of ["manager", "admin", "owner"]) {
      expect(canEditReport({ coach_id: coach, status: "draft" }, role, coach)).toBe(
        false,
      );
    }
  });
});

describe("review permissions", () => {
  it("lets managers and admins review a submitted report", () => {
    for (const role of ["manager", "admin"]) {
      expect(canReviewReport({ status: "submitted" }, role)).toBe(true);
    }
  });

  it("does not review drafts, closed or returned reports", () => {
    for (const status of ["draft", "reviewed", "needs_changes"]) {
      expect(canReviewReport({ status }, "manager")).toBe(false);
    }
  });

  it("gives coaches and the platform owner no review rights", () => {
    expect(canReviewReport({ status: "submitted" }, "coach")).toBe(false);
    expect(canReviewReport({ status: "submitted" }, "owner")).toBe(false);
  });

  it("locks only reviewed reports", () => {
    expect(isReportLocked({ status: "reviewed" })).toBe(true);
    expect(isReportLocked({ status: "needs_changes" })).toBe(false);
  });
});

describe("payloads and labels", () => {
  it("approve closes the report and keeps the reviewer note", () => {
    const p = reviewPayload("approve", "admin-1", "  جيد  ", "2026-02-02T10:00:00Z");
    expect(p).toMatchObject({
      status: "reviewed",
      is_finalized: true,
      reviewed_by: "admin-1",
      reviewed_at: "2026-02-02T10:00:00Z",
      review_note: "جيد",
    });
  });

  it("request changes returns the report to the coach without finalizing it", () => {
    const p = reviewPayload("request_changes", "admin-1", "", "2026-02-02T10:00:00Z");
    expect(p).toMatchObject({
      status: "needs_changes",
      is_finalized: false,
      changes_requested_at: "2026-02-02T10:00:00Z",
      review_note: null,
    });
  });

  it("resubmission reuses the same report row", () => {
    expect(submitPayload("2026-02-03T08:00:00Z")).toMatchObject({
      status: "submitted",
      is_finalized: true,
      submitted_at: "2026-02-03T08:00:00Z",
      review_note: null,
    });
  });

  it("maps every status to a translation key", () => {
    for (const s of REPORT_STATUSES) {
      expect(statusKey(s)).toMatch(/^status[A-Z]/);
    }
  });

  it("counts reports per status", () => {
    const counts = countByStatus([
      { status: "draft" },
      { status: "submitted" },
      { status: "submitted" },
      { status: "reviewed" },
      { status: null, is_finalized: true },
    ]);
    expect(counts.draft).toBe(1);
    expect(counts.submitted).toBe(3);
    expect(counts.reviewed).toBe(1);
    expect(counts.needs_changes).toBe(0);
  });
});
