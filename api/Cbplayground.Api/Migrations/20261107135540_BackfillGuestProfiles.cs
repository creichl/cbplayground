using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cbplayground.Api.Migrations
{
    /// <summary>
    /// The guest profiles of the reservations made before them (AddGuestProfiles), in a migration of its own, so the data is
    /// written after the table of the reservations has been rebuilt with its new foreign key.
    /// </summary>
    public partial class BackfillGuestProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // One guest per restaurant and phone number, otherwise email address, as GuestProfiles.LinkAsync links them; the
            // phone numbers normalised as GuestProfiles.NormalizePhone does it, the email addresses in lower case.
            migrationBuilder.Sql("""
                CREATE TABLE "GuestBackfill" AS
                SELECT "ReservationId", "TenantId", "Name", "CreatedAtUtc",
                    CASE
                        WHEN "Digits" = '' THEN NULL
                        WHEN substr("RawPhone", 1, 1) = '+' THEN '+' || "Digits"
                        WHEN substr("Digits", 1, 2) = '00' THEN '+' || substr("Digits", 3)
                        WHEN substr("Digits", 1, 1) = '0' AND "CountryCode" = 'DE' THEN '+49' || substr("Digits", 2)
                        WHEN substr("Digits", 1, 1) = '0' AND "CountryCode" = 'AT' THEN '+43' || substr("Digits", 2)
                        WHEN substr("Digits", 1, 1) = '0' AND "CountryCode" = 'RS' THEN '+381' || substr("Digits", 2)
                        ELSE "Digits"
                    END AS "Phone",
                    "Email"
                FROM (
                    SELECT r."Id" AS "ReservationId", r."TenantId", r."GuestName" AS "Name", r."CreatedAtUtc", t."CountryCode",
                        trim(coalesce(r."GuestPhone", '')) AS "RawPhone",
                        replace(replace(replace(replace(replace(replace(replace(coalesce(r."GuestPhone", ''),
                            ' ', ''), '-', ''), '/', ''), '.', ''), '(', ''), ')', ''), '+', '') AS "Digits",
                        nullif(lower(trim(coalesce(r."GuestEmail", ''))), '') AS "Email"
                    FROM "Reservations" r JOIN "Tenants" t ON t."Id" = r."TenantId"
                );
                DELETE FROM "GuestBackfill" WHERE "Phone" IS NULL AND "Email" IS NULL;

                -- A guest for every phone number, named as at its first reservation (a walk-in's "Walk-in" only when there is no other name).
                INSERT INTO "Guests" ("Id", "TenantId", "Name", "Phone", "Tags", "CreatedAtUtc", "UpdatedAtUtc")
                SELECT {{NewId}}, b."TenantId",
                    (SELECT b2."Name" FROM "GuestBackfill" b2 WHERE b2."TenantId" = b."TenantId" AND b2."Phone" = b."Phone"
                     ORDER BY b2."Name" = 'Walk-in', b2."CreatedAtUtc", b2."ReservationId" LIMIT 1),
                    b."Phone", '[]', min(b."CreatedAtUtc"), min(b."CreatedAtUtc")
                FROM "GuestBackfill" b WHERE b."Phone" IS NOT NULL
                GROUP BY b."TenantId", b."Phone";

                -- Its email address: the first one given with the phone number, unless an older guest has it.
                CREATE TABLE "GuestBackfillEmails" AS
                SELECT g."Id", g."TenantId", g."CreatedAtUtc",
                    (SELECT b."Email" FROM "GuestBackfill" b
                     WHERE b."TenantId" = g."TenantId" AND b."Phone" = g."Phone" AND b."Email" IS NOT NULL
                     ORDER BY b."CreatedAtUtc", b."ReservationId" LIMIT 1) AS "Email"
                FROM "Guests" g;
                UPDATE "Guests" SET "Email" = (
                    SELECT e."Email" FROM "GuestBackfillEmails" e
                    WHERE e."Id" = "Guests"."Id" AND NOT EXISTS (
                        SELECT 1 FROM "GuestBackfillEmails" e2
                        WHERE e2."TenantId" = e."TenantId" AND e2."Email" = e."Email"
                            AND (e2."CreatedAtUtc" < e."CreatedAtUtc" OR (e2."CreatedAtUtc" = e."CreatedAtUtc" AND e2."Id" < e."Id"))));
                DROP TABLE "GuestBackfillEmails";

                -- A guest for every email address of reservations without a phone number that no guest has yet.
                INSERT INTO "Guests" ("Id", "TenantId", "Name", "Email", "Tags", "CreatedAtUtc", "UpdatedAtUtc")
                SELECT {{NewId}}, b."TenantId",
                    (SELECT b2."Name" FROM "GuestBackfill" b2 WHERE b2."TenantId" = b."TenantId" AND b2."Phone" IS NULL AND b2."Email" = b."Email"
                     ORDER BY b2."Name" = 'Walk-in', b2."CreatedAtUtc", b2."ReservationId" LIMIT 1),
                    b."Email", '[]', min(b."CreatedAtUtc"), min(b."CreatedAtUtc")
                FROM "GuestBackfill" b
                WHERE b."Phone" IS NULL AND b."Email" IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM "Guests" g WHERE g."TenantId" = b."TenantId" AND g."Email" = b."Email")
                GROUP BY b."TenantId", b."Email";

                -- The links: by the phone number, otherwise by the email address.
                UPDATE "Reservations" SET "GuestId" = coalesce(
                    (SELECT g."Id" FROM "GuestBackfill" b JOIN "Guests" g ON g."TenantId" = b."TenantId" AND g."Phone" = b."Phone"
                     WHERE b."ReservationId" = "Reservations"."Id"),
                    (SELECT g."Id" FROM "GuestBackfill" b JOIN "Guests" g ON g."TenantId" = b."TenantId" AND g."Email" = b."Email"
                     WHERE b."ReservationId" = "Reservations"."Id"));

                DROP TABLE "GuestBackfill";
                """.Replace("{{NewId}}", NewId));
        }

        /// <summary>
        /// A new GUID in SQL, in upper case as EF Core stores them in SQLite: random, version 4.
        /// </summary>
        private const string NewId = """
            (hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-'
                || substr('89AB', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))
            """;

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""UPDATE "Reservations" SET "GuestId" = NULL; DELETE FROM "Guests";""");
        }
    }
}
