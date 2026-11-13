import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
      assert.equal(reportStatus({ status: s }), s);
    }
  });

  it("derives legacy rows from reviewed_at / is_finalized", () => {
    assert.equal(reportStatus({ status: null, reviewed_at: "2026-01-01" }), "reviewed");
    assert.equal(reportStatus({ status: null, is_finalized: true }), "submitted");
    assert.equal(reportStatus({ status: null }), "draft");
    assert.equal(reportStatus(null), "draft");
  });

  it("treats unknown values as draft rather than crashing", () => {
    assert.equal(reportStatus({ status: "ARCHIVED" }), "draft");
  });
});

describe("edit permissions", () => {
  it("lets the authoring coach edit a draft", () => {
    assert.equal(canEditReport({ coach_id: coach, status: "draft" }, "coach", coach), true);
  });

  it("lets the authoring coach edit a report returned for changes", () => {
    assert.equal(
      canEditReport({ coach_id: coach, status: "needs_changes" }, "coach", coach),
      true,
    );
  });

  it("blocks editing once submitted or reviewed", () => {
    assert.equal(
      canEditReport({ coach_id: coach, status: "submitted" }, "coach", coach),
      false,
    );
    assert.equal(
      canEditReport({ coach_id: coach, status: "reviewed" }, "coach", coach),
      false,
    );
  });

  it("blocks a different coach from editing someone else's report", () => {
    assert.equal(
      canEditReport({ coach_id: "other", status: "draft" }, "coach", coach),
      false,
    );
  });

  it("never lets administrators edit coach content", () => {
    for (const role of ["manager", "admin", "owner"]) {
      assert.equal(canEditReport({ coach_id: coach, status: "draft" }, role, coach), false);
    }
  });
});

describe("review permissions", () => {
  it("lets managers and admins review a submitted report", () => {
    for (const role of ["manager", "admin"]) {
      assert.equal(canReviewReport({ status: "submitted" }, role), true);
    }
  });

  it("does not review drafts, closed or returned reports", () => {
    for (const status of ["draft", "reviewed", "needs_changes"]) {
      assert.equal(canReviewReport({ status }, "manager"), false);
    }
  });

  it("gives coaches and the platform owner no review rights", () => {
    assert.equal(canReviewReport({ status: "submitted" }, "coach"), false);
    assert.equal(canReviewReport({ status: "submitted" }, "owner"), false);
  });

  it("locks only reviewed reports", () => {
    assert.equal(isReportLocked({ status: "reviewed" }), true);
    assert.equal(isReportLocked({ status: "needs_changes" }), false);
  });
});

describe("payloads and labels", () => {
  it("approve closes the report and keeps the reviewer note", () => {
    const p = reviewPayload("approve", "admin-1", "  جيد  ", "2026-02-02T10:00:00Z");
    assert.equal(p.status, "reviewed");
    assert.equal(p.is_finalized, true);
    assert.equal(p.reviewed_by, "admin-1");
    assert.equal(p.reviewed_at, "2026-02-02T10:00:00Z");
    assert.equal(p.review_note, "جيد");
  });

  it("request changes returns the report to the coach without finalizing it", () => {
    const p = reviewPayload("request_changes", "admin-1", "", "2026-02-02T10:00:00Z");
    assert.equal(p.status, "needs_changes");
    assert.equal(p.is_finalized, false);
    assert.equal(p.changes_requested_at, "2026-02-02T10:00:00Z");
    assert.equal(p.review_note, null);
  });

  it("resubmission reuses the same report row", () => {
    const p = submitPayload("2026-02-03T08:00:00Z");
    assert.equal(p.status, "submitted");
    assert.equal(p.is_finalized, true);
    assert.equal(p.submitted_at, "2026-02-03T08:00:00Z");
    assert.equal(p.review_note, null);
  });

  it("maps every status to a translation key", () => {
    for (const s of REPORT_STATUSES) {
      assert.match(statusKey(s), /^status[A-Z]/);
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
    assert.equal(counts.draft, 1);
    assert.equal(counts.submitted, 3);
    assert.equal(counts.reviewed, 1);
    assert.equal(counts.needs_changes, 0);
  });
});
