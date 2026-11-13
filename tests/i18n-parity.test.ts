// §11 — every visible label must exist in Arabic, French and English.
//
// `Key` is derived from the Arabic dictionary, so a key missing from French or
// English would still compile as long as the object shape stayed loose, and the
// UI would then render the raw key or an empty label. This test pins the
// direction that matters: everything the interface can ask for must be present
// and non-empty in all three dictionaries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dict, isRtl, LANGS, makeT, type Key, type Lang } from '../src/lib/i18n.ts'

const arKeys = Object.keys(dict.ar) as Key[]

test('the dictionary carries a realistic number of keys', () => {
  assert.ok(arKeys.length >= 150, `expected at least 150 keys, found ${arKeys.length}`)
})

test('every Arabic key exists and is non-empty in Arabic, French and English', () => {
  const missing: string[] = []
  for (const lang of LANGS) {
    for (const key of arKeys) {
      const value = (dict[lang] as Record<string, string | undefined>)[key]
      if (typeof value !== 'string' || value.trim().length === 0) {
        missing.push(`${lang}.${key}`)
      }
    }
  }
  assert.deepEqual(missing, [], `untranslated keys: ${missing.join(', ')}`)
})

test('no dictionary value is a placeholder or a raw key name', () => {
  const suspicious: string[] = []
  for (const lang of LANGS) {
    for (const key of arKeys) {
      const value = (dict[lang] as Record<string, string>)[key]
      if (typeof value !== 'string') continue
      if (value === key || /^(todo|tbd|undefined|null|xxx)$/i.test(value.trim())) {
        suspicious.push(`${lang}.${key}=${value}`)
      }
    }
  }
  assert.deepEqual(suspicious, [], `placeholder values: ${suspicious.join(', ')}`)
})

test('makeT resolves every key in every language instead of echoing the key', () => {
  for (const lang of LANGS as Lang[]) {
    const t = makeT(lang)
    for (const key of arKeys) {
      const value = t(key)
      assert.equal(typeof value, 'string', `${lang}.${key} is not a string`)
      assert.notEqual(value, key, `${lang}.${key} fell back to the raw key`)
    }
  }
})

test('only Arabic is right-to-left', () => {
  assert.equal(isRtl('ar'), true)
  assert.equal(isRtl('fr'), false)
  assert.equal(isRtl('en'), false)
})

test('the report-draft and notification labels added in round 12 exist in all three languages', () => {
  const added: Key[] = [
    'saveDraft',
    'draftSaved',
    'draftRestored',
    'continueDraft',
    'enableNotifications',
    'notificationsOn',
    'notificationsBlocked',
    'close',
  ]
  for (const key of added) {
    for (const lang of LANGS) {
      const value = (dict[lang] as Record<string, string | undefined>)[key]
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${lang}.${key} is missing`)
    }
  }
  // Arabic and French must not have silently fallen back to the English wording.
  assert.notEqual(dict.ar.close, dict.en.close)
  assert.notEqual(dict.fr.close, dict.en.close)
})
