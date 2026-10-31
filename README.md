# cbplayground

cbplayground is a small multi-tenant platform for restaurant table reservations. Each restaurant (Gasthaus) is its own tenant: it describes its areas, floor plans, tables and opening hours, and decides how reservations are confirmed and how tables are assigned. Guests book a table online without an account, either on the platform's booking page or through an iframe embedded in the restaurant's own website. Restaurant staff enter phone reservations, track today's guests at the front desk and keep an overview of all tables. Every user interface is available in English, German, Serbian Latin and Serbian Cyrillic.

This README describes the full product vision.

## Roles & permissions

| Role | Who | Permissions |
| --- | --- | --- |
| **Superadmin** | Platform operator | Manages tenants (restaurants). |
| **Tenant Admin** | Restaurant owner or manager | Configures areas, floor plans, tables, opening hours, reservation settings and staff users. Enters reservations on a guest's behalf (e.g. phone reservations). |
| **Front desk** | Restaurant staff | Fewer permissions than the Tenant Admin, possibly with its own simplified view. Sets the reservation status (arrived, late, cancelled) and enters phone reservations. |
| **Guest** | Restaurant visitor | Has no account. Gives a name plus a phone number **or** an email address when booking. |

## Features

### Areas & floor plans

- A restaurant has one or more areas, for example a dining room and a terrace.
- Each area has its own uploaded floor plan image.
- A restaurant may also use a single area with a single floor plan; that is the restaurant's choice.

### Table placement

- Tables are placed on an area's floor plan.
- Each table has attributes such as its number, its position on the plan and its seat count (number of guests).

### Opening hours & holidays

- Each restaurant defines its regular opening hours.
- Public holidays are applied automatically. The restaurant selects its country and region.
- Supported countries:
  - Germany, by federal state
  - Austria
  - Serbia

### Reservations

- **Channels:**
  - Online by guests via the web frontend.
  - By a Tenant Admin or Front desk user on the guest's behalf, for example for a phone reservation.
- **Confirmation mode**, configurable per restaurant:
  - Instant confirmation (default).
  - Request: the restaurant must approve the reservation.
- **Table selection**, configurable per restaurant:
  - The guest picks a table.
  - The system assigns a table.
- **Reservation duration:**
  - A default duration per restaurant.
  - Optional rules by party size, for example 1–2 guests 90 minutes, 3–6 guests 120 minutes.
  - Staff can override the duration on an individual reservation.

### Guest notifications

- When the guest gave an email address, the guest receives email confirmations and status updates.
- Guests who gave only a phone number receive no notification.

### Table overview

- A view of all tables and their reservations.

### Online quota (auto mode)

- Per area, only a configurable percentage of the capacity can be booked online, so the rest stays free for phone bookings and walk-ins.
- Each area can be blocked completely for online booking.

### Front desk view

- The status of today's reservations: arrived, late, cancelled.
- The table overview.

### Embedding

- Restaurants embed the guest booking UI into their own website with an **iframe** snippet.

### Internationalization

- Supported languages:
  - English (`en`)
  - German (`de`)
  - Serbian Latin (`sr-Latn`)
  - Serbian Cyrillic (`sr-Cyrl`)
- All languages apply to every UI: guest booking, embed, admin and front desk.

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | .NET 10 Minimal API |
| Frontend | React web frontend |
| Database | SQLite, accessed via EF Core |
| Staff authentication | ASP.NET Core Identity |
| Local development | No Docker: the API creates and migrates a local SQLite file on startup |

## Architecture overview

- **API:** a .NET 10 Minimal API.
- **Web:** a React web frontend for all user interfaces: guest booking, admin and front desk. It also serves the guest booking UI that restaurants embed via an iframe snippet.
- **Database:** a single SQLite database, accessed via EF Core.
- **Multi-tenancy:** one tenant is one restaurant. All tenants share one database. Every tenant-owned table has a `TenantId` column, and EF Core global query filters keep the data of each tenant isolated.
- **Authentication:** staff users authenticate with ASP.NET Core Identity. Guests have no account.
- **Email:** the platform sends outgoing email to guests (confirmations and status updates). **Open:** how outgoing email is caught in local development. Mailpit no longer runs via Docker; the replacement will be solved without Docker and is not decided yet.

