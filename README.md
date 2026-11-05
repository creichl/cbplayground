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
- Such an area is a room: its room style (indoor, terrace, garden, rooftop) sets floor and boundary, and room elements such as the entrance, windows, the bar, plants or a stage, optionally labelled (e.g. "Blick auf den Stephansdom"), furnish it. The system can suggest a room and keeps the tables away from the obstacles (see [Rooms](#rooms)).

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
- `/embed/<slug>` runs the same booking as `/r/<slug>`, built with the design system: only the reservation card in the full width, without the platform header, cover image, the restaurant's information and outer spacing, with the language as a small menu (globe and short code) at the top right and a discreet "Powered by cbplayground" link at the bottom. The booking dialog is no overlay here: its steps (table, contact details, confirmation) follow below the card, and their main buttons stay below each step, because an overlay or a bar fixed to the bottom of the screen does not work in an iframe that grows with its content. `?lang=de|en|sr-Latn|sr-Cyrl` sets the language. An unknown restaurant shows a short message, a restaurant that cannot be booked online the hint with its phone number.
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
│   │   ├── Backups/              # daily backup of the database and the uploaded images
│   │   ├── Data/                 # AppDbContext, entities, development seed
│   │   │   └── SeedAssets/       # floor plans, logos, cover images, area photos and gallery photos of the demo restaurants (development seed), CREDITS.md
│   │   ├── Endpoints/            # endpoint groups, one file per area
│   │   ├── FloorPlans/           # schematic floor plan: table sizes, automatic arrangement, suggested rooms
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

The API listens on http://localhost:5025. In every environment it creates the SQLite database `api/Cbplayground.Api/data/cbplayground.db` (and its folder) on startup and applies all migrations. In the Development environment (the default for `dotnet run`), it also sets up the three demo restaurants (see [Demo data](#demo-data)), creates the demo staff users (see below) that do not exist yet and adds demo reservations (see [Demo reservations](#demo-reservations)). The connection string is in `appsettings.json`.

To start from scratch with fresh demo data, for example to see new seed content, stop the API and start it with:

```sh
dotnet run -- --reset-demo-data
```

Before the start, this deletes the database file of the connection string together with its `-wal` and `-shm` files and empties the folder `Uploads:Path`; then the start migrates and seeds as on a fresh checkout (`Data/DemoDataReset.cs`). Only these configured paths are touched: the sign-in keys (`DataProtection:KeysPath`) and the backups stay. The reset only works in Development: in any other environment the start aborts with the message that `--reset-demo-data` is only allowed in Development, and nothing is deleted.

#### Demo data

In Development only, `DevelopmentSeed.SeedRestaurantsAsync` creates the demo restaurants that do not exist yet (by slug) and completes their setup, so all three are ready to try right after the first start:

| | Gasthaus zur Linde (`zur-linde`) | Kafana Dunav (`kafana-dunav`) | Rooftop Belvedere (`rooftop-belvedere`) |
| --- | --- | --- | --- |
| Location | Germany, Bavaria (`DE-BY`) | Serbia (`RS`) | Austria (`AT`) |
| Profile | Address in Munich, phone, email, website, description | Address in Novi Sad, phone, email, website, description | Address in Vienna, phone, email, website, description |
| Opening hours | Tuesday to Sunday 11:30–14:30 and 17:30–22:00, closed on Mondays | Every day 12:00–24:00 | Wednesday to Sunday 17:00–24:00 |
| Areas | "Gaststube" (10 tables, 2–8 seats) and "Terrasse" (6 tables, online quota 50 %), both with a floor plan image | "Sala" (12 tables, 2–8 seats, floor plan image) and "Bašta" (6 tables, 2–8 seats, no floor plan image: the drawn room) | "Rooftop" (8 tables, 2–6 seats, online quota 70 %) and "Lounge" (5 tables, 2–8 seats), both with a floor plan image |
| Area photos and descriptions | A photo and a German description for each area | A photo and a Serbian (Latin) description for each area, e.g. "Bašta u hladu lipa, pogled na Dunav" | A photo and a German description for each area |
| Reservation settings | Instant confirmation, the system assigns tables, 1–2 guests 90 minutes, 3–6 guests 120 minutes | Request, the guest picks the table, 120 minutes | Instant confirmation, the guest picks the table, 120 minutes |
| Branding | Light, `Rustic`, warm green `#5a7d3a`, logo and cover image | Light, `Classic`, Danube blue `#1f5f8b`, logo and cover image | Dark, `Elegant`, champagne gold `#c9a96e`, logo and cover image |
| Photo gallery | 7 photos with German captions: Schweinsbraten, Dunkles vom Holzfass, the Stube with the tiled stove, beer garden under old trees, Weißwurst with Brezn, a Helles in the garden, Kaiserschmarrn | 6 photos with Serbian (Latin) captions: riblja čorba, mixed grill, red wine at sunset, evening on the Danube, tamburaši, a laid table | 7 photos with German captions: signature cocktails, sharing plates, the bar in the evening, Vienna at sunset, the lounge corner, champagne, the view over the roofs of Vienna |

So both confirmation modes and both table selection modes can be shown, and the guest's table choice on floor plan images (Kafana Dunav's "Sala", both areas of Rooftop Belvedere) and on a drawn room (Kafana Dunav's "Bašta", the example of an area without image).

The floor plans of "Gaststube", "Terrasse", "Sala", "Rooftop" and "Lounge" are top views like an architect's or interior plan, calm, with real textures and soft shadows: walls with their thickness, doors with their swing, windows, real floors and the built-in furniture and plants of the place, but no loose tables or chairs, because the app draws the tables on top. They are WebP files of 1800 × 1200 pixels in `api/Cbplayground.Api/Data/SeedAssets/` (`gaststube.webp`, `terrasse.webp`, `sala.webp`, `rooftop.webp`, `lounge.webp`), rendered for this project with Blender from CC0 materials and models (see below):

| Area | Size of the image | Plan | Table scale |
| --- | --- | --- | --- |
| "Gaststube" | 13 × 8.7 m | Plank floor, tiled stove with its bench in the top left corner, corner bench in the top right corner, bar with a barrel, stools and a back bar at the right, the door to the kitchen behind it, the entrance at the bottom, windows | 90 % |
| "Terrasse" | 14 × 9.3 m | Stone slabs between the house (glass door to the Gaststube, windows) and the hedges, the way into the garden at the bottom, the chestnut with a round bench at the bottom right | 85 % |
| "Sala" | 15 × 10 m | Tiles, bar with a marble counter, stools and a back bar at the top right, the door to the kitchen, a podium for the musicians at the bottom right, a wall bench, the entrance at the bottom, windows | 80 % |
| "Rooftop" | 18 × 12 m | Wooden deck behind a glass balustrade, stairs and lift at the top left, the bar with stools at the back, the glass door to the lounge, planters and olive trees, "Blick auf den Stephansdom" at the bottom edge | 68 % |
| "Lounge" | 14 × 9.3 m | Herringbone parquet, panorama windows at the top, a sofa at each side wall, a small bar in the bottom right corner, the entrance at the bottom | 85 % |

The seed copies the plans into `Uploads:Path` under a new file name, as an upload would, and places the tables in pixels of the plan on free floor, so every table with its chairs stands clear of walls, the bar, plants and doors. The table scale of each area fits the scale of its plan, so a table for 4 is about as large as in the room (about 85 cm). The tables keep their numbers, seats and shapes (square, rectangular for 6 and 8 seats, round ones on the terrace and a few elsewhere; Sala's table 4 is turned by 90°). The plans are light, so the tables in the accent colour stay legible; the plan of Rooftop Belvedere is light too, although its guest pages are dark.

"Bašta" has no floor plan image and a table scale of 100 %; its tables (round, square and rectangular) are arranged by `TableLayout`, so it shows the drawn room: `Garden`, the suggested garden (the entrance in the bottom side, trees along the edge) and the label "Dunav" at the top, the river side (see [Rooms](#rooms)); its tables are arranged around the obstacles. The areas with a floor plan image have no room elements, because the image shows the room; "Rooftop" has the room style `Rooftop`, the others keep the default `Indoor`.

The logos (`*-logo.png`, 800 pixels wide, about 3 : 1) are wordmarks with a small emblem on a transparent background, designed for this project as SVG with fonts under the SIL Open Font License and rendered as PNG. The emblem stands left of the name, which fills the height in two lines of nearly equal size with little space around, so the whole name is legible from 32 pixels high (each line about 13 pixels): a linden leaf in green with "Gasthaus" / "zur Linde" (Merriweather), a bridge over the Danube in blue with "Kafana" / "Dunav" (Source Sans 3, Playfair Display) and the roofs of Vienna in champagne gold with "Rooftop" / "Belvedere" (Montserrat, Cormorant Garamond), made for a dark background. The cover images (`*-cover.jpg`, a beer garden for Gasthaus zur Linde, a garden by the river at night for Kafana Dunav, a bar high above the city at dusk for Rooftop Belvedere, 2000 × 1125 pixels) and the area photos (`*-photo.jpg`, 1200 × 800 pixels) are real photos under CC0 1.0 (free to use, also commercially, without attribution), from Wikimedia Commons. The seed copies logos, cover images and photos into `Uploads:Path` under a new file name as well.

The gallery photos (`*-gallery-*.jpg`, 20 files) are real photos under CC0 1.0 as well, found on Wikimedia Commons, many of them originally published on Unsplash, Pixabay, PIXNIO or Flickr under CC0. They are JPEG files of 1600 × 1067 pixels (cropped to 3:2) and at most 350 KB each; visible logos and labels (a brewery's name on a plate and on a glass, a bottle label) are blurred, and no face can be recognised. The motifs fit the restaurants but were not all taken there: the beer garden is Munich's Hirschgarten, the fish soup comes from Madeira, the lounge is a hotel lobby in Budapest.

Image sources: `SeedAssets/CREDITS.md` lists source, author, licence, retrieval date and changes of every file in the folder, and for the floor plans the materials (ambientCG), models (Poly Haven) and the font they use, all under CC0 1.0 or the SIL Open Font License. No file without a clear licence, no material from Freepik, Shutterstock or Envato and no logos or brands of others; a test checks that every file in the folder has its complete entry.

The seed is idempotent and never overwrites what an admin maintained. For each restaurant it only adds a part the restaurant has nothing of yet:

- the location, if no country is set;
- the profile, if all profile fields are empty;
- the branding with logo and cover image, if all branding fields (colour, theme, font style, logo, cover image) are empty;
- the opening hours, if there are none;
- the areas with their floor plans, rooms, tables, photos and descriptions, if there are no areas (an area without tables gets none); so an existing area never gets a room from the seed;
- the photo and description of an existing demo area (found by its name), if it has neither;
- the reservation settings with their duration rules and booking rules, closing days and special hours with their precedence, if they were never saved;
- the photo gallery with its captions, if the restaurant has no gallery photos (so a restaurant whose admin deleted all of them gets the demo gallery again on the next start).

A second start therefore adds nothing, and an existing database whose restaurants lack, for example, areas or opening hours is completed on the next start. Because areas are only added to a restaurant without areas, an existing development database keeps its areas: it does not get "Bašta", the new floor plans or table positions, and its Rooftop Belvedere keeps the drawn rooms; all of this only appears after resetting the demo data (`dotnet run -- --reset-demo-data`, see [Run the API](#run-the-api)). A new demo restaurant such as Rooftop Belvedere is created in an existing database too (by its slug), with its areas, because it has none yet; the existing restaurants get their branding on the next start as long as nobody has set any of it. The photo cover images replaced generated ones: an existing development database keeps the old cover images, because its branding is already set, while its demo areas get their photos and descriptions on the next start. The new images (floor plans, logos, cover images) are certain to appear only after resetting the demo data; then all three restaurants, their branding, floor plans, area photos and galleries are complete. An existing development database gets the galleries on the next start, because its restaurants have no gallery photos yet. To start from scratch, stop the API and start it with `dotnet run -- --reset-demo-data`. Outside Development nothing of this is created; there the Superadmin creates the restaurants and their first admins under `/superadmin` (see [Superadmin](#superadmin)). The migrations do not create a Superadmin user: outside Development it has to be added to the database once by hand.

Endpoints:

- `GET /api/health`: 200 `{ "status": "ok" }` when the database can be reached, otherwise 503 `{ "error": "unhealthy" }`.
- `GET /api/tenants`: all active restaurants, sorted by name: `id`, `name`, `slug`, `city` and `description` from the profile, and `logoUrl`, `coverUrl` and `brandColor` from the branding (each `null` when empty), for the cards of the start page. Deactivated restaurants are left out.
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
- `GET /api/admin/branding`: the branding of the Tenant Admin's restaurant: `brandColor` (`#rrggbb` or `null` for the platform's colour), `themeMode` (`Light` | `Dark`, `Light` when not set), `fontStyle` (`Modern` | `Classic` | `Elegant` | `Rustic` | `Urban`, `Modern` when not set; which fonts stand behind it is up to the web), `logoUrl` and `coverUrl` (`null` without image). The fields are stored on `Tenant` and are `null` until set.
- `PUT /api/admin/branding`: body `{ "brandColor", "themeMode", "fontStyle" }`, returns the branding as `GET`. The colour is stored in lower case; empty values are stored as `null` (the default). On failure: 400 with `{ "error": "invalid_brand_color" | "invalid_theme_mode" | "invalid_font_style" }`.
- `PUT /api/admin/branding/logo` and `PUT /api/admin/branding/cover`: the body is the image itself, PNG, JPEG or WebP (no SVG), the logo at most 2 MB, the cover image at most 10 MB. The type is detected from the content and the file name is chosen by the server (`ImageUploads`, shared with the floor plans); the file is stored in `Uploads:Path`. Replaces an existing image and deletes its file. Returns the branding. Errors as for the floor plans: 415 `floor_plan_type_invalid`, 413 `logo_too_large` (logo) or `floor_plan_too_large` (cover image, the same 10 MB as a floor plan).
- `DELETE /api/admin/branding/logo` and `DELETE /api/admin/branding/cover`: removes the image and its file, returns the branding.
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
  - `GET /api/admin/areas`: the restaurant's areas in their order: `id`, `name`, `sortOrder`, `floorPlanUrl` (`null` without floor plan), `description` and `photoUrl` (each `null` when empty), `onlineBookingEnabled`, `onlineCapacityPercent`, `tableScale`, `roomStyle`.
  - `POST /api/admin/areas`: body `{ "name" }`. A new area comes last, is open for online booking, has an online quota of 100 %, a table scale of 100 % and is an `Indoor` room without elements.
  - `PUT /api/admin/areas/{id}`: body `{ "name", "onlineBookingEnabled", "onlineCapacityPercent", "tableScale", "description" }`. `onlineCapacityPercent` 0–100 (otherwise 400 `online_capacity_percent_invalid`). `tableScale` is optional, whole percent from 50 to 200 (otherwise 400 `table_scale_invalid`); without it the stored value stays. It scales the drawn tables of this area, so they match an uploaded floor plan. `description` is optional, a short text for the guest's choice of the area (e.g. "Dachterrasse mit Blick über die Stadt"), trimmed, at most 200 characters (otherwise 400 `invalid_area_description`); an empty one removes the description, without the field the stored value stays.
  - `POST /api/admin/areas/{id}/arrange-tables`: arranges all tables of the area anew with `TableLayout` (see [Schematic floor plan](#schematic-floor-plan)), also in an area with a floor plan image, and returns the area's tables as `GET /api/admin/tables` lists them. Without image the tables keep away from the room elements (see [Rooms](#rooms)), with an image the elements are ignored. Unknown area or one of another restaurant: 404.
  - `GET /api/admin/areas/{id}/room`: the room of the area, `{ "roomStyle", "elements": [{ "id", "kind", "posX", "posY", "width", "height", "rotation", "label" }] }`, the elements in their order (see [Rooms](#rooms)).
  - `PUT /api/admin/areas/{id}/room`: the same body; replaces the room style and all elements, all or nothing, and returns the room as `GET`. The `id` of an element in the body is ignored, every saved element gets a new one; without `elements` the room has none. The tables stay where they are. At most 60 elements. Errors: 400 `invalid_room_style`, `invalid_room_element` (unknown `kind`), `invalid_room_element_position` (`posX`/`posY` not 0–1, `width`/`height` not more than 0 and at most 1, `rotation` not 0, 90, 180 or 270), `invalid_room_element_label` (more than 40 characters, or missing on a `Label`), `too_many_room_elements`.
  - `POST /api/admin/areas/{id}/suggest-room`: replaces the elements with the suggestion for the area's room style and number of tables (`RoomSuggestion`), then arranges the tables anew as `arrange-tables` does, around the new elements in an area without image. Returns `{ "roomStyle", "elements", "tables" }`, the tables as `GET /api/admin/tables` lists them.
  - All room endpoints: unknown area or one of another restaurant: 404.
  - `DELETE /api/admin/areas/{id}`: deletes the area with its tables, its floor plan image and its photo. 409 `table_has_reservations` while one of its tables has a reservation that has not ended yet (see below).
  - `PUT /api/admin/areas/order`: body `{ "areaIds": [...] }` with every area of the restaurant once, in the new order.
  - `PUT /api/admin/areas/{id}/floorplan`: the body is the image itself (PNG, JPEG or WebP, at most 10 MB). The type is detected from the content; the file name is chosen by the server. Replaces an existing floor plan.
  - `PUT /api/admin/areas/{id}/photo`: the photo of the area, like a cover image: the body is the image itself (PNG, JPEG or WebP, no SVG, at most 10 MB), the type is detected from the content and the file name is chosen by the server; the file is stored in `Uploads:Path`. Replaces an existing photo and deletes its file. Returns the area. Errors as for the cover image: 415 `floor_plan_type_invalid`, 413 `floor_plan_too_large`.
  - `DELETE /api/admin/areas/{id}/photo`: removes the photo and its file, returns the area.
  - An area of another restaurant is 404 for all of them.
- Photo gallery (Tenant Admins only, always of the own restaurant): up to 20 photos, each with an optional caption, in a fixed order. Guests get it with the restaurant (`gallery` in `GET /api/public/restaurants/{slug}`, see below).
  - `GET /api/admin/gallery`: the photos in their order, each `{ "id", "url", "caption" }` (`caption` `null` without one). `url` is the public URL of the image with its version (`/api/public/restaurants/{slug}/gallery/{id}?v=…`).
  - `POST /api/admin/gallery`: adds a photo at the end. The body is the image itself (PNG, JPEG or WebP, no SVG, at most 10 MB), the type is detected from the content and the file name is chosen by the server; the file is stored in `Uploads:Path`, so the backup takes it along. Returns 201 with the photo. Errors as for the cover image: 415 `floor_plan_type_invalid`, 413 `floor_plan_too_large`; with 20 photos 409 `gallery_full` (nothing is stored).
  - `PUT /api/admin/gallery/{id}`: body `{ "caption" }`, trimmed, at most 120 characters (otherwise 400 `invalid_caption`); an empty one or none removes the caption. Returns the photo.
  - `DELETE /api/admin/gallery/{id}`: deletes the photo and its file (204).
  - `PUT /api/admin/gallery/order`: body `{ "photoIds": [...] }` with every photo of the gallery exactly once, in the new order (otherwise 400 `invalid_order`). Returns the photos in their new order.
  - A photo of another restaurant is 404 like an unknown one.
- `GET /api/areas/{id}/floorplan`: the floor plan image of an area. Public, because guests will see it to pick a table.
- `GET /api/areas/{id}/photo`: the photo of an area, 404 without one. Public like the floor plan, also for a deactivated restaurant like the floor plan. `photoUrl` carries the photo's version (`?v=`, its file name, which changes with every upload); with the current version the photo may be cached for a year (`Cache-Control: public, max-age=31536000, immutable`), otherwise it is revalidated (`no-cache`).
- Tables (Tenant Admins only):
  - `GET /api/admin/tables`: all tables of the restaurant: `id`, `areaId`, `number`, `seats`, `posX`, `posY`, `shape`, `rotation`. The position is the table's centre relative to the floor plan, from 0 to 1 (see [Schematic floor plan](#schematic-floor-plan) for an area without image). `shape` is `Round`, `Square` or `Rectangle`, never `null`; `rotation` is `0` or `90` (degrees), stored for every table but only visible on rectangular ones.
  - `POST /api/admin/tables`: body `{ "areaId", "number", "seats", "shape", "rotation" }`; `shape` and `rotation` are optional. Without `shape` a table with 1–4 seats is `Square`, from 5 seats `Rectangle`; without `rotation` 0. In an area with floor plan image the table is placed in the middle of the image, in an area without one on the first free place of the arrangement, so it does not overlap another table nor stand on a room element.
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
  - `GET /api/public/restaurants/{slug}`: `name`, the profile (`street`, `postalCode`, `city`, `phone`, `email`, `website`, `description`, each `null` when empty), `timeZoneId`, `confirmationMode`, `tableSelectionMode`, `maxOnlinePartySize` (seats of the largest table that can be booked online, 0 if none, at most the restaurant's own limit), `bookingHorizonDays`, `openingHours` (the week, as in `GET /api/admin/opening-hours`), `bookable` (false without location, opening hours or tables that can be booked online) and `branding` (`{ "brandColor", "themeMode", "fontStyle", "logoUrl", "coverUrl" }`, as in `GET /api/admin/branding`) and `areas`, the areas open for online booking in their order as `{ "name", "description", "photoUrl" }` (`description` and `photoUrl` `null` when not given), also when the system assigns the tables, and `gallery`, the photo gallery in its order as `{ "id", "url", "caption" }` (as in `GET /api/admin/gallery`; empty without photos).
  - `GET /api/public/restaurants/{slug}/logo` and `/cover`: the restaurant's logo or cover image, 404 without one. The URLs in the branding carry the image's version (`?v=`, its file name, which changes with every upload); with the current version the image may be cached for a year (`Cache-Control: public, max-age=31536000, immutable`), otherwise it is revalidated (`no-cache`).
  - `GET /api/public/restaurants/{slug}/gallery/{id}`: a photo of the gallery; 404 for an unknown photo, one of another restaurant and every photo of a deactivated restaurant. Cached like logo and cover image: with the current version of its `url` for a year, otherwise revalidated.
  - `GET /api/public/restaurants/{slug}/calendar?month=YYYY-MM&guests=N`: one entry per day of the month, `{ "date", "status" }` with `closed` (closed, also on closing days, in the past or beyond the booking horizon), `full` or `available`, for the date picker. Errors: `invalid_month`, `invalid_party_size`.
  - `GET /api/public/restaurants/{slug}/availability?date=YYYY-MM-DD&guests=N`: `date`, `guests`, `durationMinutes` and `periods`: per opening window `{ "start", "end", "times": [{ "time", "available" }] }`. No periods on closing days and closed public holidays; on days with special hours exactly these windows.
  - `GET /api/public/restaurants/{slug}/tables?date=YYYY-MM-DD&time=HH:mm&guests=N`: only when the guest chooses the table (otherwise 400 `table_selection_disabled`). The areas open for online booking in their order, `{ "id", "name", "floorPlanUrl", "description", "photoUrl", "tableScale", "tables": [{ "id", "number", "seats", "posX", "posY", "shape", "rotation", "available" }], "roomStyle", "roomElements" }`; `roomElements` as the `elements` of `GET /api/admin/areas/{id}/room`. `available` considers size, other reservations, the online quota and the opening hours.
  - `POST /api/public/restaurants/{slug}/reservations`: body `{ "date", "time", "guests", "tableId", "name", "phone", "email", "notes", "language" }`. `tableId` is required when the guest chooses the table and ignored when the system assigns it; `phone` or `email` is required; `language` is `en`, `de`, `sr-Latn` or `sr-Cyrl`. Returns 201 with `referenceCode`, `status` (`Confirmed` in the instant mode, `Requested` in the request mode), `date`, `time`, `guests`, `durationMinutes`, `area`, `tableNumber` and `manageToken`, the token of the guest's link to view and cancel the reservation (32 random bytes, URL-safe Base64). Only its SHA-256 is stored (`Reservation.ManageTokenHash`), so it is returned only here. Errors: 400 `invalid_date`, `invalid_time`, `invalid_party_size`, `invalid_name`, `contact_required`, `invalid_phone`, `invalid_email`, `invalid_notes`, `invalid_language`, `table_required`, `outside_opening_hours`, `too_short_notice` (within the lead time), `too_far_ahead`, `in_the_past`; 409 `slot_unavailable`, `table_unavailable`; 429 `too_many_requests` after 10 bookings from the same client IP within 10 minutes (`RateLimiting:PublicBookings:PermitLimit`).
  - `GET /api/public/restaurants/{slug}/reservations/{referenceCode}?token=…`: the guest's view of an online reservation: `referenceCode`, `status`, `date`, `time`, `endTime`, `guests`, `durationMinutes`, `area`, `tableNumber`, `name`, `cancelledByGuest` and `canCancel` (whether the guest can still cancel). A wrong code, a wrong token or a reservation of another restaurant are all 404, without telling which; reservations entered by staff have no token and are never found.
  - `POST /api/public/restaurants/{slug}/reservations/{referenceCode}/cancel`: body `{ "token" }`. Cancels the reservation (`Cancelled`, `cancelledByGuest` true) and returns it as above. Errors: 404 as above; 409 `cancellation_not_possible` when it is not `Requested`, `Confirmed` or `Late` or has started (see the reservation rules).
  - Both compare the token in constant time and have their own rate limit with the limit of the bookings (429 `too_many_requests` after 10 requests from the same client IP within 10 minutes).
- Reservations for the staff (Tenant Admins and Front desk users, `RequireStaff` policy), always of the signed-in user's restaurant; reservations of other restaurants are 404:
  - `GET /api/staff/floor`: the areas in their order with their tables and rooms: `id`, `name`, `sortOrder`, `floorPlanUrl`, `description`, `photoUrl`, `tableScale`, `tables` (`id`, `number`, `seats`, `posX`, `posY`, `shape`, `rotation`), `roomStyle`, `roomElements` (as the `elements` of `GET /api/admin/areas/{id}/room`).
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
- With room elements, the arrangement and a new table keep away from the obstacles; see [Rooms](#rooms).
- **After the update:** before, every new table was placed at 0.5/0.5, so the tables of an area without image lay on top of each other. On every start, in every environment, the API arranges each area without image in which at least two tables have exactly the same position (`FloorPlans/StackedTables.cs`). Areas with an image and areas whose tables are spread are left alone, so in effect this happens once.

#### Rooms

An area without floor plan image is a room, not only tables in an empty rectangle. The room stays a 3:2 rectangle. The entities are `Area.RoomStyle` and `RoomElement` (`api/Cbplayground.Api/Data/`), the suggestion is `FloorPlans/RoomSuggestion.cs`, the arrangement `FloorPlans/TableLayout.cs`. In an area with floor plan image style and elements are stored but not drawn (the image shows the room), and the arrangement ignores them.

**Room style** (`roomStyle`), default `Indoor`; it sets what the web draws as floor and boundary:

| Style | Floor | Boundary |
| --- | --- | --- |
| `Indoor` | oak planks | walls |
| `Terrace` | stone slabs | railing |
| `Garden` | gravel with a strip of lawn along the hedge | hedge |
| `Rooftop` | wooden deck | glass parapet |

An area from before the rooms is `Indoor` without elements (the migration `AddRoomElements`); nothing is changed on start. The web still draws its walls and floor; the admin adds elements or lets the system suggest them.

**Room elements** (`elements`), at most 60 per area, deleted with their area:

- `kind`: `Entrance`, `Window`, `Bar`, `Plant`, `Pillar`, `Sofa`, `Stage`, `Service` (service station or kitchen pass), `Stairs`, `Label` (only a text).
- `posX`, `posY`: the centre, 0–1 as for tables. `width`, `height`: the extent as the element lies on the plan (after the rotation), as a fraction of the plan width and of the plan height, more than 0 and at most 1. A height in plan widths is a fraction of the plan height × 1.5.
- `rotation`: 0, 90, 180 or 270 degrees, clockwise. At 0 the element's front faces up, as at the bottom wall facing into the room; at 90 it stands at the left wall facing right, at 180 at the top wall facing down, at 270 at the right wall facing left. So a door can sit in every wall.
- `label`: optional, at most 40 characters (trimmed, empty is none); required for `Label`.

**Default sizes** of a new element, length along the wall × depth into the room, both in plan widths (`RoomElement.DefaultDimensions`; the web uses the same). At 0° and 180° `width` is the length and `height` the depth × 1.5; at 90° and 270° `width` is the depth and `height` the length × 1.5 (`RoomElement.Size`):

| Kind | Length × depth | Blocks tables |
| --- | --- | --- |
| `Entrance` | 0.10 × 0.03 | keeps a zone free in front of it |
| `Window` | 0.16 × 0.02 | no |
| `Bar` | 0.30 × 0.10 (stools included) | yes |
| `Plant` | 0.05 × 0.05 | yes |
| `Pillar` | 0.04 × 0.04 | yes |
| `Sofa` | 0.16 × 0.06 | yes |
| `Stage` | 0.30 × 0.15 | yes |
| `Service` | 0.14 × 0.08 | yes |
| `Stairs` | 0.10 × 0.16 | yes |
| `Label` | 0.24 × 0.04 | no |

**Suggested room** (`RoomSuggestion.Suggest`, `POST /api/admin/areas/{id}/suggest-room`): elements of their default size at the edge of the plan, for the room style and the number of tables of the area. Deterministic: the same style and number of tables give the same room.

- `Indoor`: the entrance in the middle of the bottom wall, three windows in the top wall (at 1/4, 1/2 and 3/4), from 6 tables a bar in the middle of the right wall, plants in the two top corners.
- `Terrace`: the door in the left side, low (at 0.85 of the height), from 6 tables a bar in the middle of the back (top), plants in the other three corners; no windows.
- `Rooftop`: the stairs in the bottom left corner, facing right, with the entrance onto the deck right in front of them, from 6 tables a bar in the middle of the back (top), planters in the other three corners; no windows.
- `Garden`: the entrance in the middle of the bottom side, plants (trees) along the edge: in the four corners and in the middle of the top, left and right side.

**Arrangement around the elements** (`TableLayout.Arrange` for `arrange-tables`, `suggest-room` and the stacked tables on start, `TableLayout.FreePosition` for a new table), only in an area without floor plan image:

- Blocking are `Bar`, `Pillar`, `Sofa`, `Stage`, `Service`, `Stairs` and `Plant`. In front of an `Entrance`, on the side it faces, a zone of `TableLayout.EntranceZoneDepth` = 0.10 plan widths (about a table depth with its chairs) stays free, as wide as the entrance. `Window` and `Label` do not block.
- The tables keep their chair room and a gap to the obstacles as to each other and to the edge. The other rules of the [schematic floor plan](#schematic-floor-plan) stay: rows in the order of the numbers, spread evenly, within 0–1. A row is spread over the pieces of its width that no obstacle covers, from left to right; the rows are spread evenly over the whole plan height or, if that leaves larger gaps, over the height between an obstacle at the top and one at the bottom (e.g. below a stage along the top wall). The arrangement with the largest gaps wins.
- When the room is not enough, first the gaps shrink, then the chair room, then the tables overlap each other beside the obstacles. Only when a table does not fit beside the obstacles at all are the tables arranged as without elements: overlapping an element is the last resort.
- A new table takes the first place as before that also keeps away from the obstacles (with chair room, then without). If there is none, the middle, or, when the middle lies on an obstacle, the first place free of the obstacles even if it overlaps a table.

### Demo reservations

In Development, every start adds demo reservations from today to today + 7 days for every restaurant that has tables, a location and opening hours, but no reservations from today on; where the tables come from does not matter. 30–60 % of the tables are booked at the peak times (12:00–13:00 and 18:00–20:00, or the whole opening window if it has neither) with names and phone numbers or email addresses of the restaurant's country. Today's reservations that have started are mostly `Arrived`, some `Late` or `Cancelled`; in a restaurant with the request mode some online reservations are `Requested`. To get new ones, reset the demo data (`dotnet run -- --reset-demo-data`) or delete the reservations from today on.

The demo reservations have no guest link (no manage token), so they cannot be opened on the guest's page "Your reservation". To see a reservation with a link after its start (cancelling is no longer possible): while a demo restaurant is open, e.g. Kafana Dunav (12:00–22:00 start times, Europe/Belgrade), book the next free quarter hour of today online, keep the link from the confirmation and open it again once that time has passed in the restaurant's time zone.

Uploaded floor plans, logos, cover images, area photos and gallery photos are stored in the folder `Uploads:Path` of `appsettings.json`, relative to `api/Cbplayground.Api` (default `data/uploads`, ignored by git).

### Backups

Outside Development, the API backs up the database once a day at `Backup:TimeOfDay` (default `03:00`, local server time). Each backup is one zip file in `Backup:Path` (default `data/backups`, relative to `api/Cbplayground.Api`, ignored by git), named after its time, e.g. `cbplayground-20261031-030000.zip`. It contains the database file, copied consistently with the SQLite online backup while the API keeps running, and the uploaded images (floor plans, logos, cover images, area photos and gallery photos) in `uploads/`. Backups older than `Backup:RetentionDays` (default 30) are deleted after each run. If the newest backup is more than a day old when the API starts, for example because the API was down at the scheduled time, it backs up right away. A failed backup is logged as an error; the API keeps running.

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
| `Uploads:Path` | `data/uploads` | The uploaded floor plans, logos, cover images, area photos and gallery photos. |
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
| `admin@rooftop-belvedere.local` | TenantAdmin | Rooftop Belvedere |
| `frontdesk@rooftop-belvedere.local` | FrontDesk | Rooftop Belvedere |

The login page of the development server does not list the two Rooftop Belvedere users yet; they sign in like the others.

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

The tests need no running API and no Docker: they start the API in memory against a temporary SQLite file and a temporary uploads folder, and cover sign-in, sign-out, `me`, the 401/403 answers, the tenant isolation, the staff management, areas, tables, floor plan and area photo uploads, area descriptions, the photo gallery (order, the limit of 20 photos, captions, deleting the file, tenant isolation, deactivated restaurants), the public holidays, the opening calendar, the opening hours endpoints, the reservation settings with their duration rules and booking rules, closing days and special hours with their precedence, the restaurant profile, the setup status, table shapes and rotation, the table scale, the automatic arrangement of the tables (`TableLayout` directly, the `arrange-tables` endpoint and the arrangement of stacked tables on start), the Superadmin's restaurant management (including deactivated restaurants and the 403 for restaurant staff), the development seed with the credits of its images, the reset of the demo data (only in Development), the database backups, and the reservations: availability, online quota, table assignment, the guest booking per slug, the staff endpoints, status changes with their time rules and undos, walk-ins, concurrent bookings of the last table, the rate limits, deleting tables with reservations, the demo reservations and the booking rules (lead time with a fixed clock, booking horizon, buffer, largest online party), as well as the start with an empty database outside Development, staying signed in after a restart, the health check, forwarded headers and the `invalid_request` and `server_error` answers.

### Run the web frontend

In a second terminal:

```sh
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The Vite dev server forwards `/api` to the API on http://localhost:5025, so the API must be running.

Routes: `/` is the overview of the restaurants, built with the design system (see [Design system](#design-system)) in the platform's look: a header with the product name on the left, the staff link and the language as a compact menu (globe and short code) on the right; a short, strong heading ("Reserve a table – directly with the restaurant") with a line below and a large search field with a magnifier that filters the cards by name or city as you type (accents ignored, "Reset search" when nothing matches); and a grid of cards in the style of large marketplaces, 1 column on phones, 2 on tablets, 3 on desktops, at most 1200 px wide. Each card is one link to the restaurant's booking page: the cover image in 4:3 with rounded corners that zooms in softly under the pointer (the first one loaded right away, the others lazily, fading in on a light tint of the accent colour) with the logo on it (56 px high, without box, over a soft gradient), or without cover image, or when it cannot be loaded, the light tint (the platform's colour without accent colour) with the logo (64 px high) or the name; below it the name in the display font, the city, the description cut to two lines and "Reserve a table" with an arrow in the accent colour (the shade of it that keeps 4.5:1 on white). While loading, skeletons in the shape of the cards; empty, no-match and error states with an icon, a heading and the next step. A plain footer closes the page. "Not found" (an unknown address) has the same header and footer, and in between a calm page in the design system: a large "404", the heading, one sentence and "Back to the start page"; inside the admin area, the front desk and the Superadmin it shows the same within their own frame. An unknown restaurant (`/r/<slug>`) shows it in the same look with a symbol instead of the number and its own text ("Restaurant not found"). `/r/<slug>` is a restaurant's booking page (see below), `/embed/<slug>` the same booking for the restaurant's own website (see "Embedding"), `/login` is the staff sign-in, `/admin` is the admin area (Tenant Admins only), `/frontdesk` the front desk (Tenant Admins and Front desk users) and `/superadmin` the restaurant management (Superadmin only, see [Superadmin](#superadmin)). The header of the start page, and the footer of a restaurant's guest pages, link to `/login` ("For restaurants: Sign in"); a signed-in user, the Superadmin included, sees a link to their own area instead. The login page is built with the design system and split from 1024 px on: on the left the form, centred and at most 400 px wide, with the platform's mark (a link to `/`) and the language menu above it, the heading, email, password (with a switch to show it) and "Sign in", which shows a spinner while signing in; on the right a photo of a restaurant in the full height (`web/public/login-photo.webp`, CC0, see `web/public/CREDITS.md`) with a soft gradient and a one-sentence claim. On smaller screens only the form, and the photo is not loaded. Missing or invalid input is shown at the field; why a sign-in failed (wrong email or password, account locked, account deactivated, restaurant deactivated, too many attempts) as an alert above the form. In development (`npm run dev`), the login page lists the demo accounts as a compact list with a badge for the role and one for the restaurant, and a click fills in the form; the production build does not contain them. `/admin` greets the admin and shows the setup checklist (see `GET /api/admin/setup-status`) with its progress, a link to the right page for every open step and a button that opens the restaurant's booking page in a new tab. The front desk has three tabs: "Today" (`/frontdesk`), "Reservations" (`/frontdesk/reservations`) and "Table overview" (`/frontdesk/tables`); a Tenant Admin finds the same reservations page under `/admin/reservations` in the sidebar, and `/admin` shows today's reservations, guests and open requests above the checklist. Both views show the open requests from today on (with accept and decline), the key figures of the day, a search by name, phone or reference, a status filter and the reservations grouped by start time with quick actions: mark as arrived, late, no-show, guest left, cancel, and undo (short labels with icons on tablets). Arrived and late are only offered on the reservation's day, no-show only from its start. Cancelling and no-show ask first, everywhere; after every status action a notification offers "Undo". The key figures also show the guests seated now and the no-shows. On today's page, "Walk-in" seats a guest without a reservation now: party size, a table free now (suggested, can be changed), optionally name, phone and note. A click on a reservation opens a drawer to change it; it offers only the tables that are free at the chosen time for the whole duration (`GET /api/staff/availability`), plus the reservation's current table. "New reservation" opens the same drawer for a phone reservation with the free times as chips, the suggested table and an optional duration override. The reservations page chooses its day with previous/next day, Today and a date picker; the day is kept in the address (`?date=YYYY-MM-DD`). The lists reload every minute, so new online bookings appear on their own. "Today" is taken in the restaurant's time zone (from `GET /api/public/restaurants/{slug}`). The status labels, colours and actions are defined once in `web/src/components/reservations/status.ts`, used by the lists, the table overview and the key figures. Under `/admin/opening-hours` a Tenant Admin maintains the weekly hours, the closing days and special hours (list of the upcoming entries; a modal with the date range, closed or special hours with time windows, and a note; after saving, a notice lists the reservations that lie in the period, with a link to the reservations page), the location and the public holidays. Under `/admin/reservation-settings` the card "Booking rules" sets lead time, booking horizon, buffer and the largest online party. Under `/admin/profile` a Tenant Admin maintains the restaurant profile. Under `/admin/design` ("Appearance") they design the restaurant's guest pages, see [Branding of the guest pages](#branding-of-the-guest-pages). Under `/admin/embed` they get the snippet to embed the booking in their website. Under `/admin/areas` a Tenant Admin manages the areas, uploads their floor plans, places the tables on them by drag and drop (mouse and touch) and sets the online quota per area. An area without floor plan image shows its tables in its drawn room (see below), where they are moved the same way; an image can still be uploaded below it ("Replace floor plan" once there is one). Below such a plan, the panel "Room" sets the room style (a select with a small preview of floor and boundary), adds elements from a palette of all kinds, each with its symbol (a new one appears in the middle of the room with its default size, at most 60), and offers "Suggest room" (`suggest-room`), which asks first because it replaces the elements and the table positions. Elements lie in the plan together with the tables and are moved like them with mouse and touch, and with the arrow keys in steps of 1 % of the plan; tables lie on top, so a click on both selects the table. A selected element shows its panel instead of the area's: kind (with symbol), length along the wall and width into the room as sliders (in % of the room width), "Turn by 90°", the label (at most 40 characters; required for a label element) and "Delete element". Every change of the room shows right away; the changes of a short time are saved together with `PUT /api/admin/areas/{id}/room`, like the table positions, and the panel shows "Saving…" or "Saved"; the API's error codes are translated. The area's panel also has the description (at most 200 characters, with a counter, saved with Save) and the photo (upload, replace and remove with preview, like logo and cover image on `/admin/design`; PNG, JPEG or WebP, at most 10 MB, saved as soon as it is uploaded or removed). New tables appear in the middle of an image, on a free place of the schematic plan. The table's panel sets number, seats, shape (round, square, rectangular) and "Turn by 90°" (rectangular tables only); the area's panel sets the table size (slider 50–200 %) and offers "Arrange automatically" (`arrange-tables`, also with an image), which asks first because it replaces the positions and is only available once the table size is saved. Shape, rotation and table size show in the plan right away and are kept with the panel's Save button. Deleting a table asks first. Under `/frontdesk/tables` and `/admin/tables` the table overview shows all tables and their reservations of a day, chosen with previous/next day, Today or a date picker: as a timeline (tables grouped by area × hours of the opening hours, reservations as blocks in their status colour, cancelled, declined and no-show ones faded, a guest who left ending at the time they left, a line at the current time, horizontally scrollable) or as the drawn plans of the areas (see below) with every table in the colour of its status at the time of a slider in 15-minute steps and the end of the current or the start of the next reservation under it. A click on a reservation shows its details and the same status actions as the lists. On today, a "Walk-in" button seats a walk-in, and on the floor plans a tap on a table that is free now offers "Seat walk-in here". The overview reloads every 60 seconds; it takes the day's opening hours from `GET /api/staff/availability`, and today and the current time in the restaurant's time zone. Day and view are kept in the address (`?date=YYYY-MM-DD`, `?view=floor`). Without sign-in, `/admin`, `/frontdesk` and `/superadmin` lead to `/login` and back to the requested page afterwards; a user without access to an area is sent to their own area. After signing in, a Tenant Admin lands on `/admin`, a Front desk user on `/frontdesk` and the Superadmin on `/superadmin`; the admin sidebar links to the front desk ("Open front desk"), and at the front desk a Tenant Admin finds "Go to management" in the account menu, which also shows the user's name and role.

The guest's table choice, the area editor and the table overview draw every area's plan with the same components in `web/src/components/floor-plan/`: `FloorPlan` is the floor plan image or, without one, the drawn room in the ratio 3:2 (`Room`, an SVG layer below the tables); it fits the width, keeps its aspect ratio, leaves room around it for tables that stick out over its edge, and zooms and pans with pinch and drag or the buttons + / − / reset below it (with `zoomControls="inside"`, as in the guest's table choice, in its lower right corner). The components do not depend on Mantine: the caller draws the zoom buttons (`zoomButton`, a component that gets label, icon, disabled state and click; the editor and the table overview pass `FloorPlanZoomButton`, a Mantine `ActionIcon`, so they look as before, the guest's table choice a `Button` of `web/src/ui/`), and the dark mode is a prop (`dark` on `FloorPlan` and `TableShape`, default light; the guest pages set it from the restaurant's `themeMode`). Inside a sheet the plan is not dragged by the sheet (`data-vaul-no-drag`). `TableShape` draws a table as a piece of furniture in its shape and size (seats × the area's table scale, relative to the plan width, with the constants of [Schematic floor plan](#schematic-floor-plan)), turned by 90° where set: the table top with a light sheen, its edge and a soft shadow, and a chair per seat, drawn from above with seat and backrest, the backrest away from the table (radial around round tables; on the sides of square tables, on the long sides of rectangular ones first), its number and its seats. The state colours of the callers stay as they are (the top and the seats in the fill colour, the edge and the backrests in the outline colour); a thin rim outside the edge, dark on light plans and light on dark ones, keeps the edge at least 3:1 against every floor, whatever the accent or status colour. Small tables take taps on an invisible area of at least 40 pixels. In the editor and the overview the tables can be used with the keyboard (Enter or Space).

`Room` draws an area without image in plan view like a rendered plan, so it holds its own next to an uploaded plan image: the floor of its room style as a texture (`Indoor` oak planks with a light grain and a tone per plank, `Terrace` stone slabs in a running bond with joints, tones and a fine grain, `Rooftop` a wooden deck with open joints and the screws on the joists, `Garden` gravel with a strip of lawn along the hedge), its boundary around the plan, outside the positions (`Indoor` solid walls with visible thickness and corners, `Terrace` a railing with posts on the slabs, `Rooftop` a glass parapet with clamps and glints on the deck, `Garden` a hedge of leaves with an uneven inner edge), and the shadow the boundary casts onto the floor. The light comes from the top left: walls, furniture and tables cast a soft shadow to the bottom right. `RoomElementShape` draws the elements as furniture from above, turned by their rotation with the back to the wall: `Entrance` an opening in the boundary with a threshold, the door leaf and its swing (in a garden a gap in the hedge with the gravel path through the lawn), `Window` an opening in the wall with its reveals, frame and glass lines, `Bar` the back bar with bottles, the counter top with its edge and round stools, `Plant` a crown of leaves in a round planter (in a garden a tree seen from above), `Pillar`, `Sofa` with backrest, armrests, seat cushions and two pillows, `Stage` a raised platform of boards with its step, `Stairs` the steps with handrails and the walking direction from a dot to the arrow, `Service` a counter with its pass and a sink and the label "Service" (or its own label, e.g. "Küche"), `Label` only its text; labels are set in calm small capitals and never upside down. An area without elements still shows the floor and the boundary of its style. The textures are SVG patterns of plain shapes (small shapes of one tone drawn as one path), without filters, images or group opacity, so zooming and panning stay smooth on phones. The room is the background: muted colours, light and dark (`useMantineColorScheme`, the dark room for dark guest pages), the accent colour belongs to the tables, so free, taken and chosen tables keep the strongest contrasts. Sizes and colours are in `layout.ts`, with the default sizes of the [Rooms](#rooms). The room is decorative: it does not take clicks or taps and is hidden from screen readers; the list of free tables stays the way for the keyboard and screen readers. An area with an image shows the image as before.

The drawn room always has the same size: at a table scale of 100 % a table for 4 is 7 % of its width, so with a table of about 80 cm the room is about 11 × 7.5 m. With about 20 tables it is well filled; with few tables (e.g. 4 to 8, or "Bašta" with 6) it looks empty. A larger table size in the area's panel (e.g. 150 %), followed by "Arrange automatically", fills it.

The booking page `/r/<slug>` shows the restaurant in its branding (see below), built with the design system (see [Design system](#design-system)), like the restaurant pages of Resy, OpenTable or Tock. At the top the cover image in the full width (about 60 % of the screen, at most 640 px; about 45 % on phones; in the small viewport height `svh`, so it does not jump when the browser's address bar comes and goes), cropped to fit, with a gradient towards the bottom; on it at the bottom left the name large in the display font (48–60 px on desktops), the city and a chip whether it is open today ("Open today · 17:00–24:00", "Closed today"; `openingStatus.ts`, from today's opening windows of `GET …/availability`, so public holidays, closing days and special hours count). Without cover image a calm band in the accent colour. The header lies transparently on the image with the logo (or the name) on the left and the language as a compact menu on the right; scrolling past the image it becomes fixed and opaque with a blur and adds "Reserve a table", which brings the reservation card into view and moves the focus to its heading.

Below it, from 1024 px on, a grid of 12 columns, at most 1200 px wide: on the left (7 columns) "About us" with the description, "Areas" as photo cards with name and description (the areas open for online booking from `GET /api/public/restaurants/{slug}`, only to show the place; where the guest chooses the table, the choice comes in the booking dialog), "Opening hours" as a list of the week with today stressed (when today differs from the regular hours, e.g. on a public holiday, today's row says so with today's actual hours; other special days are not shown, the public API does not deliver them) and "Directions & contact" (address with "Directions", a map search on Google Maps in a new tab, phone, email and website, one row each with a lucide icon); on the right (5 columns) the reservation card, which stays in view below the header (sticky). On phones the card comes right below the cover image, not sticky, the information after it, and once the card is scrolled out of view a bar "Reserve a table" appears at the bottom of the screen. While the restaurant loads, skeletons in the shape of the page keep the layout from jumping; the page never scrolls sideways.

The booking lets a guest book without an account:

- **Reservation card:** the party size (1–8 people one by one, then "More" with the larger parties up to `maxOnlinePartySize`, and "More than N people", which shows the hint to call with the restaurant's phone number) and the date side by side. The date opens a calendar in a popover (react-day-picker): closed days, past ones, those beyond the booking horizon and fully booked ones are disabled, fully booked ones also struck through; times within the restaurant's lead time are not offered. The booking starts with 2 people (fewer if the restaurant takes no more online) and the first day with a free time, loaded month by month from the calendar. Right below, without another click, the free times as chips, grouped by opening window ("Lunch 11:30–14:30"); a fully booked day offers the next free days. At the bottom of the card "Instant confirmation" or "Request – the restaurant confirms" and "Free cancellation through the link".
- **Booking dialog:** a click on a time opens a large dialog (about 960 px) from 768 px on, on phones a full-screen sheet (vaul). Its head shows the choices in short (people · date · time · table; people, date and time lead back to the card, the table to its step), the steps with the current one marked, and "Close". The dialog traps the focus, Escape closes it, and after every change of step the focus moves to the step's heading; closing it returns the focus to the chosen time's chip.
- **Table** (only when the guest chooses it; with "System assigns", the dialog starts at the contact details, so a booking with the presets is: time chip, form, "Book now"): from 768 px on the plan of the chosen area large on the left with the zoom buttons in its corner, and a column on the right with the areas as small cards with photo and "N tables free" (an area without a suitable free table is disabled and says "Fully booked"), the legend (free / your choice / not available), the chosen table ("Table R6 · up to 6 people · Rooftop"), "No preference" and "Continue". On phones the areas are chips above the plan in the full width, and the choice with "Continue" stays at the bottom of the screen. Free tables that fit the party are outlined boldly in the accent colour and lightly filled, the chosen one is filled with a check below it, the others are muted and hatched (`web/src/components/booking/tableLooks.ts`, in the tokens of the design system); hovering a table names it ("Table R6 · up to 6 people"). "No preference" chooses the smallest free table that fits, by the same rule as the system's assignment (see [Reservation rules](#reservation-rules)). "Show tables as a list", folded away below the plan, lists the free tables of the area as radio buttons: the way to choose with the keyboard and screen readers.
- **Contact details:** name, phone and email (it says that one of the two is enough) with the matching `autocomplete` and `inputmode`, and a note; errors appear at the field when the guest tries to book, and the focus moves to the first one. Below the fields what happens next: in the request mode that the restaurant reviews the request, and that the link from the booking cancels it until the start. The main button "Book now" or "Send request" shows a spinner while the booking is sent; on phones it stays at the bottom of the screen.
- **Confirmation:** a check that draws itself, with a few particles in the accent colour flying out once (or, for a request, a clock and "Request sent" with what happens next; without animation when the guest asked for less motion), then a card like a ticket, sliding up, with the reference code, date, time, people, table and area, and the address, and the actions "Add to calendar" (an `.ics` file made in the browser: title, start and end converted from the restaurant's time zone to UTC, address and the link), "Copy link" (the link to view and cancel the reservation, with the hint to save it), "Manage reservation" (the link, in a new tab, so it also works from an embedded booking) and "Directions".

Every view has one main action in the accent colour; touch targets are at least 44 px high. When the time or table is taken in the meantime (`slot_unavailable`, `table_unavailable`), the dialog closes and the card shows freshly loaded times with the message; too many bookings from one connection show the rate limit hint at the form, too many reads (calendar, times, tables) the general one with "Try again".

The booking so far is kept in the address (`?guests=…&date=…&time=…&table=…&step=…`, the contact details are not); the steps are `time` (the reservation card), `table` and `details`, and older links with `step=guests` or `step=date` land on `time`. A step after `time` means the dialog is open: the back button goes back step by step and closes the dialog at the time, a reload reopens it at the same step, and closing it returns through the history to the time step (each dialog entry knows how far back it is), so the back button does not reopen it. The presets are not written into the address: a plain link stays plain and asks for nothing, and only choosing a time writes party size and day. Invalid or outdated values (e.g. a day in the past) are dropped and the booking continues at the first step that is missing, and a time that is no longer free leads back to the time step with the known message. The logic is the hook `useBookingFlow` (`web/src/components/booking/useBookingFlow.ts`); `BookingFlow` shows it as card and dialog on `/r/<slug>` and as card and steps below it on `/embed/<slug>`. `?lang=` in the address sets the language of any page; it wins over the stored and the browser's language. The page uses the public endpoints through `web/src/api/publicBooking.ts`, its components are in `web/src/components/booking/`, and it sends the UI language as the reservation's `language`. A restaurant that is not bookable shows a card with the hint and its phone number instead of the reservation card, an unknown slug "Restaurant not found" with the way back to the start page.

The link from the confirmation, `/r/<slug>/reservation/<code>?t=<token>`, opens the guest's page "Your reservation" in any browser. It is built with the design system and branded like the booking page, whose header (logo and language menu) and footer it shares: below the header a narrow band of the cover image (the accent colour without one, almost black in the dark mode), on it a large status card with a symbol, a colour and a title per status, never by colour alone: confirmed, request sent (with the explanation that the restaurant still has to confirm it), cancelled ("You cancelled this reservation" or "The restaurant cancelled this reservation"), declined, and over (once its end has passed in the restaurant's time zone, whatever its status). Below it a details card as in the confirmation: the reference code with a copy button, date, time, party size, area, table and the guest's name, and the restaurant's address with "Directions", phone, email and website. Then the actions: "Add to calendar" (an .ics file, as in the confirmation) and, until the start, a quiet "Cancel" in the destructive colour that opens a dialog ("Really cancel?", a summary of the reservation, "Back" and "Cancel"); the dialog keeps the focus inside until it is closed. After the start the page shows the hint to call the restaurant, with its phone number. After cancelling, the status card confirms it (with the focus on its heading) and offers "Book again". A wrong restaurant, code or token shows one "reservation not found" page in the look of "not found", with the link to the start page. Staff see a reservation cancelled this way as "cancelled by the guest" in the reservation lists and the table overview.

#### Branding of the guest pages

A restaurant's guest pages, `/r/<slug>`, its confirmation and `/r/<slug>/reservation/<code>`, look like the restaurant, from its branding in `GET /api/public/restaurants/{slug}` (`web/src/api/branding.ts` has the types):

- **Theme:** `web/src/brandTheme.ts` builds a Mantine theme on top of the platform theme (`web/src/theme.ts`): a palette made from `brandColor` with `@mantine/colors-generator`, whose primary shade is the colour itself (buttons, the selection and the chosen table carry exactly that colour), the text on it chosen by contrast (`autoContrast`), light or dark from `themeMode`, and the fonts of `fontStyle`. Without branding the platform's colour, light mode and `Modern` apply. `web/src/components/BrandTheme.tsx` applies the theme with a nested `MantineProvider` whose CSS variables (`cssVariablesSelector`) and color scheme (`getRootElement`) are bound to its own element, not to the document; dropdowns and dialogs open inside it. So admin, front desk, Superadmin, login and the start page keep the platform theme, also after leaving a branded page.
- **Layout:** the header (`GuestLayout`, design system) lies transparently with white text on the full-width cover image (`RestaurantHeader`, with a gradient, name, city and on the booking page today's opening status) and becomes fixed and opaque with a blur further down; it shows the restaurant's logo (or, when solid and without logo, its name) on the left and the language as a compact menu on the right. Without cover image a calm band in the accent colour takes its place; a cover image that cannot be loaded shows the same band in the cover image's height. The staff sign-in and "Powered by cbplayground" are in a plain footer. The start page and "not found" keep the platform's header. `RestaurantHeader` is also the preview on `/admin/design`.
- **Contrast:** text keeps at least 4.5:1, large text and controls 3:1, in light and dark. On the guest pages Mantine's secondary ("dimmed") and error text are a step darker (light) or lighter (dark) than Mantine's default (`BrandTheme`), and a filled button in the accent colour gets darker under the pointer when its text is white, lighter when it is black (`filledHover`). The contact links of the booking page are in the text colour, so a light accent colour cannot make them illegible; text in the accent colour uses `primary-text`.
- **Logo:** shown without box, background or frame in a fixed height (40 px in the header, 32 px in the preview, 56–64 px on the start page), its width by its aspect ratio (`BrandLogo`). When it has loaded, the browser reads its four corner pixels on a canvas (the logo comes from the same origin, so this always works): a logo with an opaque background, e.g. a JPEG on white, stands on a calm surface tinted with the accent colour with generous padding, and its own background is blended into that surface (multiply on a light, screen on a dark background), so no white rectangle shows on a dark page. A PNG with a transparent background is recommended. A logo that cannot be loaded shows the name instead.
- **Images:** photos have a fixed frame (aspect ratio or height), so nothing jumps while they load: the frame shows a calm placeholder in the accent or surface colour, the photo fades in, and a photo that cannot be loaded (404, error) gives way to the same surface as without photo, never a broken image symbol (`Photo`). The cover image loads right away with high priority, all others lazily, all with `decoding="async"`. Photos that only accompany a name next to them have `alt=""`, area photos say what they show ("Area Rooftop").
- **Embed:** `/embed/<slug>` carries colour, fonts and light or dark mode, but no cover image, logo or information; the height messages and `?lang=` stay as they are.
- **Table choice:** free tables are outlined boldly in `primary` and lightly filled with it, the chosen one is filled with it (the number in `primary-foreground`) and has a check, taken or too small ones are hatched in `muted` and `input` with a `muted-foreground` outline (`web/src/components/booking/tableLooks.ts`, in the tokens, so light and dark follow by themselves); in the dark mode the drawn plan without image is dark too.
- **Fonts:** five pairs (heading / text), all self-hosted with `@fontsource` packages (OFL, no Google Fonts CDN) and covering Latin, Latin Extended and Cyrillic: `Modern` Inter / Inter, `Classic` Playfair Display / Source Sans 3, `Elegant` Cormorant Garamond / Montserrat, `Rustic` Merriweather / Open Sans, `Urban` Montserrat / Inter. They are loaded with a dynamic import only when a page uses them, so they are not part of the main bundle; the system fonts show until they are loaded.

`/admin/design` ("Appearance", Tenant Admins only) sets the accent colour (ten suggestions, hex input with picker, "Reset" back to the platform's colour; below a contrast of 3:1 to the background of the chosen mode a hint appears, saving is still possible), light or dark, the font pair (five cards with a sample in the restaurant's name) and logo and cover image (upload, replace and remove with preview; PNG, JPEG or WebP, logo at most 2 MB with the hint "PNG with a transparent background recommended", cover image at most 10 MB, landscape and at least 1600 pixels wide recommended). A live preview next to the form (below it on phones) shows the top of the booking page with the header (logo or name), the cover image with name and city, a sample button and a free and a chosen sample table, in the unsaved state. Colour, mode and fonts are kept with "Save"; logo and cover image are saved as soon as they are uploaded or removed. "View booking page" opens `/r/<slug>` in a new tab.

#### Superadmin

`/superadmin` lists all restaurants in a table with a status badge (active or deactivated), the number of admins, tables and upcoming reservations, and a search by name or slug. "Create restaurant" opens a form with name, slug (suggested from the name until it is changed by hand) and optionally country and federal state; afterwards the restaurant's page opens. `/superadmin/tenants/:id` shows the restaurant's master data and its admins: "Edit" changes name and slug, "Deactivate"/"Activate" asks first and says what happens, "View booking page" opens `/r/<slug>` in a new tab, "Add admin" creates a Tenant Admin with a start password, and each admin's menu sets a new password. The layout has the language switcher and the user menu with sign-out. A newly created admin can sign in right away and sees the setup checklist under `/admin`.

Before committing, run `npm run lint` (oxlint, the translation key check and the check for `@/` imports) and `npm run build` (typecheck and production build).

### Design system

The guest pages move to their own design system, built with **Tailwind CSS 4** (`@tailwindcss/postcss`) and **shadcn/ui** (Radix primitives, the components copied into the repository). The start page `/`, the login `/login`, "not found", the booking page `/r/<slug>` with the restaurant's header and footer (`GuestLayout`), the guest's page "Your reservation" and the embed `/embed/<slug>` use it; admin, front desk and Superadmin are still Mantine. "Your reservation" lays the design system's background over the layout's, so its cards stand out in the light and the dark mode. The styleguide `/dev/ui` is the reference.

**Stack:** `tailwindcss` 4, `@radix-ui/*`, `class-variance-authority`, `clsx` and `tailwind-merge` (`cn()` in `web/src/lib/utils.ts`), `lucide-react` (icons), `react-day-picker` (calendar), `vaul` (sheets) and `sonner` (toasts). The components live in `web/src/ui/` (file names as in shadcn/ui), the configuration of the shadcn CLI in `web/components.json`. Like the rest of the code they import relatively and with the file extension (`import { cn } from '../lib/utils.ts'`), never with an alias such as `@/`: there is none in `vite.config.ts` and the tsconfigs, so the frontend runs with every Vite configuration, also one without `resolve.alias`. `npm run lint` fails on every `@/` import under `web/src` and names its file and line.

**Tailwind runs through PostCSS:** Tailwind is a PostCSS plugin (`@tailwindcss/postcss` in `web/postcss.config.mjs`), not a Vite plugin. Vite loads the PostCSS configuration from the project folder `web/` by itself, whatever Vite configuration the frontend is started with (`vite.config.ts` or another one, e.g. the one ConnBridge starts its test packages with), as long as that configuration does not set `css.postcss` itself. A Vite plugin only runs with the configuration that lists it: without it the stylesheet stays unprocessed and the guest pages lose every utility class (everything stacked, huge icons, the texts for screen readers visible), while preflight and the fonts still arrive. Which files Tailwind scans for class names is fixed in `app.css` (`source('../')` on the import of the utilities, i.e. `web/src`, relative to the CSS file), so the scan does not depend on the folder Vite is started from. In development (`npm run dev`), `web/src/checkTailwind.ts` checks after the start whether a Tailwind class takes effect; if not, it logs an error in the console and shows a red bar at the top ("Tailwind-Styles fehlen – läuft PostCSS? Siehe README …"): check that `web/postcss.config.mjs` is there, that `npm install` has run and that the Vite configuration does not set `css.postcss`. The production build does not contain the check; without the PostCSS configuration `npm run build` fails instead (Lightning CSS cannot read `source(…)`).

**Layers:** `web/src/styles/app.css` is the only stylesheet; `main.tsx` imports it. It puts every style into a cascade layer, in this order:

```css
@layer theme, base, mantine, components, utilities;
```

`theme` holds Tailwind's variables, `base` Tailwind's preflight, `mantine` Mantine's styles (`@mantine/*/styles.layer.css`) and `utilities` Tailwind's classes. A later layer wins whatever the selector, so preflight never overrides Mantine and Mantine never overrides the classes of the new components. One known difference remains where Mantine leaves a property to the browser's default: preflight makes the background of a `<button>` transparent, so the colour swatches on `/admin/design` (a `ColorSwatch` as a button) lose the grey edge of the browser's button background in their anti-aliasing (1–3 of 255 steps at the edge pixels, not visible). The tokens themselves are plain CSS variables outside the layers.

**Tokens** (CSS variables in `app.css`, available as Tailwind classes through `@theme`):

- **Colours** after shadcn's naming: `background`, `foreground`, `card`, `popover`, `secondary`, `muted`, `muted-foreground`, `accent`, `border`, `input`, `ring`, `destructive`, `success`, `warning`, each with a light value and a dark one (class `dark`). The neutrals are Tailwind's **Stone**, a warm grey that suits restaurants and their warm accent colours better than the cool Zinc.
- **Accent colour:** `primary` (the restaurant's `brandColor`, without branding the platform's colour from `theme.ts`), `primary-foreground` (white or the dark text colour, whichever contrasts more after WCAG, with chroma-js), `primary-hover`, `primary-50` to `primary-900` (the ten shades of the same palette as the Mantine theme, for surfaces and hover) and `primary-text` (the shade closest to the accent colour with 4.5:1 on the page, for text and the focus ring), e.g. `bg-primary text-primary-foreground hover:bg-primary-hover`, `bg-primary-50`, `text-primary-text`.
- **Fonts:** `font-sans` (text) and `font-display` (headings, in the heading weight of the font pair) from the variables `--font-sans`, `--font-display` and `--font-display-weight`; the platform's fonts are the system fonts of `theme.ts`. The type scale is Tailwind's `text-xs` to `text-6xl` (12/14/16/18/20/24/30/36/48/60 px), with a line height of 1.5 for text, 1.1–1.25 for large headings and slightly tighter letter spacing from `text-3xl` on. Times and prices use `tabular-nums`.
- **Radii:** cards `rounded-xl` (12 px), fields and buttons `rounded-lg` (8 px), chips `rounded-full`.
- **Shadows:** `shadow-card`, `shadow-float` (popovers, menus), `shadow-dialog`: soft and in layers; in the dark mode none, the surfaces get lighter instead (`card`, `popover`).
- **Motion:** `--motion-fast` 150 ms (hover and press, the default of `transition`), `--motion-medium` 200 ms (closing, changes of step, panels), `--motion-slow` 300 ms (sheets, dialogs), `--motion-long` 600 ms (fading in on scroll), `--ease-out` and `--ease-spring` (a soft spring as `linear()`, a bezier like it where the browser has none) for what opens; `animate-fade-in`, `animate-dialog-in` (with the spring), `animate-pop-in` and their `-out`, `animate-rise`, `animate-slide-in` (from the right; `[--slide-from:-1.5rem]` from the left), `animate-hero-zoom`, `animate-shimmer`, and `animate-check-circle` / `animate-check-draw`. See **Motion** below.
- **Focus:** the class `focus-ring` gives everything that can be operated a visible ring of 2 px in `ring` at a distance of 2 px (`:focus-visible`).
- **Grid:** content at most 1200 px wide (`max-w-page`), spacing only from Tailwind's scale. The variant `touch:` applies on touch screens (`pointer: coarse`); there every control is at least 44 px high.

**Branding:** `BrandTheme` (`web/src/components/BrandTheme.tsx`) sets on its element the variables `primary*` (`primaryVariables()` in `web/src/brandTheme.ts`), `--font-sans`, `--font-display` and `--font-display-weight` (`fontVariables()`) and, for `themeMode = Dark`, the class `dark`. They apply inside its element only, like its Mantine theme; outside it (the start page) the platform's values from `app.css` apply. Popovers, selects, menus, dialogs, sheets and tooltips of `web/src/ui/` open inside the themed element (`ThemeRootContext`), so they carry its colours, fonts and mode. A card on the start page sets the `primary*` variables of its restaurant on itself.

**Components** in `web/src/ui/` (the motion in `web/src/ui/motion/`, see Motion below): `button` (variants `primary`, `secondary`, `outline`, `ghost`, `link`; sizes `sm`, `md`, `lg`, `icon`), `input`, `textarea`, `label`, `select` (with `SelectGroup`, `SelectLabel` and `SelectSeparator`), `popover`, `calendar` (in the user's language, weeks from Monday), `dialog`, `sheet` (vaul, from the bottom or with `direction="right"` from the side), `tabs`, `badge`, `card`, `skeleton`, `tooltip`, `separator` and `sonner` (`<Toaster />`, then `toast()` from `sonner`); and the own components of the guest pages: `photo` (fixed aspect ratio, placeholder, fading in, fallback), `language-menu` (globe and short code; `onChange` instead of switching and storing, as in the embed), `site-header` and `site-footer` (the platform's header and footer); and `alert` (a message in the page, e.g. why a sign-in failed or that a time has just been taken: variants `default`, `warning` and `destructive`, with an optional icon, `AlertTitle` and `AlertDescription`; announced by screen readers through `role="alert"` unless another role is given, e.g. `role="note"` for a lasting hint).

**Motion:** the guest pages move subtly, quickly and with a purpose, never playfully or in the way. The building blocks are mostly CSS (`app.css`) plus a few components in `web/src/ui/motion/`; no animation package (the allowed `motion` is not needed). Only `transform` (`translate`, `scale`), `opacity` and `filter` are animated, never layout properties (the focus ring's offset and colours change too, which only repaints). The look comes first: no effect is left out or reduced for a better Lighthouse score. The motion does not touch the layout (CLS) and keeps what is in the first screen visible right away (LCP); the performance score of the booking page is held back by other things (see Loading below).

- `Reveal` (`reveal.tsx`): a section or card below the first screen waits invisible and rises in once (600 ms, 1 rem upwards) when it is scrolled into view (IntersectionObserver). What is in the first screen when the page renders stays as it is, so the LCP does not wait. It passes its behaviour to its only child (Radix `Slot`): `<Reveal><section>…</section></Reveal>`. Used for the sections of the booking page (about us, areas, opening hours, contact) and the cards of "Your reservation".
- `Stagger` (`reveal.tsx`): the direct children of its child rise in one after another, 40 ms apart (at most 280 ms): right away when the list appears in view, otherwise when it is scrolled into view. Used for the free times and the next free days, the area cards and the name, city and status chip on the cover image.
- `ParallaxImage` (`parallax-image.tsx`): the cover image of the booking page. Once loaded, it zooms once from 1.06 to 1 over 1.2 s (`data-loaded:` on `Photo`); while the page scrolls past it, it moves down by up to 30 % of its height (slower than the content) and a shade darkens it. A scroll-driven animation (`animation-timeline: view()`, off the main thread) where the browser has it; elsewhere (Firefox) a passive scroll listener hands the progress to the CSS once per frame.
- `SuccessMark` (`success-mark.tsx`): the confirmed booking. The circle pops in with the spring, the check draws itself as an SVG stroke and eight small particles in the accent colour fly out once. The ticket card of the confirmation slides up after it (`animate-rise`).
- `press`: buttons (`Button`) and chips give way to 0.97 while pressed; it replaces `transition-colors`. `lift`: a photo card lifts by 4 px under the pointer while its photo zooms in its frame (`group-hover:scale-105` on the image). `pulse-ring`: a short ring in the accent colour around what was just chosen (a time, a table on the plan), once; the element needs a position. `focus-ring` glides in, with an animation that replaces any other animation of the element while it is focused: an entrance of something with a focus ring goes on a wrapper around it (as for "Reserve a table" in the header).
- The booking dialog and the sheet open with the spring; a new step slides in from the side it lies on (forward from the right, back from the left), the chosen table's details slide in, skeletons (`Skeleton`) shimmer softly instead of pulsing.
- **Page transitions:** the links between the start page, a restaurant's booking page and "Your reservation" (the cards of the start page, the restaurant's header logo, "powered by", "Book again") carry `viewTransition` (React Router, View Transitions API): the pages cross-fade, and the photo of the opened card moves into the cover image of the booking page as a shared element (`view-transition-name: restaurant-cover`, only on the card being opened, through `useViewTransitionState`); the band of "Your reservation" carries the same name. The row of the header with logo and language has its own name (`site-header`) and stays on top; the surface and the border of the header cross-fade with the page. The row, not the header: on both kinds of header it is the same size (at most 1200 px), so neither is scaled while one becomes the other, and a `view-transition-name` makes its element a backdrop root, so on the header the `backdrop-filter` of its blurred surface would only see the header instead of the page behind it. If the restaurant has not loaded yet when the page changes, the photo moves into the cover image's skeleton. Without the API the page simply changes.
- **Header:** on a restaurant's pages the opaque surface with its blur is a layer that fades in and out (300 ms) as the page scrolls past the cover image, and the text colour follows, instead of jumping.
- **Embed:** only press, the booking flow and the success moment; no Reveal, parallax or page transitions. As nothing changes the layout, the height the embed reports does not change while something moves.
- **Reduced motion:** with `prefers-reduced-motion: reduce` every animation and transition is off (also view transitions); only the immediate change of state remains, everything is visible and operable right away. The same applies inside an element with the attribute `data-reduce-motion`: the styleguide's switch "Simulate reduced motion" sets it on the document. Tailwind's variants `motion-reduce:` and `motion-safe:` (overridden in `app.css`) know both.

**Styleguide:** `/dev/ui` shows all tokens and components, in light and dark, switchable between "without branding" and the brandings of the three demo restaurants. Its section "Motion" shows every motion building block, with the switch "Simulate reduced motion" and "Play again". It only exists in development (`npm run dev`); the production build contains neither the route nor the page (like the demo accounts on `/login`).

**Loading:** only the start page is part of the main bundle; every other page and its layout (`web/src/router.tsx`, `lazy`) is loaded when its route is first visited, so the start page does not carry the code of the restaurant's pages, the admin area, the front desk and the Superadmin. On the start page, Lighthouse (mobile) is held back by the cover images: the API delivers them as uploaded (the demo covers 400–570 KB), and the first one is the largest element of the page. Without them the page scores 98 for performance; smaller variants of the images for the cards are still open. On `/r/rooftop-belvedere` and `/r/zur-linde` (production build, `vite preview`, Lighthouse mobile) accessibility is 100 and CLS below 0.05, performance about 43 (as before the booking page moved to the design system): the main bundle still carries Mantine for every page (`App.tsx`), and the cover image is the largest element.

**Add a shadcn component:**

1. In `web`, run `npx shadcn@latest add <name>` (e.g. `accordion`). The CLI reads `components.json` and writes the file to `web/src/ui/`; it may ask to install its Radix package. Packages beyond those listed under Stack need agreement first.
2. Make the imports relative: the CLI always writes its imports with the aliases of `components.json` (e.g. `import { Separator } from "src/ui/separator"`), which do not resolve. Change them to relative imports with the file extension, e.g. `import { Separator } from './separator.tsx'`.
3. Fit it to the tokens: colours only from the tokens above (no `zinc-*`/`neutral-*`), `rounded-lg` for fields and buttons and `rounded-xl` for surfaces, `focus-ring` on everything that can be operated, `touch:` heights of at least 44 px, animations from the motion tokens; a part that opens in a portal gets `container={useContext(ThemeRootContext)}`. The registry currently writes `import { cn } from "cn"` and imports from the umbrella package `radix-ui`: change them to `import { cn } from '../lib/utils.ts'` and the single `@radix-ui/react-<name>` package (and remove `radix-ui` from `package.json` again); classes of `tw-animate-css` (`animate-in`, `fade-in-0` …) become the motion tokens.
4. Visible texts come from the translations (`t()`), also labels for screen readers.
5. Show it in the styleguide (`web/src/pages/StyleguidePage.tsx`) in light and dark, and run `npm run lint` and `npm run build`.

### Translations

The UI texts live in `web/src/i18n/locales/`, one file per language: `en.json`, `de.json`, `sr-Latn.json` and `sr-Cyrl.json`. Code never contains visible text; it uses keys such as `t('home.title')`. `en.json` is the reference: the keys used in code are typed after it, so an unknown key fails the typecheck.

Add a key:

1. Add the key with its text to all four files. Serbian Cyrillic is maintained by hand, not transliterated from the Latin file.
2. Use it in a component with `const { t } = useTranslation()` and `t('section.key')`.
3. Run `npm run lint`. It reports every key that is missing in a file or not present in `en.json`.

Texts with a number use i18next plurals: pass `count` (`t('reservations.list.groupGuests', { count })`) and give the key one entry per plural form of the language, e.g. `groupGuests_one` and `groupGuests_other` in English and German, `groupGuests_one`, `groupGuests_few` and `groupGuests_other` in Serbian. `npm run lint` checks that every plural key has exactly the forms of its file's language (`Intl.PluralRules`).

Dates and times are formatted in one place, `web/src/i18n/format.ts` (`formatShortDate`, `formatDate`, `formatLongDate`, `formatTime`), with `Intl` in the user's language; the closing time `24:00` stays "24:00" in German and Serbian and is "midnight" in English, never "12:00 AM". Date pickers use `datePickerFormatter` from the same file. Every page sets its browser tab title with `useDocumentTitle` (`web/src/i18n/title.ts`), e.g. "Table overview · Gasthaus zur Linde".

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
