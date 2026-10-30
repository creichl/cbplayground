// Checks that every translation file in src/i18n/locales has exactly the keys of en.json.
import { readdirSync, readFileSync } from 'node:fs'

const directory = new URL('../src/i18n/locales/', import.meta.url)

function keysOf(messages, prefix = '') {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

function readKeys(file) {
  return new Set(keysOf(JSON.parse(readFileSync(new URL(file, directory), 'utf8'))))
}

const reference = readKeys('en.json')
const files = readdirSync(directory).filter((file) => file.endsWith('.json'))
let failed = false

for (const file of files) {
  const keys = readKeys(file)
  const missing = [...reference].filter((key) => !keys.has(key))
  const extra = [...keys].filter((key) => !reference.has(key))
  if (missing.length > 0 || extra.length > 0) {
    failed = true
    console.error(`${file}:`)
    for (const key of missing) console.error(`  missing key: ${key}`)
    for (const key of extra) console.error(`  key not in en.json: ${key}`)
  }
}

if (failed) {
  process.exit(1)
}
console.log(`Translation keys match in ${files.join(', ')}.`)