## Repository layout

```text
/
├── api/                          # .NET 10 Minimal API
│   ├── Cbplayground.slnx
│   ├── dotnet-tools.json         # local tool manifest (dotnet-ef)
│   ├── Cbplayground.Api/
│   │   ├── Auth/                 # roles, policies, tenant claim
│   │   ├── Backups/              # daily backup of the database and the floor plans
│   │   ├── Data/                 # AppDbContext, entities, development seed
│   │   ├── Endpoints/            # endpoint groups, one file per area
│   │   ├── Migrations/           # EF Core migrations
│   │   ├── OpeningHours/         # public holidays, opening calendar, supported countries
│   │   └── Reservations/         # availability, duration policy, reservation rules
│   └── Cbplayground.Api.Tests/   # xUnit tests
└── web/                          # React web frontend (Vite, TypeScript)
```

## Getting started

The repository contains a first walking skeleton: the API stores restaurants (tenants) in SQLite, and the web frontend lists them through the API. Docker is not used, neither for building nor for running.

Prerequisites:

- .NET 10 SDK
- Node.js

### Run the API

```sh
cd api/Cbplayground.Api
dotnet run
```

The API listens on http://localhost:5025. In the Development environment (the default for `dotnet run`), it creates the SQLite database `api/Cbplayground.Api/data/cbplayground.db` on startup, applies all migrations, adds two demo restaurants if there are none yet, creates the demo staff users (see below) that do not exist yet and adds demo reservations (see [Demo reservations](#demo-reservations)). The connection string is in `appsettings.json`.

Endpoints:

- `GET /api/health`
- `GET /api/tenants`: all restaurants, sorted by name
- `POST /api/auth/login`: body `{ "email", "password" }`. Signs in with a cookie and returns the same user as `me`. On failure: 401 with `{ "error": "invalid_credentials" | "locked_out" | "deactivated" }`.
- `POST /api/auth/logout`: signs out (204).
- `GET /api/auth/me`: the signed-in user: `id`, `email`, `displayName`, `role`, `tenant { id, name, slug }` (`null` for the Superadmin); 401 without sign-in.
- `GET /api/admin/tenant`: the restaurant of the signed-in Tenant Admin.
- Staff management, Tenant Admins only, always for the signed-in admin's own restaurant (users of other restaurants get 404):
  - `GET /api/admin/staff`: the restaurant's users: `id`, `email`, `displayName`, `role`, `isActive`, sorted by name.
  - `POST /api/admin/staff`: body `{ "email", "displayName", "role", "password" }` with the role `TenantAdmin` or `FrontDesk` and the start password. Returns 201 with the new user.
  - `PUT /api/admin/staff/{id}`: body `{ "displayName", "role" }`. Returns the user.
  - `POST /api/admin/staff/{id}/deactivate` and `/activate`. Return the user.
  - `POST /api/admin/staff/{id}/password`: body `{ "password" }`. Sets a new password (204) and ends the user's other sessions.
  - Errors: 400 with `{ "error": "invalid_email" | "invalid_name" | "invalid_role" | "password_too_weak" }`, 409 with `{ "error": "email_taken" | "last_admin" | "cannot_deactivate_self" }`. The last active Tenant Admin of a restaurant cannot be deactivated or given another role, and nobody can deactivate themselves.
- Areas (Tenant Admins only):
  - `GET /api/admin/areas`: the restaurant's areas in their order: `id`, `name`, `sortOrder`, `floorPlanUrl` (`null` without floor plan), `onlineBookingEnabled`, `onlineCapacityPercent`.
  - `POST /api/admin/areas`: body `{ "name" }`. A new area comes last, is open for online booking and has an online quota of 100 %.
  - `PUT /api/admin/areas/{id}`: body `{ "name", "onlineBookingEnabled", "onlineCapacityPercent" }` (0–100).
  - `DELETE /api/admin/areas/{id}`: deletes the area with its tables and its floor plan image. 409 `table_has_reservations` while one of its tables has a reservation that has not ended yet (see below).
  - `PUT /api/admin/areas/order`: body `{ "areaIds": [...] }` with every area of the restaurant once, in the new order.
  - `PUT /api/admin/areas/{id}/floorplan`: the body is the image itself (PNG, JPEG or WebP, at most 10 MB). The type is detected from the content; the file name is chosen by the server. Replaces an existing floor plan.
