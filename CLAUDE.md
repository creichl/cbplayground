# CLAUDE.md

Notes for working on this repository. The README describes the product, the setup and the code in detail.

## Automated tests

Every ticket that changes behaviour adds or updates automated tests, with screenshots of the pages or states it changes:

- API logic: xUnit tests in `api/Cbplayground.Api.Tests` (see README, "Run the tests").
- What a user sees: Playwright tests in `web/e2e/`, with a screenshot of every checked page or state through
  `screenshot(page, '<feature>', '<name>')` from `web/e2e/screenshot.ts`.
- API smoke tests against the started API: `web/e2e/api.spec.ts`.

### Spec files

One file per feature in `web/e2e/`; shared helpers (`signIn`, `settle`, `revealAll`, `dateFromToday`, `bookRequest`) in
`helpers.ts`.

- Guest side: `start-page.spec.ts` (start page), `start-page-filters.spec.ts` (the start page's filters),
  `restaurant-navigation.spec.ts` (the section navigation of the restaurant page), `not-found.spec.ts` (not found pages), `booking.spec.ts` (booking page,
  booking dialog, embedded booking, unknown restaurant), `booking-flow.spec.ts` (bookings from start to confirmation,
  the guest's reservation link, the embed's booking and height), `table-choice.spec.ts` (the guest's table choice).
- Staff side: `sign-in.spec.ts`, `admin.spec.ts` (admin overview), `admin-structure.spec.ts` (sidebar, save bar, leaving
  with unsaved changes), `appearance.spec.ts` (table style on the appearance page), `areas.spec.ts` (area editor: real
  width, tables, archived tables), `pacing.spec.ts`, `reports.spec.ts` (reports page), `superadmin.spec.ts`,
  `styleguide.spec.ts`.
- Front desk: `service-screen.spec.ts` (layout, views, selection, services, sizes, old addresses),
  `front-desk-flow.spec.ts` (accepting, status with undo, phone reservation, walk-in, table overview, access),
  `front-desk-requests.spec.ts` (declining and undoing an accepted request), `walk-in.spec.ts` (walk-in on the floor
  plans and its undo), `closed-reservations.spec.ts`, `reservation-history.spec.ts`, `table-blocks.spec.ts` (blocking a
  table on the timeline and the floor plan, and removing the block), `waitlist.spec.ts` (the waitlist of walk-ins:
  adding, waiting, seating, leaving, the exceeded mark, the walk-in drawer's offer), `front-desk-moves.spec.ts` (drag and
  drop on the timeline and the floor plans, tapping a free cell, arrival at another table, combined reservations),
  `day-sheet.spec.ts` (the printable day sheet).
- Both sides: `combinations.spec.ts` (table combinations online, in the area editor and by phone).
- Both sides: `restaurant-details.spec.ts` (cuisines, price level, features and questions on the profile; the details and
  "Good to know" on the booking page; cuisine and price on the start page's cards).
- API: `api.spec.ts`.

A new feature's tests go into a new file `web/e2e/<feature>.spec.ts`; tests that extend a feature listed above go into
its file.

### Run the suite

```sh
bash web/e2e/run.sh
```

The script installs the web dependencies (`npm ci`) and Playwright's Chromium (`npx playwright install chromium`),
builds the API and the web frontend (`npm run build` in development mode, so the demo accounts on `/login`, `/dev/ui` and
`checkTailwind.ts` stay in it), and runs `npx playwright test` in `web/`. Playwright starts the API on
http://localhost:5025 with fresh demo data (Development environment, `--reset-demo-data`, its database and uploads in
`<tmp>/cbplayground-e2e`, not in `api/Cbplayground.Api/data/`) and serves the build with `vite preview` on
http://localhost:5173 (not the dev server, which needs more memory), runs the tests headless and stops both again. Both
ports must be free: stop a running `dotnet run` or `npm run dev` first. It needs no Docker and no root.
Exit code 0 means all tests passed.

Chromium needs system libraries (glib, nss, atk, X11, gbm, …) and a font, which the toolkit "Browser for Playwright"
brings. When they are missing and there is no root for `npx playwright install --with-deps chromium`,
`web/e2e/browser-libs.sh` (sourced by the script) fetches the Ubuntu 24.04 packages that contain them from
archive.ubuntu.com into `~/.cache/cbplayground-browser-libs`, checked like apt does (signed InRelease, SHA-256 of every
package), and points Chromium at them. Once Chromium finds all its libraries, it does nothing; delete the cache folder to
fetch them anew.

The results are in `test-results/` in the repository root (ignored by git):

- `report.md`: every test with its result and the container's memory (from `/sys/fs/cgroup/memory.current`, where it
  exists): right after the test and the peak during it (sampled every 100 ms, and `memory.peak` where it rose during
  the test), the peak of the run with the test it occurred in, and the errors of the failed ones;
- `screenshots/<feature>/<name>.png`: the screenshots;
- `playwright/`: of a failing test its trace, with every step and its screenshot (`npx playwright show-trace <trace.zip>`);
  no videos, their recording costs memory.

After the first run, while working on the tests, faster in `web/` (the API and the web frontend have to be built, e.g. by
the script, or by `dotnet build api/Cbplayground.Api` and `NODE_ENV=development npm run build -- --mode development`; build
the web frontend again after every change to it): `npx playwright test`, or one test with
`npx playwright test -g "<title>"`.

The tests run in English (`locale: 'en-US'`) against the demo data of the development seed, with one browser at a time,
so the run fits in the agent container's memory (2 GB). `.connbridge/autotest.json` runs the same script for the review
packages.

## Working in parallel and merging

Several tickets are worked on at the same time and merged together into review packages. Keep the merges small:

- **Browser tests:** put new tests in their own file per feature, `web/e2e/<feature>.spec.ts` (e.g. `waitlist.spec.ts`).
  Do not append them to another feature's file (see "Spec files"). Shared helpers such as `signIn` belong in
  `web/e2e/helpers.ts`; import them from there instead of copying them.
- **Migrations:** on a conflict in `AppDbContextModelSnapshot.cs` or a migration, never merge the snapshot by hand. Take
  the target branch's snapshot, delete the branch's own migration (`.cs` and `.Designer.cs`) and add it again with
  `dotnet ef migrations add <SameName>`, so it comes after the target's migrations. Then run `dotnet test`.
- **Locale files:** add new keys inside their own section object, not at the end of the file. Run `npm run lint` after
  every merge.
- **README:** describe a new page or feature in its own paragraph or subsection; do not extend an existing long
  paragraph.
- **Tests must not depend on each other:** every test that changes data creates what it needs (its own reservation, its
  own table). Never rely on what another test left behind or on the order of the tests.
