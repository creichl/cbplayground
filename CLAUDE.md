# CLAUDE.md

Notes for working on this repository. The README describes the product, the setup and the code in detail.

## Automated tests

Every ticket that changes behaviour adds or updates automated tests, with screenshots of the pages or states it changes:

- API logic: xUnit tests in `api/Cbplayground.Api.Tests` (see README, "Run the tests").
- What a user sees: Playwright tests in `web/e2e/`, with a screenshot of every checked page or state through
  `screenshot(page, '<feature>', '<name>')` from `web/e2e/screenshot.ts`.
- API smoke tests against the started API: `web/e2e/api.spec.ts`.

### Run the suite

```sh
bash web/e2e/run.sh
```

The script installs the web dependencies (`npm ci`) and Playwright's Chromium (`npx playwright install chromium`),
builds the API, and runs `npx playwright test` in `web/`. Playwright starts the API on http://localhost:5025 with fresh
demo data (Development environment, `--reset-demo-data`, its database and uploads in `<tmp>/cbplayground-e2e`, not in
`api/Cbplayground.Api/data/`) and the Vite dev server on http://localhost:5173, runs the tests headless and stops both
again. Both ports must be free: stop a running `dotnet run` or `npm run dev` first. It needs no Docker and no root.
Exit code 0 means all tests passed.

The results are in `test-results/` in the repository root (ignored by git):

- `report.md`: every test with its result, and the errors of the failed ones;
- `screenshots/<feature>/<name>.png`: the screenshots;
- `playwright/`: of a failing test its video and trace (`npx playwright show-trace <trace.zip>`).

After the first run, while working on the tests, faster in `web/` (the API has to be built, e.g. by the script or by
`dotnet build api/Cbplayground.Api`): `npx playwright test`, or one test with `npx playwright test -g "<title>"`.

The tests run in English (`locale: 'en-US'`) against the demo data of the development seed, with one browser at a time,
so the run fits in the agent container's memory (2 GB). `.connbridge/autotest.json` runs the same script for the review
packages.