- `GET /api/areas/{id}/floorplan`: the floor plan image of an area. Public, because guests will see it to pick a table.
- Tables (Tenant Admins only):
  - `GET /api/admin/tables`: all tables of the restaurant: `id`, `areaId`, `number`, `seats`, `posX`, `posY`. The position is relative to the floor plan image, from 0 to 1.
  - `POST /api/admin/tables`: body `{ "areaId", "number", "seats" }`. The table is placed in the middle of the floor plan.
  - `PUT /api/admin/tables/{id}`: body `{ "number", "seats" }`.
  - `DELETE /api/admin/tables/{id}`. 409 `table_has_reservations` while the table has a reservation in the status `Requested`, `Confirmed`, `Arrived` or `Late` that has not ended yet. Its other reservations (past ones, cancelled and declined ones) are deleted together with the table: a reservation always keeps its table (the foreign key is `Restrict`), so the reservations that no longer matter are removed first, in the same transaction.
  - `PUT /api/admin/tables/positions`: body `[{ "id", "posX", "posY" }, ...]`. Saves the positions of several tables at once, all or none.
  - The table number (at most 20 characters) is unique within the restaurant, a table has at least 1 seat.
- `GET /api/admin/opening-hours`: the regular opening hours of the whole week, `{ "periods": [{ "dayOfWeek", "start", "end" }] }`. `dayOfWeek` is 0 (Sunday) to 6 (Saturday), times are `HH:mm`, the end may be `24:00`.
- `PUT /api/admin/opening-hours`: replaces the whole week (same body, 204). Errors: `invalid_day`, `invalid_time`, `start_not_before_end`, `overlapping_periods`.
- `GET /api/admin/location`: `countryCode` (`DE`, `AT`, `RS`), `regionCode` (federal state for Germany, e.g. `DE-BY`, otherwise `null`) and `timeZoneId` (derived from the country); all `null` until set.
- `PUT /api/admin/location`: body `{ "countryCode", "regionCode" }`. Errors: `invalid_country`, `region_required`, `invalid_region`, `region_not_allowed`.
- `GET /api/admin/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD`: the public holidays of the restaurant's location, one entry per day: `date`, `keys` (holiday names as translation keys, e.g. `corpusChristi`) and `isOpen`. Without `from`/`to`: the next 12 months, starting today in the restaurant's time zone; at most 2 years (`invalid_range`). Empty without a location.
- `PUT /api/admin/holidays/{date}`: body `{ "isOpen" }` opens or closes the restaurant on that holiday (204); `not_a_holiday` for other days.
- `GET /api/admin/reservation-settings`: the reservation settings of the Tenant Admin's restaurant: `confirmationMode` (`Instant` | `Request`), `tableSelectionMode` (`GuestChooses` | `SystemAssigns`), `defaultDurationMinutes` and `durationRules` (`minGuests`, `maxGuests`, `durationMinutes`, sorted by `minGuests`). A restaurant that has not saved any settings gets the defaults: instant confirmation, the system assigns tables, 120 minutes, no rules.
- `PUT /api/admin/reservation-settings`: saves the settings and replaces all duration rules, same body as `GET`. Durations are 15 to 480 minutes in steps of 15; a rule needs `minGuests` ≥ 1 and `minGuests` ≤ `maxGuests`, and rules must not overlap (gaps are allowed, the default duration applies there). On failure: 400 with `{ "error": "invalid_mode" | "invalid_duration" | "invalid_min_guests" | "min_greater_than_max" | "overlapping_rules" }`.

`IReservationDurationPolicy.GetDurationAsync(guests)` returns the duration of a reservation for the current restaurant: the duration of the rule that contains the party size, otherwise the default duration.

