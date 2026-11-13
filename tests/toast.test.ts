// Guards the non-blocking notification channel that replaced window.alert (F13).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notify, setToastListener } from '../src/lib/toast.ts'

test('notify delivers the message to the mounted listener', () => {
  const seen: string[] = []
  const unbind = setToastListener((m) => seen.push(m))
  notify('Could not save the report')
  assert.deepEqual(seen, ['Could not save the report'])
  unbind()
})

test('empty and missing messages are ignored', () => {
  const seen: string[] = []
  const unbind = setToastListener((m) => seen.push(m))
  notify('')
  notify('   ')
  notify(null)
  notify(undefined)
  assert.deepEqual(seen, [])
  unbind()
})

test('unbinding stops delivery and notify never throws without a listener', () => {
  const seen: string[] = []
  const unbind = setToastListener((m) => seen.push(m))
  unbind()
  assert.doesNotThrow(() => notify('no listener mounted'))
  assert.deepEqual(seen, [])
})

test('a stale unbind cannot detach a newer listener', () => {
  const first: string[] = []
  const second: string[] = []
  const unbindFirst = setToastListener((m) => first.push(m))
  setToastListener((m) => second.push(m))
  unbindFirst()
  notify('routed to the newest listener')
  assert.deepEqual(first, [])
  assert.deepEqual(second, ['routed to the newest listener'])
  setToastListener(null)
})
