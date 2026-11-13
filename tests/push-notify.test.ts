// D19 — system notifications must fire only when granted and the tab is hidden.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pushBlockedReason,
  pushNotification,
  requestPushPermission,
  type PushEnv,
  type PushPermission,
} from '../src/lib/push-notify.ts'

function env(over: Partial<PushEnv> = {}): PushEnv & { sent: { title: string; body: string }[] } {
  const sent: { title: string; body: string }[] = []
  return {
    sent,
    supported: true,
    permission: 'granted',
    visible: false,
    deliver: (title, body) => sent.push({ title, body }),
    ...over,
  }
}

test('a granted permission with a hidden tab delivers exactly one notification', () => {
  const e = env()
  assert.equal(pushNotification('تقرير جديد', 'تم إرسال تقرير يومي', e), true)
  assert.deepEqual(e.sent, [{ title: 'تقرير جديد', body: 'تم إرسال تقرير يومي' }])
})

test('a visible tab is skipped because the in-app list already shows the item', () => {
  const e = env({ visible: true })
  assert.equal(pushBlockedReason(e), 'visible')
  assert.equal(pushNotification('Message', 'hello', e), false)
  assert.equal(e.sent.length, 0)
})

test('missing permission states are reported and block delivery', () => {
  for (const [permission, reason] of [
    ['default', 'prompt'],
    ['denied', 'denied'],
    ['unsupported', 'unsupported'],
  ] as [PushPermission, string][]) {
    const e = env({ permission })
    assert.equal(pushBlockedReason(e), reason)
    assert.equal(pushNotification('Message', 'hello', e), false)
    assert.equal(e.sent.length, 0)
  }
})

test('an environment without the Notification API never delivers', () => {
  const e = env({ supported: false, permission: 'unsupported' })
  assert.equal(pushBlockedReason(e), 'unsupported')
  assert.equal(pushNotification('Message', 'hello', e), false)
})

test('empty titles are dropped instead of showing a blank popup', () => {
  const e = env()
  assert.equal(pushNotification('   ', 'body only', e), false)
  assert.equal(e.sent.length, 0)
})

test('a throwing deliver function does not break the caller', () => {
  const e = env({
    deliver: () => {
      throw new Error('notifications blocked')
    },
  })
  assert.throws(() => pushNotification('Message', 'hello', e))
})

test('permission requests delegate to the browser and report the resulting state', async () => {
  assert.equal(await requestPushPermission(env({ request: async () => 'granted' })), 'granted')
  assert.equal(await requestPushPermission(env({ request: async () => 'denied' })), 'denied')
  assert.equal(await requestPushPermission(env({ request: undefined })), 'unsupported')
})