- Guest booking, without sign-in. The restaurant comes from the slug in the URL (unknown slug: 404) and is the tenant of the request, also when a user of another restaurant is signed in:
  - `GET /api/public/restaurants/{slug}`: `name`, `timeZoneId`, `confirmationMode`, `tableSelectionMode`, `maxOnlinePartySize` (seats of the largest table that can be booked online, 0 if none), `openingHours` (the week, as in `GET /api/admin/opening-hours`) and `bookable` (false without location, opening hours or tables that can be booked online).
  - `GET /api/public/restaurants/{slug}/calendar?month=YYYY-MM&guests=N`: one entry per day of the month, `{ "date", "status" }` with `closed` (closed, in the past or more than 90 days ahead), `full` or `available`, for the date picker. Errors: `invalid_month`, `invalid_party_size`.
  - `GET /api/public/restaurants/{slug}/availability?date=YYYY-MM-DD&guests=N`: `date`, `guests`, `durationMinutes` and `periods`: per opening window `{ "start", "end", "times": [{ "time", "available" }] }`. No periods on closing days and closed public holidays.
  - `GET /api/public/restaurants/{slug}/tables?date=YYYY-MM-DD&time=HH:mm&guests=N`: only when the guest chooses the table (otherwise 400 `table_selection_disabled`). The areas open for online booking in their order, `{ "id", "name", "floorPlanUrl", "tables": [{ "id", "number", "seats", "posX", "posY", "available" }] }`. `available` considers size, other reservations, the online quota and the opening hours.
  - `POST /api/public/restaurants/{slug}/reservations`: body `{ "date", "time", "guests", "tableId", "name", "phone", "email", "notes", "language" }`. `tableId` is required when the guest chooses the table and ignored when the system assigns it; `phone` or `email` is required; `language` is `en`, `de`, `sr-Latn` or `sr-Cyrl`. Returns 201 with `referenceCode`, `status` (`Confirmed` in the instant mode, `Requested` in the request mode), `date`, `time`, `guests`, `durationMinutes`, `area` and `tableNumber`. Errors: 400 `invalid_date`, `invalid_time`, `invalid_party_size`, `invalid_name`, `contact_required`, `invalid_phone`, `invalid_email`, `invalid_notes`, `invalid_language`, `table_required`, `outside_opening_hours`, `too_far_ahead`, `in_the_past`; 409 `slot_unavailable`, `table_unavailable`; 429 after 10 bookings from the same IP address within 10 minutes (`RateLimiting:PublicBookings:PermitLimit`, the address the API sees).
