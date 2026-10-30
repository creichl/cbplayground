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
│   └── Cbplayground.Api/
│       ├── Data/                 # AppDbContext and entities
│       ├── Endpoints/            # endpoint groups, one file per area
│       └── Migrations/           # EF Core migrations
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

The API listens on http://localhost:5025. In the Development environment (the default for `dotnet run`), it creates the SQLite database `api/Cbplayground.Api/data/cbplayground.db` on startup, applies all migrations and adds two demo restaurants if there are none yet. The connection string is in `appsettings.json`.

Endpoints:

- `GET /api/health`
- `GET /api/tenants`: all restaurants, sorted by name

### Run the web frontend

In a second terminal:

```sh
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The Vite dev server forwards `/api` to the API on http://localhost:5025, so the API must be running.

Routes: `/` lists the restaurants, `/r/<slug>` is a restaurant's page (the guest booking will go there), `/admin` is the admin area and `/frontdesk` the front desk.

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
