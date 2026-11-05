import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/** Writes a short Markdown summary of the run (test-results/report.md): every test with its result and the errors of the failed ones. */
export default class MarkdownReporter implements Reporter {
  private readonly outputFile: string
  private readonly rows: { title: string; status: TestResult['status']; duration: number; error?: string }[] = []

  constructor(options: { outputFile: string }) {
    this.outputFile = options.outputFile
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.rows.push({
      title: test.titlePath().filter(Boolean).join(' › '),
      status: result.status,
      duration: result.duration,
      error: result.error?.message,
    })
  }

  onEnd(result: FullResult) {
    const count = (status: TestResult['status']) => this.rows.filter((row) => row.status === status).length
    const lines = [
      '# Automated tests',
      '',
      `Result: **${result.status}** · ${count('passed')} passed, ${count('failed') + count('timedOut')} failed, ${count('skipped')} skipped · ${Math.round(result.duration / 1000)} s`,
      '',
      '| Result | Test | Duration |',
      '| --- | --- | --- |',
      ...this.rows.map((row) => `| ${row.status} | ${row.title.replaceAll('|', '\\|')} | ${(row.duration / 1000).toFixed(1)} s |`),
      '',
      'Screenshots are in `screenshots/<feature>/`; a failing test keeps its video and trace in `playwright/`.',
    ]
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
