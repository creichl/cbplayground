import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/** The container's memory (cgroup v2), in bytes: right after a test, and the most it used during the test. */
type Memory = { current: number; peak: number }

/** Reads one of the container's cgroup v2 memory files; undefined where it does not exist (e.g. outside a container). */
function readCgroup(name: 'memory.current' | 'memory.peak'): number | undefined {
  try {
    return Number(readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim())
  } catch {
    return undefined
  }
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`

/**
 * Writes a short Markdown summary of the run (test-results/report.md): every test with its result and the container's
 * memory after it and at most during it, the peak of the run and the test it occurred in, and the errors of the failed ones.
 */
export default class MarkdownReporter implements Reporter {
  private readonly outputFile: string
  private readonly rows: { title: string; status: TestResult['status']; duration: number; memory?: Memory; error?: string }[] = []
  // The most memory the running test has used so far (one test at a time, workers: 1), and the kernel's peak at its start.
  private testPeak = 0
  private kernelPeakAtBegin: number | undefined
  private sampler: NodeJS.Timeout | undefined

  constructor(options: { outputFile: string }) {
    this.outputFile = options.outputFile
  }

  onBegin() {
    if (readCgroup('memory.current') === undefined) return
    // memory.peak counts since the container started, so it says nothing about this run once the container has been busy
    // before (merges, builds): the memory is sampled every 100 ms instead.
    this.sampler = setInterval(() => (this.testPeak = Math.max(this.testPeak, readCgroup('memory.current') ?? 0)), 100)
    this.sampler.unref()
  }

  onTestBegin() {
    this.testPeak = readCgroup('memory.current') ?? 0
    this.kernelPeakAtBegin = readCgroup('memory.peak')
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const current = readCgroup('memory.current')
    let memory: Memory | undefined
    if (current !== undefined) {
      let peak = Math.max(this.testPeak, current)
      // When the kernel's peak rose during the test, it is this test's exact peak, including what the sampling missed.
      const kernelPeak = readCgroup('memory.peak')
      if (kernelPeak !== undefined && this.kernelPeakAtBegin !== undefined && kernelPeak > this.kernelPeakAtBegin) peak = Math.max(peak, kernelPeak)
      memory = { current, peak }
    }
    this.rows.push({
      title: test.titlePath().filter(Boolean).join(' › '),
      status: result.status,
      duration: result.duration,
      memory,
      error: result.error?.message,
    })
  }

  onEnd(result: FullResult) {
    const count = (status: TestResult['status']) => this.rows.filter((row) => row.status === status).length
    clearInterval(this.sampler)
    const withMemory = this.rows.some((row) => row.memory !== undefined)
    const lines = [
      '# Automated tests',
      '',
      `Result: **${result.status}** · ${count('passed')} passed, ${count('failed') + count('timedOut')} failed, ${count('skipped')} skipped · ${Math.round(result.duration / 1000)} s`,
    ]
    if (withMemory) {
      const top = this.rows.reduce((top, row) => ((row.memory?.peak ?? 0) > (top.memory?.peak ?? 0) ? row : top))
      lines.push('', `Memory of the container: peak **${megabytes(top.memory!.peak)}**, in “${top.title}”.`)
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
      lines.push(
        'Memory is the container’s (cgroup v2, page cache included) right after the test; Peak is the most it used during the test (sampled every 100 ms).',
      )
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
