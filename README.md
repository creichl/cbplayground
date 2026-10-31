# cbplayground

cbplayground is a small multi-tenant platform for restaurant table reservations. Each restaurant (Gasthaus) is its own tenant: it describes its areas, floor plans, tables and opening hours, and decides how reservations are confirmed and how tables are assigned. Guests book a table online without an account, either on the platform's booking page or through an iframe embedded in the restaurant's own website. Restaurant staff enter phone reservations, track today's guests at the front desk and keep an overview of all tables. Every user interface is available in English, German, Serbian Latin and Serbian Cyrillic.

This README describes the full product vision.

## Roles & permissions

| Role | Who | Permissions |
| --- | --- | --- |
| **Superadmin** | Platform operator | Manages tenants (restaurants): creates, renames, deactivates and activates them and sets up their Tenant Admins. Restaurants are never deleted, only deactivated. |
| **Tenant Admin** | Restaurant owner or manager | Configures areas, floor plans, tables, opening hours, reservation settings and staff users. Enters reservations on a guest's behalf (e.g. phone reservations). |
| **Front desk** | Restaurant staff | Fewer permissions than the Tenant Admin, possibly with its own simplified view. Sets the reservation status (arrived, late, no-show, guest left, cancelled, with undo), enters phone reservations and seats walk-ins. |
| **Guest** | Restaurant visitor | Has no account. Gives a name plus a phone number **or** an email address when booking. |

## Features

### Areas & floor plans

- A restaurant has one or more areas, for example a dining room and a terrace.
- Each area has its own uploaded floor plan image.
- A restaurant may also use a single area with a single floor plan; that is the restaurant's choice.

### Table placement

