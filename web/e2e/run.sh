#!/usr/bin/env bash
# Runs the automated tests (see CLAUDE.md, "Automated tests"): installs the web dependencies and Playwright's Chromium,
# builds the API and the web frontend, then Playwright starts the API and serves the build, runs the tests and stops both
# again. Results (report.md, screenshots by feature, traces of failed tests) in test-results/ in the repository root.
set -euo pipefail

cd "$(dirname "$0")/../.."
rm -rf test-results
mkdir -p test-results

# Build the API up front and stop the .NET build servers again: they stay in memory otherwise, and the run has to fit in
# the agent container's memory together with the API, the preview server and Chromium.
dotnet build api/Cbplayground.Api --nologo -v quiet
dotnet build-server shutdown >/dev/null

cd web
npm ci --no-audit --no-fund
# The web frontend is built once and served by "vite preview" (playwright.config.ts), not by the dev server. In development
# mode, so it keeps what only exists in development: the check that Tailwind's styles reached the page (src/checkTailwind.ts),
# which the start page's test relies on, the demo accounts on /login, which its screenshot shows, and /dev/ui. Vite only
# keeps them (import.meta.env.DEV) with NODE_ENV=development; "--mode development" alone builds them out.
NODE_ENV=development npm run build -- --mode development
npx playwright install chromium
# Chromium's system libraries, when the toolkit "Browser for Playwright" did not bring them.
source e2e/browser-libs.sh
npx playwright test "$@"
