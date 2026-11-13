// Pure attendance helpers: no Supabase client, no `import.meta.env`, no DOM.
// Keeping them separate is what makes them unit-testable in plain Node.

/** Session identity used when no coach_shift is open. */
export const NO_SESSION = 'unspecified'

export type AttendanceStatus =
  | 'present' | 'absent' | 'late' | 'excused' | 'permission' | 'medical_exemption'

export type AttendanceInput = {
  // Nullable: the platform owner has no institution, and RLS (not the client)
  // is what actually decides whether a write is allowed.
  institution_id: string | null
  student_id: string
  coach_id: string
  session_date: string
  status: string
  reason?: string | null
}

export type AttendanceRecord = { student_id: string; status: string; reason?: string | null }

export type PgError = { code?: string; message?: string; details?: string } | null

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

/**
 * Build the rows to persist from the UI state.
 * A student is never emitted twice, unset students are skipped, and blank
 * reasons become null rather than an empty string.
 */
export function buildAttendanceRows(
  students: { id: string }[],
  status: Record<string, string>,
  reasons: Record<string, string>,
  base: { institution_id: string | null; coach_id: string; session_date: string },
): AttendanceInput[] {
  const seen = new Set<string>()
  const rows: AttendanceInput[] = []
  for (const student of students) {
    const value = status[student.id]
    if (!value) continue
    if (seen.has(student.id)) continue
    seen.add(student.id)
    const reason = reasons[student.id]?.trim()
    rows.push({
      institution_id: base.institution_id,
      student_id: student.id,
      coach_id: base.coach_id,
      session_date: base.session_date,
      status: value,
      reason: reason ? reason : null,
    })
  }
  return rows
}
