// Attendance persistence, isolated from the UI so it can be unit-tested.
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

/** Session identity used when no coach_shift is open. */
export const NO_SESSION = 'unspecified'

export type AttendanceStatus =
  | 'present' | 'absent' | 'late' | 'excused' | 'permission' | 'medical_exemption'

export type AttendanceInput = {
  institution_id: string
  student_id: string
  coach_id: string
  session_date: string
  status: string
  reason?: string | null
}

export type AttendanceRecord = { student_id: string; status: string; reason?: string | null }

type PgError = { code?: string; message?: string; details?: string } | null

/** True when the error means `session_key` does not exist yet (migration 0001 not run). */
export function isMissingSessionColumn(error: PgError): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return /session_key/i.test(text) && /does not exist|schema cache/i.test(text)
}

/** Turn a Postgres error into a message a coach can act on. */
export function friendlyAttendanceError(error: PgError): string {
  if (!error) return ''
  if (error.code === '23505') {
    return 'This student already has an attendance record for this session. Reload the page and try again.'
  }
  if (error.code === '42501') {
    return 'You are not allowed to record attendance for this student or session.'
  }
  return error.message ?? 'Could not save attendance.'
}

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

  let res = await base().eq('session_key', sessionKey)
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
 */
export async function saveAttendance(
  rows: AttendanceInput[],
  coachId: string,
): Promise<{ error: string | null; sessionKey: string; migrationRequired: boolean }> {
  if (!rows.length) return { error: null, sessionKey: NO_SESSION, migrationRequired: false }

  const sessionKey = await resolveSessionKey(coachId)
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

/**
 * Pure: build the rows to persist from the UI state.
 * Kept separate so the selection/dedup rules are testable without a database.
 */
export function buildAttendanceRows(
  students: { id: string }[],
  status: Record<string, string>,
  reasons: Record<string, string>,
  base: { institution_id: string; coach_id: string; session_date: string },
): AttendanceInput[] {
  const seen = new Set<string>()
  const rows: AttendanceInput[] = []
  for (const student of students) {
    const value = status[student.id]
    if (!value) continue
    if (seen.has(student.id)) continue // never send the same student twice
    seen.add(student.id)
    rows.push({
      institution_id: base.institution_id,
      student_id: student.id,
      coach_id: base.coach_id,
      session_date: base.session_date,
      status: value,
      reason: reasons[student.id]?.trim() ? reasons[student.id].trim() : null,
    })
  }
  return rows
}
