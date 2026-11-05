import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Automated tests (see CLAUDE.md, "Automated tests"): Playwright starts the API with fresh demo data and the Vite dev
// server, runs the API smoke tests and the browser tests in headless Chromium, and stops both again.
// Everything the run produces lands in test-results/ in the repository root: report.md, the screenshots by feature
// (screenshots/<feature>/) and, of a failing test, its video and trace (playwright/).
const results = join(import.meta.dirname, '../test-results')

// The API's data of the test run lives outside the repository and the results; "--reset-demo-data" empties it on every
// start, so each run begins with the demo restaurants, users and reservations of the development seed.
const apiData = join(tmpdir(), 'cbplayground-e2e')

export default defineConfig({
  testDir: './e2e',
  outputDir: join(results, 'playwright'),
  forbidOnly: true,
  // One browser at a time: the API, Vite and Chromium have to fit in the agent container's memory (2 GB).
  workers: 1,
  retries: 0,
  reporter: [['list'], ['./e2e/markdown-reporter.ts', { outputFile: join(results, 'report.md') }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    locale: 'en-US',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // The built API (e2e/run.sh builds it first), started directly instead of through "dotnet run", whose own process
      // costs memory the agent container does not have to spare. Its project folder is the content root (seed assets).
      // The Vite dev server forwards /api to http://localhost:5025 (vite.config.ts), so the API has to listen there.
      command: 'dotnet bin/Debug/net10.0/Cbplayground.Api.dll --reset-demo-data',
      cwd: join(import.meta.dirname, '../api/Cbplayground.Api'),
      url: 'http://localhost:5025/api/health',
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        ASPNETCORE_URLS: 'http://localhost:5025',
        ConnectionStrings__Default: `Data Source=${join(apiData, 'cbplayground.db')}`,
        Uploads__Path: join(apiData, 'uploads'),
        DataProtection__KeysPath: join(apiData, 'keys'),
      },
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
