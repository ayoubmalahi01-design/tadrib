// Attendance persistence (Supabase-backed). Pure rules live in attendance-core.ts.
//
// F2 background: attendance_records was unique on (student_id, session_date)
// with no session dimension, so a student attending two sessions in one day
// could not be recorded — the second coach's upsert turned into an UPDATE of
// the first coach's row, which RLS rejects. Migration 0001 adds `session_key`
// and moves the uniqueness rule to (student_id, session_date, session_key).
//
// IMPORTANT: this module works with AND without that migration applied.
// If the column is missing it falls back to the previous behaviour and reports
// `migrationRequired`, so attendance never breaks for an un-migrated project.
import { supabase } from './supabase'
import {
  NO_SESSION,
  buildAttendanceRows,
  friendlyAttendanceError,
  isMissingSessionColumn,
  type AttendanceInput,
  type AttendanceRecord,
} from './attendance-core'

export { NO_SESSION, buildAttendanceRows, friendlyAttendanceError, isMissingSessionColumn }
export type { AttendanceInput, AttendanceRecord, AttendanceStatus, PgError } from './attendance-core'

/** The coach's open shift, used as the session identity. */
export async function resolveSessionKey(coachId: string): Promise<string> {
  const { data, error } = await supabase
    .from('coach_shifts')
    .select('id')
    .eq('coach_id', coachId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return NO_SESSION
  return (data?.id as string | undefined) ?? NO_SESSION
}

/**
 * Load the attendance already recorded for a date.
 * Scoped to the current session when the session dimension exists, otherwise to
 * the whole day (the previous behaviour).
 */
export async function loadAttendance(
  date: string,
  coachId: string,
): Promise<{ records: AttendanceRecord[]; error: string | null; sessionKey: string }> {
  const sessionKey = await resolveSessionKey(coachId)
  const base = () =>
    supabase.from('attendance_records').select('student_id,status,reason').eq('session_date', date)

  const res = await base().eq('session_key', sessionKey)
  if (res.error && isMissingSessionColumn(res.error)) {
    const legacy = await base()
    return {
      records: (legacy.data ?? []) as AttendanceRecord[],
      error: legacy.error ? friendlyAttendanceError(legacy.error) : null,
      sessionKey: NO_SESSION,
    }
  }
  return {
    records: (res.data ?? []) as AttendanceRecord[],
    error: res.error ? friendlyAttendanceError(res.error) : null,
    sessionKey,
  }
}

/**
 * Save attendance for the current session.
 * Retries the pre-migration shape when `session_key` is unavailable, so an
 * un-migrated database keeps working exactly as before.
 *
 * `sessionKeyOverride` lets the caller resolve the session once (for example to
 * warn the coach before saving) instead of querying coach_shifts twice.
 */
export async function saveAttendance(
  rows: AttendanceInput[],
  coachId: string,
  sessionKeyOverride?: string,
): Promise<{ error: string | null; sessionKey: string; migrationRequired: boolean }> {
  if (!rows.length) return { error: null, sessionKey: NO_SESSION, migrationRequired: false }

  const sessionKey = sessionKeyOverride ?? (await resolveSessionKey(coachId))
  const withKey = rows.map((r) => ({ ...r, session_key: sessionKey }))

  const first = await supabase
    .from('attendance_records')
    .upsert(withKey, { onConflict: 'student_id,session_date,session_key' })

  if (first.error && isMissingSessionColumn(first.error)) {
    const retry = await supabase
      .from('attendance_records')
      .upsert(rows, { onConflict: 'student_id,session_date' })
    return {
      error: retry.error ? friendlyAttendanceError(retry.error) : null,
      sessionKey: NO_SESSION,
      migrationRequired: true,
    }
  }

  return {
    error: first.error ? friendlyAttendanceError(first.error) : null,
    sessionKey,
    migrationRequired: false,
  }
}