- Tables are placed on an area's floor plan.
- Each table has attributes such as its number, its position on the plan, its seat count (number of guests), its shape (round, square, rectangular) and its rotation (0° or 90°).
- An area without uploaded floor plan image is drawn as a schematic plan from its tables; the system arranges the tables, the restaurant may move them afterwards and have them arranged anew (see [Schematic floor plan](#schematic-floor-plan)).

### Opening hours & holidays

- Each restaurant defines its regular opening hours.
- Public holidays are applied automatically. The restaurant selects its country and region.
- Closing days and periods (e.g. company holidays, a private party) and special opening hours on single days (e.g. New Year's Eve 18:00–24:00).
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

- The status of today's reservations: arrived, late, no-show, guest left, cancelled; walk-ins without a reservation.
- The table overview.

### Embedding

- Restaurants embed the guest booking UI into their own website with an **iframe** snippet.
- `/embed/<slug>` runs the same booking as `/r/<slug>`, without the platform header, the restaurant's details and outer spacing, with a small language choice and a discreet "Powered by cbplayground" link. `?lang=de|en|sr-Latn|sr-Cyrl` sets the language. An unknown restaurant shows a short message, a restaurant that cannot be booked online the hint with its phone number.
- Under `/admin/embed` ("Website embed") a Tenant Admin chooses the language, copies the snippet and sees a live preview (a real iframe; bookings made there are real) and the direct link to the booking page. The base URL is the address the admin page is opened at (`window.location.origin`).
- The snippet is the iframe plus a short script. The embed sends `postMessage({ type: 'cbplayground:height', height })` to the page around it whenever its height changes, and the script sets the iframe's height to it. Without the script, the iframe is 720 px high and scrolls on its own. Example for Gasthaus zur Linde:

  ```html
  <iframe id="cbplayground-zur-linde" src="https://<platform>/embed/zur-linde?lang=de" title="Tisch reservieren – Gasthaus zur Linde" style="width: 100%; height: 720px; border: 0;"></iframe>
  <script>
    window.addEventListener('message', function (event) {
      var frame = document.getElementById('cbplayground-zur-linde');
      if (frame && event.source === frame.contentWindow && event.origin === 'https://<platform>' &&
          event.data && event.data.type === 'cbplayground:height' && typeof event.data.height === 'number') {
        frame.style.height = event.data.height + 'px';
      }
    });
  </script>
  ```

- Any website may embed the booking. The server has to send these headers (the Vite dev and preview servers already do; the production server is not set up yet):
  - `/embed/*`: `Content-Security-Policy: frame-ancestors *`
  - all other pages: `Content-Security-Policy: frame-ancestors 'self'`
- The embed only uses the public endpoints and needs no cookies, so it also works in an iframe on another domain, where the SameSite=Strict sign-in cookie is not sent. A language chosen in the embed stays in its address (`?lang=`) and is not stored, so the language of the platform in the same browser stays as it is.

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
│   │   │   └── SeedAssets/       # floor plans of the demo restaurants (development seed)
│   │   ├── Endpoints/            # endpoint groups, one file per area
│   │   ├── FloorPlans/           # schematic floor plan: table sizes and automatic arrangement
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

The API listens on http://localhost:5025. In every environment it creates the SQLite database `api/Cbplayground.Api/data/cbplayground.db` (and its folder) on startup and applies all migrations. In the Development environment (the default for `dotnet run`), it also sets up the two demo restaurants (see [Demo data](#demo-data)), creates the demo staff users (see below) that do not exist yet and adds demo reservations (see [Demo reservations](#demo-reservations)). The connection string is in `appsettings.json`.

#### Demo data

In Development only, `DevelopmentSeed.SeedRestaurantsAsync` creates the demo restaurants that do not exist yet (by slug) and completes their setup, so both are ready to try right after the first start:

| | Gasthaus zur Linde (`zur-linde`) | Kafana Dunav (`kafana-dunav`) |
| --- | --- | --- |
| Location | Germany, Bavaria (`DE-BY`) | Serbia (`RS`) |
| Profile | Address in Munich, phone, email, website, description | Address in Novi Sad, phone, email, website, description |
| Opening hours | Tuesday to Sunday 11:30–14:30 and 17:30–22:00, closed on Mondays | Every day 12:00–24:00 |
| Areas | "Gaststube" (10 tables, 2–8 seats) and "Terrasse" (6 tables, online quota 50 %) | "Sala" (12 tables, 2–8 seats) and "Bašta" (6 tables, 2–8 seats, no floor plan image) |
| Reservation settings | Instant confirmation, the system assigns tables, 1–2 guests 90 minutes, 3–6 guests 120 minutes | Request, the guest picks the table, 120 minutes |

So both confirmation modes and both table selection modes can be shown. The floor plans are PNG files in `api/Cbplayground.Api/Data/SeedAssets/`; the seed copies them into `Uploads:Path` under a new file name, as an upload would, and places the tables in the drawn rooms. The tables have shapes that fit the rooms (square, rectangular for 6 and 8 seats, round ones on the terrace and a few elsewhere; Sala's table 4 is turned by 90°). The three areas with a floor plan image have a table scale of 80 %: at 100 % the drawn tables are large for these rooms, and some come too close to each other. "Bašta" has no floor plan image and a table scale of 100 %; its tables (round, square and rectangular) are arranged by `TableLayout`, so it shows the schematic floor plan.

The seed is idempotent and never overwrites what an admin maintained. For each restaurant it only adds a part the restaurant has nothing of yet:

- the location, if no country is set;
- the profile, if all profile fields are empty;
- the opening hours, if there are none;
- the areas with their floor plans and tables, if there are no areas (an area without tables gets none);
- the reservation settings with their duration rules and booking rules, closing days and special hours with their precedence, if they were never saved.

A second start therefore adds nothing, and an existing database whose restaurants lack, for example, areas or opening hours is completed on the next start. Because areas are only added to a restaurant without areas, an existing development database does not get "Bašta"; it only appears after deleting the development database. To start from scratch, stop the API and delete `data/cbplayground.db` and `data/uploads/`. Outside Development nothing of this is created; there the Superadmin creates the restaurants and their first admins under `/superadmin` (see [Superadmin](#superadmin)). The migrations do not create a Superadmin user: outside Development it has to be added to the database once by hand.

Endpoints:

- `GET /api/health`: 200 `{ "status": "ok" }` when the database can be reached, otherwise 503 `{ "error": "unhealthy" }`.
- `GET /api/tenants`: all active restaurants, sorted by name: `id`, `name`, `slug`, and `city` and `description` from the profile (`null` when empty). Deactivated restaurants are left out.
- `POST /api/auth/login`: body `{ "email", "password" }`. Signs in with a cookie and returns the same user as `me`. On failure: 401 with `{ "error": "invalid_credentials" | "locked_out" | "deactivated" | "restaurant_deactivated" }` (`deactivated`: the user, `restaurant_deactivated`: the user's restaurant); 429 `too_many_requests` after 10 attempts from the same client IP within a minute (`RateLimiting:Login:PermitLimit`).
- `POST /api/auth/logout`: signs out (204).
- `GET /api/auth/me`: the signed-in user: `id`, `email`, `displayName`, `role`, `tenant { id, name, slug }` (`null` for the Superadmin); 401 without sign-in.
- Restaurant management, Superadmin only (`RequireSuperadmin` policy; Tenant Admins and Front desk users get 403). Unknown restaurant ids are 404:
  - `GET /api/superadmin/tenants`: all restaurants, active or not, sorted by name: `id`, `name`, `slug`, `countryCode`, `regionCode`, `isActive`, `createdAt` (UTC), `adminCount` (active Tenant Admins), `tableCount` and `upcomingReservationCount` (reservations that start from now on in the restaurant's time zone and are not cancelled or declined).
  - `POST /api/superadmin/tenants`: body `{ "name", "slug", "countryCode", "regionCode" }`; country and region are optional and checked as in `PUT /api/admin/location`, the time zone follows from the country. Returns 201 with the restaurant as in the list. A new restaurant is active and has nothing set up.
  - `PUT /api/superadmin/tenants/{id}`: body `{ "name", "slug" }`. Returns the restaurant. A new slug changes the address of the booking page (`/r/<slug>`) and of embedded booking widgets.
  - `POST /api/superadmin/tenants/{id}/deactivate` and `/activate`. Return the restaurant. A deactivated restaurant is missing from `GET /api/tenants`, all `/api/public/restaurants/{slug}/...` endpoints answer 404, its staff cannot sign in (`restaurant_deactivated`), and their existing sessions end on their next request (deactivating renews their security stamps). No data is deleted; activating undoes all of it.
  - `GET /api/superadmin/tenants/{id}/admins`: the restaurant's Tenant Admins, active or not: `id`, `email`, `displayName`, `isActive`, sorted by name.
  - `POST /api/superadmin/tenants/{id}/admins`: body `{ "email", "displayName", "password" }` with the start password. Creates a Tenant Admin of the restaurant and returns 201 with them. Further staff are then created by that admin.
  - `POST /api/superadmin/tenants/{id}/admins/{userId}/password`: body `{ "password" }`. Sets a new password (204) and ends the admin's sessions. Only for Tenant Admins of this restaurant, other users are 404.
  - Name: 1–100 characters (trimmed). Slug: at most 50 characters, lowercase letters `a-z`, digits and single hyphens, not at the start or end (e.g. `zur-linde`); it is trimmed and lowercased first and unique across all restaurants.
  - Errors: 400 with `{ "error": "invalid_name" | "invalid_slug" | "invalid_country" | "region_required" | "invalid_region" | "region_not_allowed" | "invalid_email" | "password_too_weak" }`, 409 with `{ "error": "slug_taken" | "email_taken" }`.
- `GET /api/admin/tenant`: the restaurant of the signed-in Tenant Admin.
- `GET /api/admin/profile`: the profile of the Tenant Admin's restaurant, which guests will see: `street`, `postalCode`, `city`, `phone`, `email`, `website`, `description`. Every field is optional and `null` when empty.
- `PUT /api/admin/profile`: saves the profile, same body as `GET`, and returns it. Values are trimmed, empty values are stored as `null`. Maximum lengths: street 200, postal code 10, city 100, phone 30, email 254, website 200, description 500 characters. The email needs the form `name@domain.tld`, the website must be an absolute `http` or `https` URL. On failure: 400 with `{ "error": "invalid_street" | "invalid_postal_code" | "invalid_city" | "invalid_phone" | "invalid_email" | "invalid_website" | "invalid_description" }`.
- `GET /api/admin/setup-status`: which steps of the restaurant's setup are done, each `true` or `false`:
  - `profile`: street, postal code, city and phone are filled in;
  - `location`: the country is set;
  - `openingHours`: at least one opening period;
  - `floorPlan`: at least one area with a floor plan;
  - `tables`: at least one table;
  - `reservationSettings`: the reservation settings have been saved once.
- Staff management, Tenant Admins only, always for the signed-in admin's own restaurant (users of other restaurants get 404):
  - `GET /api/admin/staff`: the restaurant's users: `id`, `email`, `displayName`, `role`, `isActive`, sorted by name.
  - `POST /api/admin/staff`: body `{ "email", "displayName", "role", "password" }` with the role `TenantAdmin` or `FrontDesk` and the start password. Returns 201 with the new user.
  - `PUT /api/admin/staff/{id}`: body `{ "displayName", "role" }`. Returns the user.
  - `POST /api/admin/staff/{id}/deactivate` and `/activate`. Return the user.
  - `POST /api/admin/staff/{id}/password`: body `{ "password" }`. Sets a new password (204) and ends the user's other sessions.
  - Errors: 400 with `{ "error": "invalid_email" | "invalid_name" | "invalid_role" | "password_too_weak" }`, 409 with `{ "error": "email_taken" | "last_admin" | "cannot_deactivate_self" }`. The last active Tenant Admin of a restaurant cannot be deactivated or given another role, and nobody can deactivate themselves.
- Areas (Tenant Admins only):
  - `GET /api/admin/areas`: the restaurant's areas in their order: `id`, `name`, `sortOrder`, `floorPlanUrl` (`null` without floor plan), `onlineBookingEnabled`, `onlineCapacityPercent`, `tableScale`.
  - `POST /api/admin/areas`: body `{ "name" }`. A new area comes last, is open for online booking, has an online quota of 100 % and a table scale of 100 %.
  - `PUT /api/admin/areas/{id}`: body `{ "name", "onlineBookingEnabled", "onlineCapacityPercent", "tableScale" }`. `onlineCapacityPercent` 0–100 (otherwise 400 `online_capacity_percent_invalid`). `tableScale` is optional, whole percent from 50 to 200 (otherwise 400 `table_scale_invalid`); without it the stored value stays. It scales the drawn tables of this area, so they match an uploaded floor plan.
  - `POST /api/admin/areas/{id}/arrange-tables`: arranges all tables of the area anew with `TableLayout` (see [Schematic floor plan](#schematic-floor-plan)), also in an area with a floor plan image, and returns the area's tables as `GET /api/admin/tables` lists them. Unknown area or one of another restaurant: 404.
  - `DELETE /api/admin/areas/{id}`: deletes the area with its tables and its floor plan image. 409 `table_has_reservations` while one of its tables has a reservation that has not ended yet (see below).
  - `PUT /api/admin/areas/order`: body `{ "areaIds": [...] }` with every area of the restaurant once, in the new order.
  - `PUT /api/admin/areas/{id}/floorplan`: the body is the image itself (PNG, JPEG or WebP, at most 10 MB). The type is detected from the content; the file name is chosen by the server. Replaces an existing floor plan.
- `GET /api/areas/{id}/floorplan`: the floor plan image of an area. Public, because guests will see it to pick a table.
- Tables (Tenant Admins only):
  - `GET /api/admin/tables`: all tables of the restaurant: `id`, `areaId`, `number`, `seats`, `posX`, `posY`, `shape`, `rotation`. The position is the table's centre relative to the floor plan, from 0 to 1 (see [Schematic floor plan](#schematic-floor-plan) for an area without image). `shape` is `Round`, `Square` or `Rectangle`, never `null`; `rotation` is `0` or `90` (degrees), stored for every table but only visible on rectangular ones.
  - `POST /api/admin/tables`: body `{ "areaId", "number", "seats", "shape", "rotation" }`; `shape` and `rotation` are optional. Without `shape` a table with 1–4 seats is `Square`, from 5 seats `Rectangle`; without `rotation` 0. In an area with floor plan image the table is placed in the middle of the image, in an area without one on the first free place of the arrangement, so it does not overlap another table.
  - `PUT /api/admin/tables/{id}`: body `{ "number", "seats", "shape", "rotation" }`. Without `shape` or `rotation` the stored values stay; changing the seats does not change the shape.
  - `DELETE /api/admin/tables/{id}`. 409 `table_has_reservations` while the table has a reservation in the status `Requested`, `Confirmed`, `Arrived` or `Late` that has not ended yet. Its other reservations (past ones, cancelled and declined ones) are deleted together with the table: a reservation always keeps its table (the foreign key is `Restrict`), so the reservations that no longer matter are removed first, in the same transaction.
  - `PUT /api/admin/tables/positions`: body `[{ "id", "posX", "posY" }, ...]`. Saves the positions of several tables at once, all or none.
  - The table number (at most 20 characters) is unique within the restaurant, a table has at least 1 seat. Errors: 400 `table_number_invalid`, `seats_invalid`, `shape_invalid` (not `Round`, `Square` or `Rectangle`), `rotation_invalid` (not 0 or 90), `position_invalid`; 409 `table_number_taken`.
- `GET /api/admin/opening-hours`: the regular opening hours of the whole week, `{ "periods": [{ "dayOfWeek", "start", "end" }] }`. `dayOfWeek` is 0 (Sunday) to 6 (Saturday), times are `HH:mm`, the end may be `24:00`.
- `PUT /api/admin/opening-hours`: replaces the whole week (same body, 204). Errors: `invalid_day`, `invalid_time`, `start_not_before_end`, `overlapping_periods`.
- `GET /api/admin/location`: `countryCode` (`DE`, `AT`, `RS`), `regionCode` (federal state for Germany, e.g. `DE-BY`, otherwise `null`) and `timeZoneId` (derived from the country); all `null` until set.
- `PUT /api/admin/location`: body `{ "countryCode", "regionCode" }`. Errors: `invalid_country`, `region_required`, `invalid_region`, `region_not_allowed`.
- `GET /api/admin/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD`: the public holidays of the restaurant's location, one entry per day: `date`, `keys` (holiday names as translation keys, e.g. `corpusChristi`) and `isOpen`. Without `from`/`to`: the next 12 months, starting today in the restaurant's time zone; at most 2 years (`invalid_range`). Empty without a location.
- `PUT /api/admin/holidays/{date}`: body `{ "isOpen" }` opens or closes the restaurant on that holiday (204); `not_a_holiday` for other days.
- Closing days and special hours (see [Opening hours and public holidays](#opening-hours-and-public-holidays)):
  - `GET /api/admin/special-days`: the entries that have not ended yet (today in the restaurant's time zone; all of them without location), sorted by start: `id`, `from`, `to` (`YYYY-MM-DD`, both inclusive), `kind` (`Closed` | `SpecialHours`), `note` (`null` when empty) and `periods` (`[{ "start", "end" }]`, `HH:mm`, the end may be `24:00`; empty for `Closed`).
  - `POST /api/admin/special-days`: body `{ "from", "to", "kind", "note", "periods" }`. Returns 201 with `{ "specialDay", "affectedCount", "affectedReservations" }`.
  - `PUT /api/admin/special-days/{id}`: same body and answer (200); replaces the periods.
  - `DELETE /api/admin/special-days/{id}` (204).
  - `affectedReservations` are the reservations in a blocking status that have not ended yet and lie on the entry's days: on closing days all of them, with special hours those that do not fit into one of the windows. Each has `id`, `referenceCode`, `date`, `time`, `guests`, `name`, `tableNumber` and `status`. They are **not** changed; cancelling them and informing the guests is up to the restaurant.
  - Rules: `from` ≤ `to`, at most 366 days, the note at most 100 characters (trimmed, empty is `null`), special hours need at least one window with the same rules as the opening hours, a closing day ignores the periods, and two entries of a restaurant must not overlap. Errors: 400 `invalid_date`, `from_after_to`, `range_too_long`, `invalid_kind`, `invalid_note`, `periods_required`, `invalid_time`, `start_not_before_end`, `overlapping_periods`; 409 `overlapping_special_days`. Entries of other restaurants are 404.
- `GET /api/admin/reservation-settings`: the reservation settings of the Tenant Admin's restaurant: `confirmationMode` (`Instant` | `Request`), `tableSelectionMode` (`GuestChooses` | `SystemAssigns`), `defaultDurationMinutes`, `durationRules` (`minGuests`, `maxGuests`, `durationMinutes`, sorted by `minGuests`) and the booking rules (see [Reservation rules](#reservation-rules)): `minLeadTimeMinutes`, `bookingHorizonDays`, `bufferMinutes` and `maxOnlinePartySize` (`null`: the largest table that can be booked online). A restaurant that has not saved any settings gets the defaults: instant confirmation, the system assigns tables, 120 minutes, no rules, 60 minutes lead time (still to be confirmed by the CEO; the defaults are in `Data/ReservationSettings.cs`), 90 days ahead, no buffer, no own limit for the party size.
- `PUT /api/admin/reservation-settings`: saves the settings and replaces all duration rules, same body as `GET`; booking rules left out of the body get their defaults. Durations are 15 to 480 minutes in steps of 15; a rule needs `minGuests` ≥ 1 and `minGuests` ≤ `maxGuests`, and rules must not overlap (gaps are allowed, the default duration applies there). The lead time is 0 to 1440 minutes, the booking horizon 1 to 365 days, the buffer 0 to 60 minutes in steps of 5, the largest online party empty or at least 1. On failure: 400 with `{ "error": "invalid_mode" | "invalid_duration" | "invalid_min_guests" | "min_greater_than_max" | "overlapping_rules" | "invalid_lead_time" | "invalid_booking_horizon" | "invalid_buffer" | "invalid_max_party_size" }`.

`IReservationDurationPolicy.GetDurationAsync(guests)` returns the duration of a reservation for the current restaurant: the duration of the rule that contains the party size, otherwise the default duration.

- Guest booking, without sign-in. The restaurant comes from the slug in the URL (unknown slug or deactivated restaurant: 404) and is the tenant of the request, also when a user of another restaurant is signed in. `calendar`, `availability` and `tables` share a limit of 120 calls per client IP and minute (`RateLimiting:PublicReads:PermitLimit`), then 429 `too_many_requests`:
  - `GET /api/public/restaurants/{slug}`: `name`, the profile (`street`, `postalCode`, `city`, `phone`, `email`, `website`, `description`, each `null` when empty), `timeZoneId`, `confirmationMode`, `tableSelectionMode`, `maxOnlinePartySize` (seats of the largest table that can be booked online, 0 if none, at most the restaurant's own limit), `bookingHorizonDays`, `openingHours` (the week, as in `GET /api/admin/opening-hours`) and `bookable` (false without location, opening hours or tables that can be booked online).
  - `GET /api/public/restaurants/{slug}/calendar?month=YYYY-MM&guests=N`: one entry per day of the month, `{ "date", "status" }` with `closed` (closed, also on closing days, in the past or beyond the booking horizon), `full` or `available`, for the date picker. Errors: `invalid_month`, `invalid_party_size`.
  - `GET /api/public/restaurants/{slug}/availability?date=YYYY-MM-DD&guests=N`: `date`, `guests`, `durationMinutes` and `periods`: per opening window `{ "start", "end", "times": [{ "time", "available" }] }`. No periods on closing days and closed public holidays; on days with special hours exactly these windows.
  - `GET /api/public/restaurants/{slug}/tables?date=YYYY-MM-DD&time=HH:mm&guests=N`: only when the guest chooses the table (otherwise 400 `table_selection_disabled`). The areas open for online booking in their order, `{ "id", "name", "floorPlanUrl", "tableScale", "tables": [{ "id", "number", "seats", "posX", "posY", "shape", "rotation", "available" }] }`. `available` considers size, other reservations, the online quota and the opening hours.
  - `POST /api/public/restaurants/{slug}/reservations`: body `{ "date", "time", "guests", "tableId", "name", "phone", "email", "notes", "language" }`. `tableId` is required when the guest chooses the table and ignored when the system assigns it; `phone` or `email` is required; `language` is `en`, `de`, `sr-Latn` or `sr-Cyrl`. Returns 201 with `referenceCode`, `status` (`Confirmed` in the instant mode, `Requested` in the request mode), `date`, `time`, `guests`, `durationMinutes`, `area`, `tableNumber` and `manageToken`, the token of the guest's link to view and cancel the reservation (32 random bytes, URL-safe Base64). Only its SHA-256 is stored (`Reservation.ManageTokenHash`), so it is returned only here. Errors: 400 `invalid_date`, `invalid_time`, `invalid_party_size`, `invalid_name`, `contact_required`, `invalid_phone`, `invalid_email`, `invalid_notes`, `invalid_language`, `table_required`, `outside_opening_hours`, `too_short_notice` (within the lead time), `too_far_ahead`, `in_the_past`; 409 `slot_unavailable`, `table_unavailable`; 429 `too_many_requests` after 10 bookings from the same client IP within 10 minutes (`RateLimiting:PublicBookings:PermitLimit`).
  - `GET /api/public/restaurants/{slug}/reservations/{referenceCode}?token=…`: the guest's view of an online reservation: `referenceCode`, `status`, `date`, `time`, `endTime`, `guests`, `durationMinutes`, `area`, `tableNumber`, `name`, `cancelledByGuest` and `canCancel` (whether the guest can still cancel). A wrong code, a wrong token or a reservation of another restaurant are all 404, without telling which; reservations entered by staff have no token and are never found.
  - `POST /api/public/restaurants/{slug}/reservations/{referenceCode}/cancel`: body `{ "token" }`. Cancels the reservation (`Cancelled`, `cancelledByGuest` true) and returns it as above. Errors: 404 as above; 409 `cancellation_not_possible` when it is not `Requested`, `Confirmed` or `Late` or has started (see the reservation rules).
  - Both compare the token in constant time and have their own rate limit with the limit of the bookings (429 `too_many_requests` after 10 requests from the same client IP within 10 minutes).
- Reservations for the staff (Tenant Admins and Front desk users, `RequireStaff` policy), always of the signed-in user's restaurant; reservations of other restaurants are 404:
  - `GET /api/staff/floor`: the areas in their order with their tables: `id`, `name`, `sortOrder`, `floorPlanUrl`, `tableScale`, `tables` (`id`, `number`, `seats`, `posX`, `posY`, `shape`, `rotation`).
  - `GET /api/staff/reservations?from=YYYY-MM-DD&to=YYYY-MM-DD`: the reservations starting on these days (without `from`/`to`: today in the restaurant's time zone; at most 366 days, otherwise `invalid_range`), sorted by start: `id`, `referenceCode`, `date`, `time`, `endTime`, `durationMinutes`, `guests`, `status`, `source` (`Online` | `Staff` | `WalkIn`), `tableId`, `tableNumber`, `areaId`, `areaName`, `name`, `phone`, `email`, `notes`, `language`, `completedTime` (`HH:mm` when the guest left, status `Completed`; otherwise `null`), `cancelledByGuest` (the guest cancelled through the link), `createdAtUtc`, `updatedAtUtc`.
  - `GET /api/staff/availability?date=YYYY-MM-DD&guests=N&durationMinutes=M`: like the public availability, but each time lists the free tables (`id`, `number`, `seats`, `areaId`, `areaName`, empty when none is free), without online quota, online block, lead time, booking horizon and the largest online party; the buffer applies. `durationMinutes` is optional.
  - `POST /api/staff/reservations`: body `{ "date", "time", "guests", "tableId", "durationMinutes", "name", "phone", "email", "notes", "language" }`, e.g. for a phone reservation. Always `Confirmed`, source `Staff`. Without `tableId` the system assigns a table; `durationMinutes` (15–480 in steps of 15) overrides the restaurant's duration; the name is required, phone and email are optional; without `language` the language of the restaurant's country (`de` for Germany and Austria, `sr-Latn` for Serbia, otherwise `en`). Returns 201 with the reservation as in the list.
  - `PUT /api/staff/reservations/{id}`: same body; changes date, time, party size, table, duration, contact and notes with the same checks, without colliding with itself. Without `durationMinutes` the restaurant's duration for the party size applies again, without `language` the stored one stays. A start that is not changed may lie in the past, so a running reservation can still be changed. The opening hours, the availability and the table are only checked when date, time, duration, party size or table change (no `tableId` means the system assigns one, which is a change), so contact and notes can still be changed after the opening hours have changed. A walk-in whose start is kept is not checked against the opening hours again (its start is off the quarter-hour grid).
  - `POST /api/staff/reservations/{id}/status`: body `{ "status" }`. Returns the reservation. See the status changes below.
  - `GET /api/staff/walk-in-tables?guests=N`: the tables free now for a walk-in, `{ "time", "durationMinutes", "tables" }`, the suggested table first; `time` is now (to the minute), `durationMinutes` the restaurant's duration for the party size. Errors: 400 `invalid_party_size`, `outside_opening_hours` (closed now).
  - `POST /api/staff/walk-ins`: body `{ "guests", "tableId", "durationMinutes", "name", "phone", "notes" }`, a guest without a reservation. Starts now (to the minute, restaurant time zone), status `Arrived`, source `WalkIn`. Without `tableId` the system assigns a table; without `name` it is stored as `Walk-in` (the front desk shows it translated); without `durationMinutes` the restaurant's duration applies. Now has to lie within an opening window; the end may lie after closing time. The online quota does not apply. Returns 201 with the reservation as in the list. Errors: 400 `invalid_party_size`, `invalid_duration`, `invalid_name`, `invalid_phone`, `invalid_notes`, `outside_opening_hours`; 409 `slot_unavailable` (no table free), `table_unavailable`.
  - Errors: 400 `invalid_date`, `invalid_time`, `invalid_party_size`, `invalid_duration`, `invalid_name`, `invalid_phone`, `invalid_email`, `invalid_notes`, `invalid_language`, `outside_opening_hours`, `in_the_past`, `invalid_status`; 409 `slot_unavailable`, `table_unavailable`, `invalid_status_transition`, `status_not_allowed_now`.

All `/api/admin` endpoints require the `RequireTenantAdmin` policy. Failed validations answer with an error code, e.g. 400 `{ "error": "overlapping_periods" }` or 409 `{ "error": "table_number_taken" }`; the web frontend translates it.

### Reservation rules

The server enforces these rules for every channel; the constants are in `Reservations/ReservationRules.cs`, the rules each restaurant sets with their defaults in `Data/ReservationSettings.cs`, the availability in `Reservations/AvailabilityService.cs`. "Now" comes from the registered `TimeProvider`, so the tests can fix the time.

- **Times:** a reservation's start and end are stored in the restaurant's local time (`Tenant.TimeZoneId`), like the opening hours. "Now" and "today" are always taken in that time zone. A restaurant without location has no time zone and cannot be booked.
- **Start times:** every quarter hour (:00, :15, :30, :45) within an opening window of the day. The reservation has to end by the end of the window: last start = end of the window − duration (`MustEndByClosingTime`; default still to be confirmed by the CEO). No reservations over midnight.
- **Not in the past.** Online the start has to be at least the lead time from now (`MinLeadTimeMinutes`, default 60: at 18:10 the first online time is 19:15) and on at most today + `BookingHorizonDays` (default 90); staff are bound to neither.
- **Duration:** online the restaurant's duration for the party size (`IReservationDurationPolicy`); staff can override it per reservation.
- **Free table:** no reservation in a blocking status overlaps `[start, end + buffer)`, where every reservation occupies its table for `[start, end + buffer)` as well (`BufferMinutes`, default 0, for every channel): with 15 minutes buffer after 19:00–21:00, 21:00 is taken and 21:15 is free. The buffer does not count for the online quota and does not move the last start time of a window. Blocking: `Requested`, `Confirmed`, `Arrived`, `Late`; `Completed` (guest left) only until the guest left (`CompletedAtLocal`, at most until the end), the buffer follows from then on; not blocking: `Cancelled`, `Declined`, `NoShow`. Requests block their table (`RequestsBlockTables`; default still to be confirmed by the CEO).
- **Online only:**
  - only areas open for online booking;
  - online quota per area: the seats (table seats) of all online reservations in the area that overlap the time, plus the new table, must not exceed floor(seats of the area × percent / 100);
  - the party size must not exceed the largest table that can be booked online, nor `MaxOnlinePartySize` if the restaurant set one (`maxOnlinePartySize` is the smaller of both); larger parties have to call.
- **Staff:** the online quota, the online block, the lead time, the booking horizon and the largest online party do not apply; the opening hours and the buffer do.
- **Table assignment by the system:** the smallest free table with at least as many seats as guests; for equal sizes the order of the areas, then the table number. When the guest chooses, every free table with enough seats is offered, also much larger ones (no upper limit yet).
- **No double bookings:** check and insert run in one transaction (SQLite `BEGIN IMMEDIATE`); of two simultaneous bookings of the last table one gets 409 `slot_unavailable`.
- **Guest:** a name (at most 100 characters) plus a phone number **or** an email address online; staff only need the name. Notes at most 500 characters. Every reservation gets a reference code of 6 characters without the easily confused 0/O and 1/I/L, unique across all restaurants.
- **Cancellation by the guest:** through the link of an online booking, from `Requested`, `Confirmed` or `Late`, until the start of the reservation in the restaurant's local time (`GuestCancellationDeadlineBeforeStart`, zero; default still to be confirmed by the CEO). Phone reservations cannot be cancelled by the guest.
- **Status changes:** `Requested` → `Confirmed` | `Declined`; `Confirmed` → `Arrived` | `Late` | `NoShow` | `Cancelled`; `Late` → `Arrived` | `NoShow` | `Cancelled` | `Confirmed` (undo); `Arrived` → `Completed` (guest left, sets `CompletedAtLocal` to now) | `Confirmed` (undo); undos: `Completed` → `Arrived`, `NoShow` → `Confirmed`, `Cancelled` → `Confirmed`. Every other change is 409 `invalid_status_transition`.
  - `Arrived` and `Late` only on the day of the reservation, `NoShow` only from its start (restaurant time zone); otherwise 409 `status_not_allowed_now`.
  - A change back to a status that occupies the table (the undo of `Cancelled`, `NoShow` and `Completed`) needs the table to be free from the start to the original end; otherwise 409 `table_unavailable`.

The public endpoints find the restaurant by its slug and set it as the tenant of the request (`Auth/TenantScope.cs`); `HttpTenantContext` prefers it to the tenant of the signed-in user. So the query filters, `IOpeningCalendar` and `IReservationDurationPolicy` work for guests, too.

### Schematic floor plan

An area without floor plan image is drawn as a schematic plan from its tables. The rules and constants are in `api/Cbplayground.Api/FloorPlans/TableLayout.cs`; the web draws with the same constants.

- The schematic plan has the fixed aspect ratio **3:2** (width:height). Positions are the table's centre relative to the plan, 0–1 in both directions, as on an image.
- The drawn size of a table depends on its shape and seats. The sizes below are fractions of the plan **width** at a table scale of 100 %; the area's `tableScale` multiplies all of them (50–200 %):

| Shape | Width × height at 0° | Example |
| --- | --- | --- |
| `Round` | diameter 0.0175 × seats, at least 0.05 | 4 seats: 0.07, 8 seats: 0.14 |
| `Square` | side 0.0175 × seats, at least 0.05 | 2 seats: 0.05, 4 seats: 0.07 |
| `Rectangle` | long side 0.0175 × seats, at least 0.08; short side 0.06 | 6 seats: 0.105 × 0.06, 8 seats: 0.14 × 0.06 |

- At 90° a rectangular table stands upright (width and height swapped). Around every table there is room for the chairs, 0.02 of the plan width on each side (scaled as well). A height in plan widths is a fraction of the plan height × 1.5.
- **Arrangement** (`TableLayout.Arrange`, used by `POST /api/admin/areas/{id}/arrange-tables`): the tables go into rows from top left to bottom right in the order of their numbers, as `GET /api/admin/tables` sorts them (length first, then ordinal). The rows differ by at most one table; every row spreads its tables evenly over the width, the rows are spread evenly over the height, so larger tables get more room. The number of rows is the one that leaves the largest gaps. The tables keep their chair room and a gap to each other and to the edge, and lie completely within 0–1. With many tables the gap shrinks to zero, then the chair room; tables only overlap when they do not fit side by side even without it. The arrangement always uses the 3:2 plan, also in an area with an image.
- **A new table** in an area without image goes to the first place of the arrangement (of all tables, the new one included) where it does not overlap an existing table and its chairs; if there is none, to the first such place top left to bottom right, then to one where at least the tables do not overlap. In an area with an image it is placed in the middle.
- **After the update:** before, every new table was placed at 0.5/0.5, so the tables of an area without image lay on top of each other. On every start, in every environment, the API arranges each area without image in which at least two tables have exactly the same position (`FloorPlans/StackedTables.cs`). Areas with an image and areas whose tables are spread are left alone, so in effect this happens once.

### Demo reservations

In Development, every start adds demo reservations from today to today + 7 days for every restaurant that has tables, a location and opening hours, but no reservations from today on; where the tables come from does not matter. 30–60 % of the tables are booked at the peak times (12:00–13:00 and 18:00–20:00, or the whole opening window if it has neither) with names and phone numbers or email addresses of the restaurant's country. Today's reservations that have started are mostly `Arrived`, some `Late` or `Cancelled`; in a restaurant with the request mode some online reservations are `Requested`. To get new ones, delete the database or the reservations from today on.

The demo reservations have no guest link (no manage token), so they cannot be opened on the guest's page "Your reservation". To see a reservation with a link after its start (cancelling is no longer possible): while a demo restaurant is open, e.g. Kafana Dunav (12:00–22:00 start times, Europe/Belgrade), book the next free quarter hour of today online, keep the link from the confirmation and open it again once that time has passed in the restaurant's time zone.

Uploaded floor plans are stored in the folder `Uploads:Path` of `appsettings.json`, relative to `api/Cbplayground.Api` (default `data/uploads`, ignored by git).

### Backups

Outside Development, the API backs up the database once a day at `Backup:TimeOfDay` (default `03:00`, local server time). Each backup is one zip file in `Backup:Path` (default `data/backups`, relative to `api/Cbplayground.Api`, ignored by git), named after its time, e.g. `cbplayground-20261031-030000.zip`. It contains the database file, copied consistently with the SQLite online backup while the API keeps running, and the uploaded floor plans in `uploads/`. Backups older than `Backup:RetentionDays` (default 30) are deleted after each run. If the newest backup is more than a day old when the API starts, for example because the API was down at the scheduled time, it backs up right away. A failed backup is logged as an error; the API keeps running.

`Backup:Enabled` switches the backups on (`appsettings.json`) or off (`appsettings.Development.json`). To try them locally: `dotnet run -- --Backup:Enabled=true`.

The Data Protection keys (`DataProtection:KeysPath`) are deliberately not part of the backups: with them, anyone who has a copy of a backup could forge sign-in cookies, while losing them only means that everybody has to sign in again once.

The backups lie on the same disk as the database. To survive the loss of the server, `Backup:Path` should be on another disk or be copied off the server regularly; that is part of the server setup, not of this repository.

Restore a backup:

1. Stop the API.
2. Unzip the backup.
3. Replace the database file (the `Data Source` of the connection string) with the database file from the zip, and delete the `-wal` and `-shm` files next to it if there are any.
4. Replace the contents of the `Uploads:Path` folder with the `uploads/` folder from the zip.
5. Start the API.

There is no registration endpoint: staff users are created by a Tenant Admin (staff management, `/admin/staff`), a restaurant's admins also by the Superadmin (`/superadmin`), or by the development seed.

### Configuration for operation

All settings are in `appsettings.json` and can be overridden per environment (`appsettings.{Environment}.json`), with environment variables (`__` instead of `:`, e.g. `ConnectionStrings__Default`) or on the command line (`--Backup:Path=/srv/backups`). Relative paths are resolved against the content root, i.e. `api/Cbplayground.Api` (when the API is started with `dotnet run`, also from another folder with `--project`), so the database, uploads, backups and keys always end up in the same place.

| Key | Default | Meaning |
| --- | --- | --- |
| `ConnectionStrings:Default` | `Data Source=data/cbplayground.db` | The SQLite database. Its folder is created and all migrations are applied on startup, in every environment; demo data only in Development. |
| `Uploads:Path` | `data/uploads` | The uploaded floor plans. |
| `Backup:Enabled`, `Backup:Path`, `Backup:TimeOfDay`, `Backup:RetentionDays` | `true`, `data/backups`, `03:00`, `30` | The daily backups, see [Backups](#backups). |
| `DataProtection:KeysPath` | `data/keys` | The keys of the sign-in cookie (ASP.NET Core Data Protection, application name `cbplayground`). Kept on disk so staff stay signed in when the API restarts; ignored by git and not backed up. The folder must be writable and should only be readable by the API's user. Deleting it signs everybody out. |
| `RateLimiting:Login:PermitLimit` | `10` | Sign-in attempts per client IP and minute. |
| `RateLimiting:PublicReads:PermitLimit` | `120` | Calls of the public `calendar`, `availability` and `tables` per client IP and minute, together. |
| `RateLimiting:PublicBookings:PermitLimit` | `10` | Online bookings per client IP in 10 minutes. |
| `ForwardedHeaders:Enabled` | `false` | Behind a reverse proxy: take the client IP and the scheme from `X-Forwarded-For` and `X-Forwarded-Proto`. Without it, all guests behind a proxy share one rate limit counter. |
| `ForwardedHeaders:KnownProxies` | `[]` | IP addresses of the trusted proxies, e.g. `["10.0.0.5"]`. Loopback (`127.0.0.0/8`, `::1`) is always trusted; the headers of other senders are ignored. |
| `ForwardedHeaders:KnownNetworks` | `[]` | Networks of the trusted proxies in CIDR notation, e.g. `["172.18.0.0/16"]`. |

The rate limits count per client IP: the address of the connection, or with `ForwardedHeaders:Enabled` the client address the trusted proxy forwards. An account is locked after 5 failed attempts; with at most 10 attempts per minute, one address can lock at most two accounts a minute instead of any number, and a person who mistypes is not affected. The 120 reads per minute leave room for a guest clicking through the calendar quickly.

Error answers always have the form `{ "error": "<code>" }`. Besides the codes of the single endpoints, every endpoint can answer with 400 `invalid_request` (a parameter or body that cannot be read, e.g. a missing `guests` or an invalid date), 429 `too_many_requests` and 500 `server_error`. An unexpected error is logged with its stack trace and never contains details in the answer, in Development neither.

To run the API outside Development locally, start it without the launch profile, which sets Development:

```sh
cd api/Cbplayground.Api
ASPNETCORE_ENVIRONMENT=Production dotnet run --no-launch-profile
```

### Sign-in, roles and tenants

Staff users sign in with ASP.NET Core Identity. The sign-in cookie is HttpOnly and SameSite=Strict, and Secure outside Development. API calls without sign-in get 401, calls without the required role get 403; the API never redirects to a login page.

Every user has exactly one role:

| Role | Tenant | Policy |
| --- | --- | --- |
| `Superadmin` | none | `RequireSuperadmin` |
| `TenantAdmin` | one restaurant | `RequireTenantAdmin`, `RequireStaff` |
| `FrontDesk` | one restaurant | `RequireStaff` |

Deactivated users (`IsActive = false`) cannot sign in, nor can the staff of a deactivated restaurant (`Tenant.IsActive = false`). The security stamp is checked on every request, so deactivating a user or setting their password ends their sessions on their next request, and a role change applies right away. After 5 failed sign-in attempts an account is locked for 5 minutes.

Tenant isolation: an entity that belongs to a restaurant implements `ITenantOwned` (a `Guid TenantId`). `AppDbContext` then filters every query on it by the signed-in user's restaurant and sets `TenantId` on new entities when saving. Creating, changing or deleting data of another restaurant throws an exception, and without a restaurant (nobody signed in, or the Superadmin) these queries return nothing. `IgnoreQueryFilters()` is reserved for Superadmin cases and has to be justified in the pull request and at the place in the code. So far only `Endpoints/SuperadminEndpoints.cs` uses it, to count the tables and reservations of each restaurant (read only, restricted to that restaurant). Restaurants (`Tenant`) and users are not tenant-owned, so the Superadmin reads and writes them without it.

Demo users, created in Development only (from `Seed:Users` in `appsettings.Development.json`) and listed on the login page of the development server. The password of all of them is `Demo1234!`:

| Email | Role | Restaurant |
| --- | --- | --- |
| `superadmin@cbplayground.local` | Superadmin | none |
| `admin@zur-linde.local` | TenantAdmin | Gasthaus zur Linde |
| `frontdesk@zur-linde.local` | FrontDesk | Gasthaus zur Linde |
| `admin@kafana-dunav.local` | TenantAdmin | Kafana Dunav |
| `frontdesk@kafana-dunav.local` | FrontDesk | Kafana Dunav |

### Opening hours and public holidays

`IOpeningCalendar.GetOpenPeriodsAsync(date)` answers when the signed-in user's restaurant is open on a date. Precedence: a special day (closing day: no windows; special hours: exactly their windows, also on a day of the week that is otherwise closed) > a public holiday (closed, or the regular hours if the Tenant Admin opened it) > the regular windows of that day of the week. Public holidays are closed by default (`OpeningCalendar.HolidaysOpenByDefault`); a Tenant Admin can open single holidays, which then have the regular hours of their day of the week. Special days (`SpecialDay`, with `SpecialDayPeriod` for special hours) cover one day or a range of up to 366 days and do not overlap.

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

The tests need no running API and no Docker: they start the API in memory against a temporary SQLite file and a temporary uploads folder, and cover sign-in, sign-out, `me`, the 401/403 answers, the tenant isolation, the staff management, areas, tables and floor plan uploads, the public holidays, the opening calendar, the opening hours endpoints, the reservation settings with their duration rules and booking rules, closing days and special hours with their precedence, the restaurant profile, the setup status, table shapes and rotation, the table scale, the automatic arrangement of the tables (`TableLayout` directly, the `arrange-tables` endpoint and the arrangement of stacked tables on start), the Superadmin's restaurant management (including deactivated restaurants and the 403 for restaurant staff), the development seed, the database backups, and the reservations: availability, online quota, table assignment, the guest booking per slug, the staff endpoints, status changes with their time rules and undos, walk-ins, concurrent bookings of the last table, the rate limits, deleting tables with reservations, the demo reservations and the booking rules (lead time with a fixed clock, booking horizon, buffer, largest online party), as well as the start with an empty database outside Development, staying signed in after a restart, the health check, forwarded headers and the `invalid_request` and `server_error` answers.

### Run the web frontend

In a second terminal:

```sh
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The Vite dev server forwards `/api` to the API on http://localhost:5025, so the API must be running.

Routes: `/` lists the restaurants as cards with city, short description and a "Reserve a table" button, `/r/<slug>` is a restaurant's booking page (see below), `/embed/<slug>` the same booking for the restaurant's own website (see "Embedding"), `/login` is the staff sign-in, `/admin` is the admin area (Tenant Admins only), `/frontdesk` the front desk (Tenant Admins and Front desk users) and `/superadmin` the restaurant management (Superadmin only, see [Superadmin](#superadmin)). The header of the guest pages links to `/login` ("For restaurants: Sign in"); a signed-in user, the Superadmin included, sees a link to their own area instead. In development (`npm run dev`), the login page lists the demo accounts, and a click fills in the form; the production build does not contain them. `/admin` greets the admin and shows the setup checklist (see `GET /api/admin/setup-status`) with its progress, a link to the right page for every open step and a button that opens the restaurant's booking page in a new tab. The front desk has three tabs: "Today" (`/frontdesk`), "Reservations" (`/frontdesk/reservations`) and "Table overview" (`/frontdesk/tables`); a Tenant Admin finds the same reservations page under `/admin/reservations` in the sidebar, and `/admin` shows today's reservations, guests and open requests above the checklist. Both views show the open requests from today on (with accept and decline), the key figures of the day, a search by name, phone or reference, a status filter and the reservations grouped by start time with quick actions: mark as arrived, late, no-show, guest left, cancel, and undo (short labels with icons on tablets). Arrived and late are only offered on the reservation's day, no-show only from its start. Cancelling and no-show ask first, everywhere; after every status action a notification offers "Undo". The key figures also show the guests seated now and the no-shows. On today's page, "Walk-in" seats a guest without a reservation now: party size, a table free now (suggested, can be changed), optionally name, phone and note. A click on a reservation opens a drawer to change it; it offers only the tables that are free at the chosen time for the whole duration (`GET /api/staff/availability`), plus the reservation's current table. "New reservation" opens the same drawer for a phone reservation with the free times as chips, the suggested table and an optional duration override. The reservations page chooses its day with previous/next day, Today and a date picker; the day is kept in the address (`?date=YYYY-MM-DD`). The lists reload every minute, so new online bookings appear on their own. "Today" is taken in the restaurant's time zone (from `GET /api/public/restaurants/{slug}`). The status labels, colours and actions are defined once in `web/src/components/reservations/status.ts`, used by the lists, the table overview and the key figures. Under `/admin/opening-hours` a Tenant Admin maintains the weekly hours, the closing days and special hours (list of the upcoming entries; a modal with the date range, closed or special hours with time windows, and a note; after saving, a notice lists the reservations that lie in the period, with a link to the reservations page), the location and the public holidays. Under `/admin/reservation-settings` the card "Booking rules" sets lead time, booking horizon, buffer and the largest online party. Under `/admin/profile` a Tenant Admin maintains the restaurant profile. Under `/admin/embed` they get the snippet to embed the booking in their website. Under `/admin/areas` a Tenant Admin manages the areas, uploads their floor plans, places the tables on them by drag and drop (mouse and touch) and sets the online quota per area. An area without floor plan lists its tables, so they can be added, edited and deleted before a floor plan exists; deleting a table asks first. Under `/frontdesk/tables` and `/admin/tables` the table overview shows all tables and their reservations of a day, chosen with previous/next day, Today or a date picker: as a timeline (tables grouped by area × hours of the opening hours, reservations as blocks in their status colour, cancelled, declined and no-show ones faded, a guest who left ending at the time they left, a line at the current time, horizontally scrollable) or as the floor plans with every table in the colour of its status at the time of a slider in 15-minute steps and the end of the current or the start of the next reservation; an area without floor plan shows its tables as a grid. A click on a reservation shows its details and the same status actions as the lists. On today, a "Walk-in" button seats a walk-in, and on the floor plans a tap on a table that is free now offers "Seat walk-in here". The overview reloads every 60 seconds; it takes the day's opening hours from `GET /api/staff/availability`, and today and the current time in the restaurant's time zone. Day and view are kept in the address (`?date=YYYY-MM-DD`, `?view=floor`). Without sign-in, `/admin`, `/frontdesk` and `/superadmin` lead to `/login` and back to the requested page afterwards; a user without access to an area is sent to their own area. After signing in, a Tenant Admin lands on `/admin`, a Front desk user on `/frontdesk` and the Superadmin on `/superadmin`; the admin sidebar links to the front desk ("Open front desk"), and at the front desk a Tenant Admin finds "Go to management" in the account menu, which also shows the user's name and role.

The booking page `/r/<slug>` shows the restaurant (name, description, address, contact, opening hours) and lets a guest book without an account, one step after the other in a single column: party size (chips 1–8, "More" up to `maxOnlinePartySize`; larger parties are asked to call), date (closed and fully booked days disabled, up to the restaurant's booking horizon), time (free times only, grouped by opening window; a fully booked day offers the next free days), the table on the floor plan when the guest chooses it (the list next to the plan works with the keyboard), the contact details (name plus phone or email) and the confirmation with the reference code, or "request sent" in the request mode. The choices so far are shown at the top in short, each part leads back to its step. When the time or table is taken in the meantime, the guest gets a message and picks the time again from freshly loaded times. The booking so far is kept in the address (`?guests=…&date=…&time=…&table=…&step=…`, the contact details are not), so the back button returns to the previous step and a reload keeps the choices; invalid or outdated values (e.g. a day in the past) are dropped and the booking continues at the first step that is missing, and a time that is no longer free leads back to the time step with the known message. The booking steps are the component `BookingFlow`, used by `/r/<slug>` and `/embed/<slug>`. `?lang=` in the address sets the language of any page; it wins over the stored and the browser's language. The confirmation also offers "Add to calendar", an `.ics` file made in the browser (title, start and end converted from the restaurant's time zone to UTC, address and the link), and the link "Manage reservation" with a copy button and the hint to save it; the link opens in a new tab, so it also works from an embedded booking. The page uses the public endpoints through `web/src/api/publicBooking.ts`, its components are in `web/src/components/booking/`, and it sends the UI language as the reservation's `language`. A restaurant that is not bookable shows a hint with its phone number, an unknown slug the "restaurant not found" page. The restaurant's address links to a map search (Google Maps, new tab).

The link from the confirmation, `/r/<slug>/reservation/<code>?t=<token>`, opens the guest's page "Your reservation" in any browser: status, date, time, party size, area, table, reference code and the restaurant's contact. Until the start the guest can cancel there (asks first); afterwards the page confirms the cancellation and offers to book again. A wrong restaurant, code or token shows one "reservation not found" page. Staff see a reservation cancelled this way as "cancelled by the guest" in the reservation lists and the table overview.

#### Superadmin

`/superadmin` lists all restaurants in a table with a status badge (active or deactivated), the number of admins, tables and upcoming reservations, and a search by name or slug. "Create restaurant" opens a form with name, slug (suggested from the name until it is changed by hand) and optionally country and federal state; afterwards the restaurant's page opens. `/superadmin/tenants/:id` shows the restaurant's master data and its admins: "Edit" changes name and slug, "Deactivate"/"Activate" asks first and says what happens, "View booking page" opens `/r/<slug>` in a new tab, "Add admin" creates a Tenant Admin with a start password, and each admin's menu sets a new password. The layout has the language switcher and the user menu with sign-out. A newly created admin can sign in right away and sees the setup checklist under `/admin`.

Before committing, run `npm run lint` (oxlint plus the translation key check) and `npm run build` (typecheck and production build).

### Translations

The UI texts live in `web/src/i18n/locales/`, one file per language: `en.json`, `de.json`, `sr-Latn.json` and `sr-Cyrl.json`. Code never contains visible text; it uses keys such as `t('home.title')`. `en.json` is the reference: the keys used in code are typed after it, so an unknown key fails the typecheck.

Add a key:

1. Add the key with its text to all four files. Serbian Cyrillic is maintained by hand, not transliterated from the Latin file.
2. Use it in a component with `const { t } = useTranslation()` and `t('section.key')`.
3. Run `npm run lint`. It reports every key that is missing in a file or not present in `en.json`.

Texts with a number use i18next plurals: pass `count` (`t('reservations.list.groupGuests', { count })`) and give the key one entry per plural form of the language, e.g. `groupGuests_one` and `groupGuests_other` in English and German, `groupGuests_one`, `groupGuests_few` and `groupGuests_other` in Serbian. `npm run lint` checks that every plural key has exactly the forms of its file's language (`Intl.PluralRules`).

Dates and times are formatted in one place, `web/src/i18n/format.ts` (`formatShortDate`, `formatDate`, `formatLongDate`, `formatTime`), with `Intl` in the user's language; date pickers use `datePickerFormatter` from the same file. Every page sets its browser tab title with `useDocumentTitle` (`web/src/i18n/title.ts`), e.g. "Table overview · Gasthaus zur Linde".

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