- Reservations for the staff (Tenant Admins and Front desk users, `RequireStaff` policy), always of the signed-in user's restaurant; reservations of other restaurants are 404:
  - `GET /api/staff/floor`: the areas in their order with their tables: `id`, `name`, `sortOrder`, `floorPlanUrl`, `tables` (`id`, `number`, `seats`, `posX`, `posY`).
  - `GET /api/staff/reservations?from=YYYY-MM-DD&to=YYYY-MM-DD`: the reservations starting on these days (without `from`/`to`: today in the restaurant's time zone; at most 366 days, otherwise `invalid_range`), sorted by start: `id`, `referenceCode`, `date`, `time`, `endTime`, `durationMinutes`, `guests`, `status`, `source` (`Online` | `Staff`), `tableId`, `tableNumber`, `areaId`, `areaName`, `name`, `phone`, `email`, `notes`, `language`, `createdAtUtc`, `updatedAtUtc`.
  - `GET /api/staff/availability?date=YYYY-MM-DD&guests=N&durationMinutes=M`: like the public availability, but each time lists the free tables (`id`, `number`, `seats`, `areaId`, `areaName`, empty when none is free), without online quota and online block. `durationMinutes` is optional.
  - `POST /api/staff/reservations`: body `{ "date", "time", "guests", "tableId", "durationMinutes", "name", "phone", "email", "notes", "language" }`, e.g. for a phone reservation. Always `Confirmed`, source `Staff`. Without `tableId` the system assigns a table; `durationMinutes` (15–480 in steps of 15) overrides the restaurant's duration; the name is required, phone and email are optional; without `language` the language of the restaurant's country (`de` for Germany and Austria, `sr-Latn` for Serbia, otherwise `en`). Returns 201 with the reservation as in the list.
  - `PUT /api/staff/reservations/{id}`: same body; changes date, time, party size, table, duration, contact and notes with the same checks, without colliding with itself. Without `durationMinutes` the restaurant's duration for the party size applies again, without `language` the stored one stays. A start that is not changed may lie in the past, so a running reservation can still be changed.
  - `POST /api/staff/reservations/{id}/status`: body `{ "status" }`. Returns the reservation.
  - Errors: 400 `invalid_date`, `invalid_time`, `invalid_party_size`, `invalid_duration`, `invalid_name`, `invalid_phone`, `invalid_email`, `invalid_notes`, `invalid_language`, `outside_opening_hours`, `in_the_past`, `invalid_status`; 409 `slot_unavailable`, `table_unavailable`, `invalid_status_transition`.

All `/api/admin` endpoints require the `RequireTenantAdmin` policy. Failed validations answer with an error code, e.g. 400 `{ "error": "overlapping_periods" }` or 409 `{ "error": "table_number_taken" }`; the web frontend translates it.

### Reservation rules

The server enforces these rules for every channel; the constants are in `Reservations/ReservationRules.cs`, the availability in `Reservations/AvailabilityService.cs`.

- **Times:** a reservation's start and end are stored in the restaurant's local time (`Tenant.TimeZoneId`), like the opening hours. "Now" and "today" are always taken in that time zone. A restaurant without location has no time zone and cannot be booked.
- **Start times:** every quarter hour (:00, :15, :30, :45) within an opening window of the day. The reservation has to end by the end of the window: last start = end of the window − duration (`MustEndByClosingTime`; default still to be confirmed by the CEO). No reservations over midnight.
- **Not in the past.** Online at most 90 days ahead (`MaxOnlineDaysAhead`); staff have no limit.
- **Duration:** online the restaurant's duration for the party size (`IReservationDurationPolicy`); staff can override it per reservation.
- **Free table:** no reservation in a blocking status overlaps `[start, end)`. Blocking: `Requested`, `Confirmed`, `Arrived`, `Late`; not blocking: `Cancelled`, `Declined`. Requests block their table (`RequestsBlockTables`; default still to be confirmed by the CEO).
- **Online only:**
  - only areas open for online booking;
  - online quota per area: the seats (table seats) of all online reservations in the area that overlap the time, plus the new table, must not exceed floor(seats of the area × percent / 100);
  - the party size must not exceed the largest table that can be booked online (`maxOnlinePartySize`); larger parties have to call.
- **Staff:** the online quota and the online block do not apply; the opening hours do.
- **Table assignment by the system:** the smallest free table with at least as many seats as guests; for equal sizes the order of the areas, then the table number. When the guest chooses, every free table with enough seats is offered, also much larger ones (no upper limit yet).
- **No double bookings:** check and insert run in one transaction (SQLite `BEGIN IMMEDIATE`); of two simultaneous bookings of the last table one gets 409 `slot_unavailable`.
- **Guest:** a name (at most 100 characters) plus a phone number **or** an email address online; staff only need the name. Notes at most 500 characters. Every reservation gets a reference code of 6 characters without the easily confused 0/O and 1/I/L, unique across all restaurants.
- **Status changes:** `Requested` → `Confirmed` | `Declined`; `Confirmed` → `Arrived` | `Late` | `Cancelled`; `Late` → `Arrived` | `Cancelled`; `Arrived` → `Confirmed` (undo). Every other change is 409 `invalid_status_transition`.

The public endpoints find the restaurant by its slug and set it as the tenant of the request (`Auth/TenantScope.cs`); `HttpTenantContext` prefers it to the tenant of the signed-in user. So the query filters, `IOpeningCalendar` and `IReservationDurationPolicy` work for guests, too.

### Demo reservations

In Development, every start adds demo reservations from today to today + 7 days for every restaurant that has tables, a location and opening hours, but no reservations from today on; where the tables come from does not matter. 30–60 % of the tables are booked at the peak times (12:00–13:00 and 18:00–20:00, or the whole opening window if it has neither) with names and phone numbers or email addresses of the restaurant's country. Today's reservations that have started are mostly `Arrived`, some `Late` or `Cancelled`; in a restaurant with the request mode some online reservations are `Requested`. To get new ones, delete the database or the reservations from today on.

Uploaded floor plans are stored in the folder `Uploads:Path` of `appsettings.json`, relative to `api/Cbplayground.Api` (default `data/uploads`, ignored by git).

### Backups

Outside Development, the API backs up the database once a day at `Backup:TimeOfDay` (default `03:00`, local server time). Each backup is one zip file in `Backup:Path` (default `data/backups`, relative to `api/Cbplayground.Api`, ignored by git), named after its time, e.g. `cbplayground-20261031-030000.zip`. It contains the database file, copied consistently with the SQLite online backup while the API keeps running, and the uploaded floor plans in `uploads/`. Backups older than `Backup:RetentionDays` (default 30) are deleted after each run. If the newest backup is more than a day old when the API starts, for example because the API was down at the scheduled time, it backs up right away. A failed backup is logged as an error; the API keeps running.

`Backup:Enabled` switches the backups on (`appsettings.json`) or off (`appsettings.Development.json`). To try them locally: `dotnet run -- --Backup:Enabled=true`.

The backups lie on the same disk as the database. To survive the loss of the server, `Backup:Path` should be on another disk or be copied off the server regularly; that is part of the server setup, not of this repository.

Restore a backup:

1. Stop the API.
2. Unzip the backup.
3. Replace the database file (the `Data Source` of the connection string) with the database file from the zip, and delete the `-wal` and `-shm` files next to it if there are any.
4. Replace the contents of the `Uploads:Path` folder with the `uploads/` folder from the zip.
5. Start the API.

There is no registration endpoint: staff users are created by a Tenant Admin (staff management, `/admin/staff`) or by the development seed.

### Sign-in, roles and tenants

Staff users sign in with ASP.NET Core Identity. The sign-in cookie is HttpOnly and SameSite=Strict, and Secure outside Development. API calls without sign-in get 401, calls without the required role get 403; the API never redirects to a login page.

Every user has exactly one role:

| Role | Tenant | Policy |
| --- | --- | --- |
| `Superadmin` | none | |
| `TenantAdmin` | one restaurant | `RequireTenantAdmin`, `RequireStaff` |
| `FrontDesk` | one restaurant | `RequireStaff` |

Deactivated users (`IsActive = false`) cannot sign in. The security stamp is checked on every request, so deactivating a user or setting their password ends their sessions on their next request, and a role change applies right away. After 5 failed sign-in attempts an account is locked for 5 minutes.

Tenant isolation: an entity that belongs to a restaurant implements `ITenantOwned` (a `Guid TenantId`). `AppDbContext` then filters every query on it by the signed-in user's restaurant and sets `TenantId` on new entities when saving. Creating, changing or deleting data of another restaurant throws an exception, and without a restaurant (nobody signed in, or the Superadmin) these queries return nothing. `IgnoreQueryFilters()` is reserved for Superadmin cases and has to be justified in the pull request.

Demo users, created in Development only (from `Seed:Users` in `appsettings.Development.json`). The password of all of them is `Demo1234!`:

| Email | Role | Restaurant |
| --- | --- | --- |
| `superadmin@cbplayground.local` | Superadmin | none |
| `admin@zur-linde.local` | TenantAdmin | Gasthaus zur Linde |
| `frontdesk@zur-linde.local` | FrontDesk | Gasthaus zur Linde |
| `admin@kafana-dunav.local` | TenantAdmin | Kafana Dunav |
| `frontdesk@kafana-dunav.local` | FrontDesk | Kafana Dunav |

### Opening hours and public holidays

`IOpeningCalendar.GetOpenPeriodsAsync(date)` answers when the signed-in user's restaurant is open on a date: the windows of that day of the week, or none if the date is a public holiday on which the restaurant is closed. Public holidays are closed by default (`OpeningCalendar.HolidaysOpenByDefault`); a Tenant Admin can open single holidays, which then have the regular hours of their day of the week.

`HolidayProvider` calculates the public holidays offline from rules (no library, no licence). It follows the holiday laws in force in 2026 and applies them to every year; earlier changes are not modelled. The web frontend translates the holiday names (`openingHours.holidayNames` in the locale files).

- **Germany:** the nine nationwide holidays plus the holidays of the selected federal state (Epiphany, International Women's Day, Easter Sunday and Whit Sunday in Brandenburg and Hesse, Corpus Christi, Assumption Day, World Children's Day, Reformation Day, All Saints' Day, Day of Repentance and Prayer).
- **Austria:** the 13 nationwide public holidays.
- **Serbia:** New Year (1–2 January), Orthodox Christmas (7 January), Statehood Day (15–16 February), Orthodox Easter from Good Friday to Easter Monday (Julian calendar), Labour Day (1–2 May) and Armistice Day (11 November).

Not decided yet, so handled as follows:

- Assumption Day in Bavaria applies only in municipalities with a predominantly Catholic population; it is included for all of Bavaria.
- Holidays of single municipalities are not included: Augsburger Friedensfest (8 August, city of Augsburg), Corpus Christi in parts of Saxony (Sorbian area) and Thuringia (Eichsfeld).
- Easter Sunday and Whit Sunday are included only where the state law lists them (Brandenburg, Hesse), not for Austria.
- Austria: Good Friday (no public holiday since 2019), the patron saints' days of the federal states, 24 and 31 December are not included.
- Serbia: the rule that a state holiday falling on a Sunday makes the next working day free is not applied; the holidays of other religious communities (only for their members) are not included.

### Run the tests

```sh
cd api
dotnet test
```

The tests need no running API and no Docker: they start the API in memory against a temporary SQLite file and a temporary uploads folder, and cover sign-in, sign-out, `me`, the 401/403 answers, the tenant isolation, the staff management, areas, tables and floor plan uploads, the public holidays, the opening calendar, the opening hours endpoints, the reservation settings with their duration rules, the database backups, and the reservations: availability, online quota, table assignment, the guest booking per slug, the staff endpoints, status changes, concurrent bookings of the last table, the rate limit, deleting tables with reservations and the demo reservations.

### Run the web frontend

In a second terminal:

```sh
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The Vite dev server forwards `/api` to the API on http://localhost:5025, so the API must be running.

Routes: `/` lists the restaurants, `/r/<slug>` is a restaurant's page (the guest booking will go there), `/login` is the staff sign-in, `/admin` is the admin area (Tenant Admins only) and `/frontdesk` the front desk (Tenant Admins and Front desk users). Under `/admin/areas` a Tenant Admin manages the areas, uploads their floor plans, places the tables on them by drag and drop (mouse and touch) and sets the online quota per area. Without sign-in, `/admin` and `/frontdesk` lead to `/login` and back to the requested page afterwards; a user without access to an area is sent to their own area. After signing in, a Tenant Admin lands on `/admin`, a Front desk user on `/frontdesk`; there is no Superadmin UI yet, so the Superadmin lands on `/`.

Before committing, run `npm run lint` (oxlint plus the translation key check) and `npm run build` (typecheck and production build).

### Translations

The UI texts live in `web/src/i18n/locales/`, one file per language: `en.json`, `de.json`, `sr-Latn.json` and `sr-Cyrl.json`. Code never contains visible text; it uses keys such as `t('home.title')`. `en.json` is the reference: the keys used in code are typed after it, so an unknown key fails the typecheck.

Add a key:

1. Add the key with its text to all four files. Serbian Cyrillic is maintained by hand, not transliterated from the Latin file.
2. Use it in a component with `const { t } = useTranslation()` and `t('section.key')`.
3. Run `npm run lint`. It reports every key that is missing in a file or not present in `en.json`.

Add a language:

1. Create `web/src/i18n/locales/<code>.json` with all keys of `en.json`, and add the language's name under `language.names` in every file.
2. In `web/src/i18n/index.ts`, import the file, add the code to `languages` and `resources`, and map it to a dayjs locale in `dayjsLocales` (import that locale from `dayjs/locale/` as well).
3. If the browser reports the language differently, extend `browserLanguage()` in the same file.

### Add a database migration

The EF Core command-line tool `dotnet-ef` is pinned in the local tool manifest `api/dotnet-tools.json`:

```sh
cd api
dotnet tool restore
cd Cbplayground.Api
dotnet ef migrations add <MigrationName>
```

The new migration is applied on the next start of the API.
