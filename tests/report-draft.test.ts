// D8 — daily-report drafts must survive a reload, stay per-user and expire.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearReportDraft,
  draftKey,
  hasDraftContent,
  loadReportDraft,
  saveReportDraft,
  DRAFT_TTL_MS,
  type DraftStorage,
  type ReportCounts,
} from '../src/lib/report-draft.ts'

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
}

const counts = (over: Partial<ReportCounts> = {}): ReportCounts => ({
  present_count: 12,
  absent_count: 2,
  late_count: 1,
  injured_count: 0,
  excused_count: 3,
  ...over,
})

test('a saved draft is restored with its counts, notes and row id', () => {
  const store = memoryStorage()
  assert.equal(saveReportDraft('coach-1', { counts: counts(), notes: 'two students absent', draftId: 'row-9' }, store), true)
  const draft = loadReportDraft('coach-1', store)
  assert.ok(draft)
  assert.deepEqual(draft!.counts, counts())
  assert.equal(draft!.notes, 'two students absent')
  assert.equal(draft!.draftId, 'row-9')
})

test('drafts are scoped per user so a shared tablet never leaks one coach to another', () => {
  const store = memoryStorage()
  saveReportDraft('coach-1', { counts: counts(), notes: 'private observation', draftId: null }, store)
  assert.equal(loadReportDraft('coach-2', store), null)
  assert.notEqual(draftKey('coach-1'), draftKey('coach-2'))
  assert.ok(store.data.has(draftKey('coach-1')))
})

test('an empty user id never reads or writes storage', () => {
  const store = memoryStorage()
  assert.equal(saveReportDraft('', { counts: counts(), notes: 'x', draftId: null }, store), false)
  assert.equal(loadReportDraft('', store), null)
  assert.equal(store.data.size, 0)
})

test('drafts older than the TTL are ignored and dropped on read', () => {
  const store = memoryStorage()
  const savedAt = 1_000_000
  saveReportDraft('coach-1', { counts: counts(), notes: 'stale', draftId: null }, store, savedAt)
  assert.equal(loadReportDraft('coach-1', store, savedAt + DRAFT_TTL_MS + 1), null)
  assert.ok(loadReportDraft('coach-1', store, savedAt + DRAFT_TTL_MS - 1))
})

test('corrupt, foreign-version or wrong-shaped snapshots are ignored instead of throwing', () => {
  const store = memoryStorage()
  store.setItem(draftKey('coach-1'), '{not json')
  assert.equal(loadReportDraft('coach-1', store), null)

  store.setItem(draftKey('coach-1'), JSON.stringify({ v: 99, counts: counts(), notes: 'x', savedAt: Date.now() }))
  assert.equal(loadReportDraft('coach-1', store), null)

  store.setItem(draftKey('coach-1'), JSON.stringify({ v: 1, counts: 'nope', notes: 5, savedAt: Date.now() }))
  const lenient = loadReportDraft('coach-1', store)
  assert.ok(lenient)
  assert.deepEqual(lenient!.counts, counts({ present_count: 0, absent_count: 0, late_count: 0, injured_count: 0, excused_count: 0 }))
  assert.equal(lenient!.notes, '')
})

test('counts are sanitised to non-negative integers', () => {
  const store = memoryStorage()
  saveReportDraft('coach-1', { counts: counts({ present_count: -4, absent_count: Number.NaN, late_count: 2.7 }), notes: '', draftId: null }, store)
  const draft = loadReportDraft('coach-1', store)!
  assert.equal(draft.counts.present_count, 0)
  assert.equal(draft.counts.absent_count, 0)
  assert.equal(draft.counts.late_count, 2)
})

test('an unavailable storage backend degrades to no draft rather than an error', () => {
  const broken: DraftStorage = {
    getItem() {
      throw new Error('denied')
    },
    setItem() {
      throw new Error('quota')
    },
    removeItem() {
      throw new Error('denied')
    },
  }
  assert.equal(saveReportDraft('coach-1', { counts: counts(), notes: 'x', draftId: null }, broken), false)
  assert.equal(loadReportDraft('coach-1', broken), null)
  assert.doesNotThrow(() => clearReportDraft('coach-1', broken))
  assert.equal(loadReportDraft('coach-1', null), null)
})

test('hasDraftContent only reports drafts worth restoring', () => {
  const empty = { v: 1 as const, counts: counts({ present_count: 0, absent_count: 0, late_count: 0, injured_count: 0, excused_count: 0 }), notes: '   ', draftId: null, savedAt: Date.now() }
  assert.equal(hasDraftContent(empty), false)
  assert.equal(hasDraftContent(null), false)
  assert.equal(hasDraftContent({ ...empty, notes: 'needs follow-up' }), true)
  assert.equal(hasDraftContent({ ...empty, counts: counts({ late_count: 1 }) }), true)
})

test('clearing removes the snapshot so a submitted report is not offered again', () => {
  const store = memoryStorage()
  saveReportDraft('coach-1', { counts: counts(), notes: 'x', draftId: null }, store)
  clearReportDraft('coach-1', store)
  assert.equal(loadReportDraft('coach-1', store), null)
})
