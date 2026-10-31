// Checks that every translation file in src/i18n/locales has exactly the keys of en.json.
// Plural keys (i18next's "key_one", "key_few", "key_other" …) must have exactly the plural forms of the file's language,
// e.g. "one" and "other" in English and German, "one", "few" and "other" in Serbian.
import { readdirSync, readFileSync } from 'node:fs'

const directory = new URL('../src/i18n/locales/', import.meta.url)
const pluralSuffix = /_(zero|one|two|few|many|other)$/

function keysOf(messages, prefix = '') {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

/** The keys of a file, with the plural keys of one text grouped under the text's key and their forms. */
function readKeys(file) {
  const keys = new Map()
  for (const key of keysOf(JSON.parse(readFileSync(new URL(file, directory), 'utf8')))) {
    const match = key.match(pluralSuffix)
    const base = match === null ? key : key.slice(0, -match[0].length)
    const forms = keys.get(base) ?? new Set()
    if (match !== null) forms.add(match[1])
    keys.set(base, forms)
  }
  return keys
}

const reference = readKeys('en.json')
const files = readdirSync(directory).filter((file) => file.endsWith('.json'))
let failed = false

for (const file of files) {
  const language = file.slice(0, -'.json'.length)
  const required = new Intl.PluralRules(language).resolvedOptions().pluralCategories
  const keys = readKeys(file)
  const errors = []
  for (const [key, forms] of reference) {
    if (!keys.has(key)) {
      errors.push(`missing key: ${key}`)
    } else if (forms.size > 0 !== keys.get(key).size > 0) {
      errors.push(`${forms.size > 0 ? 'not plural' : 'plural'} here, but ${forms.size > 0 ? 'plural' : 'not plural'} in en.json: ${key}`)
    }
  }
  for (const [key, forms] of keys) {
    if (!reference.has(key)) {
      errors.push(`key not in en.json: ${key}`)
    } else if (forms.size > 0) {
      for (const form of required) {
        if (!forms.has(form)) errors.push(`missing plural form: ${key}_${form}`)
      }
      for (const form of forms) {
        if (!required.includes(form)) errors.push(`plural form not used in ${language}: ${key}_${form}`)
      }
    }
  }
  if (errors.length > 0) {
    failed = true
    console.error(`${file}:`)
    for (const error of errors) console.error(`  ${error}`)
  }
}

if (failed) {
  process.exit(1)
}
console.log(`Translation keys match in ${files.join(', ')}.`)
