import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/** The container's memory (cgroup v2): what it uses now and the most it has used since it started, in bytes. */
type Memory = { current: number; peak: number }

/** Reads the container's memory; undefined where the cgroup v2 files do not exist (e.g. outside a container). */
function readMemory(): Memory | undefined {
  try {
    const read = (name: string) => Number(readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim())
    return { current: read('memory.current'), peak: read('memory.peak') }
  } catch {
    return undefined
  }
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`

/**
 * Writes a short Markdown summary of the run (test-results/report.md): every test with its result and the container's
 * memory after it, the peak and the test it occurred in, and the errors of the failed ones.
 */
export default class MarkdownReporter implements Reporter {
  private readonly outputFile: string
  private readonly rows: { title: string; status: TestResult['status']; duration: number; memory?: Memory; error?: string }[] = []
  private memoryBefore: Memory | undefined

  constructor(options: { outputFile: string }) {
    this.outputFile = options.outputFile
  }

  onBegin() {
    this.memoryBefore = readMemory()
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.rows.push({
      title: test.titlePath().filter(Boolean).join(' › '),
      status: result.status,
      duration: result.duration,
      memory: readMemory(),
      error: result.error?.message,
    })
  }

  onEnd(result: FullResult) {
    const count = (status: TestResult['status']) => this.rows.filter((row) => row.status === status).length
    const withMemory = this.memoryBefore !== undefined
    const lines = [
      '# Automated tests',
      '',
      `Result: **${result.status}** · ${count('passed')} passed, ${count('failed') + count('timedOut')} failed, ${count('skipped')} skipped · ${Math.round(result.duration / 1000)} s`,
    ]
    if (withMemory) {
      // The peak counts since the container started: the first test after which it reached its highest value is the one
      // it occurred in; when it was already there before the first test, the build or something else before the run reached it.
      const peak = Math.max(this.memoryBefore!.peak, ...this.rows.map((row) => row.memory?.peak ?? 0))
      const where =
        this.memoryBefore!.peak === peak ? 'before the first test' : `in “${this.rows.find((row) => row.memory?.peak === peak)!.title}”`
      // The highest memory right after a test, for when the peak was reached before the run.
      const highest = this.rows.reduce((top, row) => ((row.memory?.current ?? 0) > (top.memory?.current ?? 0) ? row : top), this.rows[0])
      lines.push('', `Memory of the container: peak **${megabytes(peak)}**, ${where}.`)
      if (highest?.memory) lines.push(`Highest after a test: ${megabytes(highest.memory.current)}, after “${highest.title}”.`)
    }
    lines.push(
      '',
      withMemory ? '| Result | Test | Duration | Memory | Peak |' : '| Result | Test | Duration |',
      withMemory ? '| --- | --- | --- | --- | --- |' : '| --- | --- | --- |',
      ...this.rows.map((row) => {
        const cells = [row.status, row.title.replaceAll('|', '\\|'), `${(row.duration / 1000).toFixed(1)} s`]
        if (withMemory) cells.push(row.memory ? megabytes(row.memory.current) : '', row.memory ? megabytes(row.memory.peak) : '')
        return `| ${cells.join(' | ')} |`
      }),
      '',
      'Screenshots are in `screenshots/<feature>/`; a failing test keeps its trace in `playwright/` (`npx playwright show-trace <trace.zip>`).',
    )
    if (withMemory) {
      lines.push('Memory is the container’s (cgroup v2, page cache included) right after the test; the peak counts since the container started.')
    }
    const failed = this.rows.filter((row) => row.error !== undefined)
    if (failed.length > 0) {
      lines.push('', '## Errors')
      for (const row of failed) {
        // Without the terminal colours of Playwright's messages.
        lines.push('', `### ${row.title}`, '', '```', stripVTControlCharacters(row.error!), '```')
      }
    }
    mkdirSync(dirname(this.outputFile), { recursive: true })
    writeFileSync(this.outputFile, `${lines.join('\n')}\n`)
  }
}
