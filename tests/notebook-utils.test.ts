import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterNotebook,
  notebookSummary,
  belongsToCoach,
  notebookDraftKey,
  isNotebookDraftUsable,
} from "../src/lib/notebook-utils.ts";

const entries = [
  {
    id: "1",
    title: "حصص الأحد",
    body: "عملنا على التمريرات",
    entry_date: "2026-11-10",
    coach_id: "coach-1",
  },
  {
    id: "2",
    title: "Bilan lundi",
    body: "Séance courte",
    entry_date: "2026-11-11",
    coach_id: "coach-1",
  },
  {
    id: "3",
    title: "ملاحظة قديمة",
    body: "بداية الموسم",
    entry_date: "2026-09-01",
    coach_id: "coach-1",
  },
];

test("notebook search matches title and body in both languages", () => {
  assert.equal(filterNotebook(entries, { query: "التمريرات" }).length, 1);
  assert.equal(filterNotebook(entries, { query: "bilan" })[0].id, "2");
});

test("notebook date range is inclusive", () => {
  const result = filterNotebook(entries, { from: "2026-11-10", to: "2026-11-11" });
  assert.deepEqual(
    result.map((e) => e.id),
    ["1", "2"],
  );
});

test("empty filter keeps server ordering", () => {
  assert.equal(filterNotebook(entries, {}).length, 3);
});

test("notebook summary reports total and latest day", () => {
  assert.deepEqual(notebookSummary(entries), { total: 3, lastDay: "2026-11-11" });
  assert.deepEqual(notebookSummary([]), { total: 0, lastDay: "" });
});

test("an entry from another coach is rejected", () => {
  assert.equal(belongsToCoach(entries[0], "coach-1"), true);
  assert.equal(belongsToCoach(entries[0], "coach-2"), false);
  assert.equal(belongsToCoach(null, "coach-1"), false);
});

test("local draft is scoped per coach and ignores empty drafts", () => {
  assert.equal(notebookDraftKey("coach-1"), "tt.notebook.draft.coach-1");
  assert.equal(notebookDraftKey(""), "");
  assert.equal(isNotebookDraftUsable({ title: "x", body: "" }), true);
  assert.equal(isNotebookDraftUsable({ title: "  ", body: " " }), false);
  assert.equal(isNotebookDraftUsable(null), false);
});
