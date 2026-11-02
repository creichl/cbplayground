// Checks that no file in src imports with the alias "@/": the code imports relatively, with the file extension
// (e.g. '../lib/utils.ts'), so it runs with every Vite configuration, also one without resolve.alias.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = fileURLToPath(new URL('../src/', import.meta.url))
// from '@/…', import '@/…', import('@/…'), also in CSS: @import '@/…'
const aliasImport = /(?:\bfrom|\bimport\s*\(?)\s*['"]@\//

const files = readdirSync(source, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(ts|tsx|js|jsx|mjs|css)$/.test(entry.name))
  .map((entry) => join(entry.parentPath, entry.name))
  .sort()
const errors = []

for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (aliasImport.test(line)) errors.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`)
    })
}

if (errors.length > 0) {
  console.error(`Imports with "@/" (import relatively with the file extension instead, e.g. '../lib/utils.ts'):`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}
console.log(`No "@/" imports in ${files.length} files under src.`)
