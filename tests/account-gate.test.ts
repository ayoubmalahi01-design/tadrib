// Regression test for the pre-app gate. The bug this guards: a profile read
// failure or an account with no profile row used to be shown as "pending
// approval", so rejected and broken accounts received the wrong message.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountGate, gateTitleKey, gateBodyKey, gateAllowsRetry } from '../src/lib/account-gate.ts'
import { dict, LANGS } from '../src/lib/i18n.ts'

test('an active account passes the gate', () => {
  assert.equal(accountGate({ account_status: 'active' }), 'active')
})

test('rejected, suspended and pending accounts are told apart', () => {
  assert.equal(accountGate({ account_status: 'rejected' }), 'rejected')
  assert.equal(accountGate({ account_status: 'suspended' }), 'suspended')
  assert.equal(accountGate({ account_status: 'pending' }), 'pending')
})

test('status matching ignores case and surrounding spaces', () => {
  assert.equal(accountGate({ account_status: ' ACTIVE ' }), 'active')
  assert.equal(accountGate({ account_status: 'Rejected' }), 'rejected')
})

test('an unknown or empty status is treated as pending, never as active', () => {
  assert.equal(accountGate({ account_status: '' }), 'pending')
  assert.equal(accountGate({ account_status: null }), 'pending')
  assert.equal(accountGate({ account_status: 'whatever' }), 'pending')
  assert.equal(accountGate({}), 'pending')
})

test('a failed profile read is reported as an error, not as pending approval', () => {
  const state = accountGate(null, 'permission denied for table profiles')
  assert.equal(state, 'error')
  assert.equal(gateTitleKey(state), 'profileLoadFailedTitle')
  assert.equal(gateBodyKey(state), 'profileLoadFailedMsg')
})

test('an account without a profile row gets its own explanation', () => {
  const state = accountGate(null, null)
  assert.equal(state, 'missing')
  assert.equal(gateTitleKey(state), 'profileMissingTitle')
  assert.equal(gateBodyKey(state), 'profileMissingMsg')
})

test('a rejected account is never shown the pending message', () => {
  assert.notEqual(gateTitleKey('rejected'), 'pending')
  assert.notEqual(gateBodyKey('rejected'), 'awaitingApproval')
})

test('only a failed read is retryable', () => {
  assert.equal(gateAllowsRetry('error'), true)
  for (const state of ['active', 'pending', 'rejected', 'suspended', 'missing'] as const) {
    assert.equal(gateAllowsRetry(state), false, `${state} should not offer retry`)
  }
})

test('every gate message key exists in all three dictionaries', () => {
  const states = ['pending', 'rejected', 'suspended', 'missing', 'error'] as const
  for (const state of states) {
    for (const key of [gateTitleKey(state), gateBodyKey(state)]) {
      for (const lang of LANGS) {
        const value = (dict[lang] as Record<string, string>)[key]
        assert.ok(value && value.trim() !== '', `${lang}.${key} is missing for gate state ${state}`)
      }
    }
  }
})
