// Guards the trilingual dictionary: no missing keys, no empty labels, correct RTL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dict, LANGS, isRtl, makeT } from '../src/lib/i18n.ts'

test('the three required languages are registered', () => {
  assert.deepEqual([...LANGS].sort(), ['ar', 'en', 'fr'])
})

test('every language defines exactly the same keys', () => {
  const reference = Object.keys(dict.ar).sort()
  assert.ok(reference.length > 100, `expected a substantial dictionary, got ${reference.length}`)
  for (const lang of LANGS) {
    const keys = Object.keys(dict[lang]).sort()
    const missing = reference.filter((k) => !keys.includes(k))
    const extra = keys.filter((k) => !reference.includes(k))
    assert.deepEqual(missing, [], `${lang} is missing keys: ${missing.join(', ')}`)
    assert.deepEqual(extra, [], `${lang} has keys the others lack: ${extra.join(', ')}`)
  }
})

test('no visible label is empty or left as a placeholder', () => {
  const offenders: string[] = []
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(dict[lang])) {
      if (typeof value !== 'string' || value.trim() === '') offenders.push(`${lang}.${key}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('Arabic is right-to-left, French and English are not', () => {
  assert.equal(isRtl('ar'), true)
  assert.equal(isRtl('fr'), false)
  assert.equal(isRtl('en'), false)
})

test('translation actually resolves instead of echoing the key', () => {
  for (const lang of LANGS) {
    const t = makeT(lang)
    const sample = ['attendance', 'students', 'reports']
    for (const key of sample) {
      const out = t(key)
      assert.ok(out && out !== key, `${lang}.${key} did not resolve`)
    }
  }
})

test('an unknown key degrades to the key itself rather than crashing', () => {
  assert.equal(makeT('ar')('definitely-not-a-key'), 'definitely-not-a-key')
})
