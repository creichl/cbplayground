#!/usr/bin/env bash
# Runs the automated tests (see CLAUDE.md, "Automated tests"): installs the web dependencies and Playwright's Chromium,
# then Playwright starts the API and the web frontend, runs the tests and stops both again.
# Results (report.md, screenshots by feature, videos and traces of failed tests) in test-results/ in the repository root.
set -euo pipefail

cd "$(dirname "$0")/../.."
rm -rf test-results
mkdir -p test-results

# Build the API up front and stop the .NET build servers again: they stay in memory otherwise, and the run has to fit in
# the agent container's memory together with the API, Vite and Chromium.
dotnet build api/Cbplayground.Api --nologo -v quiet
dotnet build-server shutdown >/dev/null

cd web
npm ci --no-audit --no-fund
npx playwright install chromium
npx playwright test "$@"
