// Decides which screen an authenticated user sees before entering the app.
// The previous inline check treated "profile could not be loaded" and
// "no profile row linked yet" as "pending approval", which told rejected or
// broken accounts the wrong thing. Each state now maps to its own message.

export type GateState = 'active' | 'pending' | 'rejected' | 'suspended' | 'missing' | 'error'

export type GateProfile = { account_status?: string | null } | null | undefined

/**
 * @param profile     the row read from `profiles`, or null when none exists
 * @param loadError   the error message returned by the profile query, if any
 */
export function accountGate(profile: GateProfile, loadError?: string | null): GateState {
  if (loadError) return 'error'
  if (!profile) return 'missing'
  const status = (profile.account_status || '').trim().toLowerCase()
  if (status === 'active') return 'active'
  if (status === 'rejected') return 'rejected'
  if (status === 'suspended') return 'suspended'
  return 'pending'
}

const TITLES: Record<GateState, string> = {
  active: '',
  pending: 'pending',
  rejected: 'rejected',
  suspended: 'suspended',
  missing: 'profileMissingTitle',
  error: 'profileLoadFailedTitle',
}

const BODIES: Record<GateState, string> = {
  active: '',
  pending: 'awaitingApproval',
  rejected: 'rejectedMsg',
  suspended: 'suspendedMsg',
  missing: 'profileMissingMsg',
  error: 'profileLoadFailedMsg',
}

export function gateTitleKey(state: GateState): string {
  return TITLES[state]
}

export function gateBodyKey(state: GateState): string {
  return BODIES[state]
}

/** A failed profile read is retryable; a missing profile needs an administrator. */
export function gateAllowsRetry(state: GateState): boolean {
  return state === 'error'
}
