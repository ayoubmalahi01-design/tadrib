// Real unit tests for the attendance rules (F2 / duplicate prevention).
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NO_SESSION,
  buildAttendanceRows,
  friendlyAttendanceError,
  isMissingSessionColumn,
} from '../src/lib/attendance-core.ts'

const base = { institution_id: 'inst-1', coach_id: 'coach-1', session_date: '2026-11-13' }

test('detects the pre-migration "column session_key does not exist" error', () => {
  assert.equal(isMissingSessionColumn({ code: '42703', message: 'whatever' }), true)
  assert.equal(
    isMissingSessionColumn({ message: "column attendance_records.session_key does not exist" }),
    true,
  )
  assert.equal(
    isMissingSessionColumn({ message: "Could not find the 'session_key' column in the schema cache" }),
    true,
  )
})

test('does not treat unrelated errors as a missing column', () => {
  assert.equal(isMissingSessionColumn(null), false)
  assert.equal(isMissingSessionColumn({ code: '23505', message: 'duplicate key value' }), false)
  assert.equal(isMissingSessionColumn({ code: '42501', message: 'permission denied' }), false)
  // A duplicate-key error that happens to mention session_key must NOT trigger the fallback.
  assert.equal(
    isMissingSessionColumn({ code: '23505', message: 'duplicate key value violates unique constraint session_key' }),
    false,
  )
})

test('duplicate attendance (the F2 symptom) gets an actionable message, not raw Postgres text', () => {
  const msg = friendlyAttendanceError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "attendance_records_student_id_session_date_key"',
  })
  assert.match(msg, /already has an attendance record for this session/i)
  assert.doesNotMatch(msg, /constraint/i)
})

test('permission failures are explained, and unknown errors keep their message', () => {
  assert.match(friendlyAttendanceError({ code: '42501', message: 'new row violates row-level security policy' }), /not allowed/i)
  assert.equal(friendlyAttendanceError({ code: 'XX000', message: 'boom' }), 'boom')
  assert.equal(friendlyAttendanceError(null), '')
})

test('builds one row per selected student and skips unset ones', () => {
  const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }]
  const rows = buildAttendanceRows(students, { s1: 'present', s3: 'late' }, {}, base)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((r) => r.student_id), ['s1', 's3'])
  assert.equal(rows[0].status, 'present')
  assert.equal(rows[0].session_date, '2026-11-13')
  assert.equal(rows[0].coach_id, 'coach-1')
})

test('never emits the same student twice', () => {
  const students = [{ id: 's1' }, { id: 's1' }]
  const rows = buildAttendanceRows(students, { s1: 'present' }, {}, base)
  assert.equal(rows.length, 1)
})

test('blank reasons become null, real reasons are trimmed', () => {
  const students = [{ id: 's1' }, { id: 's2' }]
  const rows = buildAttendanceRows(
    students,
    { s1: 'absent', s2: 'excused' },
    { s1: '   ', s2: '  medical appointment  ' },
    base,
  )
  assert.equal(rows[0].reason, null)
  assert.equal(rows[1].reason, 'medical appointment')
})

test('keeps every documented status, including lateness separate from absence', () => {
  const students = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }]
  const status = {
    a: 'present', b: 'absent', c: 'late', d: 'excused', e: 'permission', f: 'medical_exemption',
  }
  const rows = buildAttendanceRows(students, status, {}, base)
  assert.equal(rows.length, 6)
  assert.notEqual(status.b, status.c, 'absence and lateness must stay distinct')
})

test('session identity falls back to a stable constant when no shift is open', () => {
  assert.equal(NO_SESSION, 'unspecified')
})
