using System.Text.RegularExpressions;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The Superadmin manages the restaurants: lists, creates, renames, deactivates and activates them, and sets up their Tenant Admins.
/// Restaurants are never deleted. The Superadmin belongs to no restaurant, so the tenant query filters return nothing for them:
/// <see cref="Tenant"/> and <see cref="ApplicationUser"/> are not tenant-owned and are read without filter, the tenant-owned
/// key figures (tables, setup steps, reservations) use <c>IgnoreQueryFilters()</c> (justified where used). Nothing tenant-owned is written here.
/// Failed requests are answered with <c>{ "error": "..." }</c>; the codes are listed at the request types.
/// </summary>
public static partial class SuperadminEndpoints
{
    /// <summary>
    /// A restaurant with its key figures: <see cref="AdminCount"/> active Tenant Admins, <see cref="StaffCount"/> active staff users
    /// (all roles), <see cref="TableCount"/> tables, <see cref="UpcomingReservationCount"/> reservations that start from now on,
    /// <see cref="ReservationsLast7Days"/> in the 7 days before now and <see cref="ReservationsNext7Days"/> in the 7 days from now
    /// (all in the restaurant's time zone, none of them cancelled or declined), the steps of its <see cref="Setup"/> (as
    /// <c>GET /api/admin/setup-status</c>), when the last online booking was made and when one of its staff last signed in (UTC, null if never).
    /// </summary>
    public record SuperadminTenant(
        Guid Id,
        string Name,
        string Slug,
        string? CountryCode,
        string? RegionCode,
        bool IsActive,
        DateTime CreatedAt,
        int AdminCount,
        int StaffCount,
        int TableCount,
        int UpcomingReservationCount,
        ProfileEndpoints.SetupStatusResponse Setup,
        int ReservationsLast7Days,
        int ReservationsNext7Days,
        DateTime? LastOnlineBookingAtUtc,
        DateTime? LastStaffSignInAtUtc);

    /// <summary>
    /// A new restaurant; country and region are optional. Errors (400): "invalid_name", "invalid_slug", "invalid_country",
    /// "region_required", "invalid_region", "region_not_allowed"; (409): "slug_taken".
    /// </summary>
    public record CreateTenantRequest(string? Name, string? Slug, string? CountryCode, string? RegionCode);

    /// <summary>Errors (400): "invalid_name", "invalid_slug"; (409): "slug_taken".</summary>
    public record UpdateTenantRequest(string? Name, string? Slug);

    public record TenantAdminUser(string Id, string Email, string DisplayName, bool IsActive);

    /// <summary>Errors (400): "invalid_email", "invalid_name", "password_too_weak"; (409): "email_taken".</summary>
    public record CreateAdminRequest(string? Email, string? DisplayName, string? Password);

    /// <summary>Errors (400): "password_too_weak".</summary>
    public record SetPasswordRequest(string? Password);

    /// <summary>Lower-case letters and digits, in groups separated by single hyphens, e.g. "zur-linde".</summary>
    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")]
    private static partial Regex SlugPattern();

    public static void MapSuperadminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/superadmin/tenants").RequireAuthorization(Policies.RequireSuperadmin);

        group.MapGet("/", async (AppDbContext db, TimeProvider timeProvider) =>
        {
            var tenants = await db.Tenants.OrderBy(t => t.Name).ToListAsync();
            return await ToResponsesAsync(db, tenants, timeProvider);
        });

        group.MapPost("/", async (CreateTenantRequest request, AppDbContext db, TimeProvider timeProvider) =>
        {
            var name = request.Name?.Trim() ?? "";
            var slug = NormalizeSlug(request.Slug);
            var countryCode = string.IsNullOrEmpty(request.CountryCode) ? null : request.CountryCode;
            var regionCode = string.IsNullOrEmpty(request.RegionCode) ? null : request.RegionCode;
            if (ValidateNameAndSlug(name, slug) is { } error)
            {
                return BadRequest(error);
            }
            if ((countryCode is not null || regionCode is not null) && Locations.Validate(countryCode, regionCode) is { } locationError)
            {
                return BadRequest(locationError);
            }

            // Check and insert in one transaction, so two requests cannot both take the slug (the unique index would throw).
            await using var transaction = await db.Database.BeginTransactionAsync();
            if (await db.Tenants.AnyAsync(t => t.Slug == slug))
            {
                return Conflict("slug_taken");
            }
            var tenant = new Tenant
            {
                Name = name,
                Slug = slug,
                CreatedAt = DateTime.UtcNow,
                CountryCode = countryCode,
                RegionCode = regionCode,
                TimeZoneId = countryCode is null ? null : Locations.TimeZones[countryCode],
            };
            db.Tenants.Add(tenant);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();

            return Results.Created($"/api/superadmin/tenants/{tenant.Id}", await ToResponseAsync(db, tenant, timeProvider));
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateTenantRequest request, AppDbContext db, TimeProvider timeProvider) =>
        {
            var name = request.Name?.Trim() ?? "";
            var slug = NormalizeSlug(request.Slug);
            if (ValidateNameAndSlug(name, slug) is { } error)
            {
                return BadRequest(error);
            }

            await using var transaction = await db.Database.BeginTransactionAsync();
            var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Id == id);
            if (tenant is null)
            {
                return Results.NotFound();
            }
            if (await db.Tenants.AnyAsync(t => t.Slug == slug && t.Id != id))
            {
                return Conflict("slug_taken");
            }
            tenant.Name = name;
            tenant.Slug = slug;
            await db.SaveChangesAsync();
            await transaction.CommitAsync();

            return Results.Ok(await ToResponseAsync(db, tenant, timeProvider));
        });

        group.MapPost("/{id:guid}/deactivate", async (Guid id, AppDbContext db, UserManager<ApplicationUser> userManager, TimeProvider timeProvider) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Id == id);
            if (tenant is null)
            {
                return Results.NotFound();
            }

            if (tenant.IsActive)
            {
                tenant.IsActive = false;
                await db.SaveChangesAsync();

                // A new security stamp ends the existing sessions of the restaurant's staff on their next request (see Program.cs);
                // signing in again is refused while the restaurant is deactivated (AuthEndpoints).
                foreach (var user in await db.Users.Where(u => u.TenantId == id).ToListAsync())
                {
                    var updated = await userManager.UpdateSecurityStampAsync(user);
                    if (!updated.Succeeded)
                    {
                        throw new InvalidOperationException($"Could not end the sessions of user {user.Id}: {string.Join(" ", updated.Errors.Select(e => e.Code))}");
                    }
                }
            }
            await transaction.CommitAsync();

            return Results.Ok(await ToResponseAsync(db, tenant, timeProvider));
        });

        group.MapPost("/{id:guid}/activate", async (Guid id, AppDbContext db, TimeProvider timeProvider) =>
        {
            var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Id == id);
            if (tenant is null)
            {
                return Results.NotFound();
            }

            if (!tenant.IsActive)
            {
                tenant.IsActive = true;
                await db.SaveChangesAsync();
            }

            return Results.Ok(await ToResponseAsync(db, tenant, timeProvider));
        });

        group.MapGet("/{id:guid}/admins", async (Guid id, AppDbContext db) =>
        {
            if (!await db.Tenants.AnyAsync(t => t.Id == id))
            {
                return Results.NotFound();
            }
            return Results.Ok(await TenantAdminsOf(db, id)
                .OrderBy(u => u.DisplayName)
                .Select(u => new TenantAdminUser(u.Id, u.Email!, u.DisplayName, u.IsActive))
                .ToListAsync());
        });

        group.MapPost("/{id:guid}/admins", async (Guid id, CreateAdminRequest request, AppDbContext db, UserManager<ApplicationUser> userManager) =>
        {
            if (!await db.Tenants.AnyAsync(t => t.Id == id))
            {
                return Results.NotFound();
            }
            var email = request.Email?.Trim() ?? "";
            var displayName = request.DisplayName?.Trim() ?? "";
            if (email.Length == 0)
            {
                return BadRequest("invalid_email");
            }
            if (displayName.Length == 0)
            {
                return BadRequest("invalid_name");
            }

            await using var transaction = await db.Database.BeginTransactionAsync();
            var user = new ApplicationUser
            {
                UserName = email,
                Email = email,
                DisplayName = displayName,
                TenantId = id,
            };
            var created = await userManager.CreateAsync(user, request.Password ?? "");
            if (!created.Succeeded)
            {
                return StaffEndpoints.IdentityError(created);
            }
            var addedToRole = await userManager.AddToRoleAsync(user, Roles.TenantAdmin);
            if (!addedToRole.Succeeded)
            {
                return StaffEndpoints.IdentityError(addedToRole);
            }
            await transaction.CommitAsync();

            return Results.Created($"/api/superadmin/tenants/{id}/admins/{user.Id}", new TenantAdminUser(user.Id, user.Email, user.DisplayName, user.IsActive));
        });

        group.MapPost("/{id:guid}/admins/{userId}/password", async (Guid id, string userId, SetPasswordRequest request, AppDbContext db, UserManager<ApplicationUser> userManager) =>
        {
            var user = await TenantAdminsOf(db, id).SingleOrDefaultAsync(u => u.Id == userId);
            if (user is null)
            {
                return Results.NotFound();
            }

            // Resetting with a token validates the new password and replaces the old one in a single update.
            // It also renews the security stamp, which ends the admin's sessions.
            var token = await userManager.GeneratePasswordResetTokenAsync(user);
            var reset = await userManager.ResetPasswordAsync(user, token, request.Password ?? "");
            if (!reset.Succeeded)
            {
                return StaffEndpoints.IdentityError(reset);
            }
            return Results.NoContent();
        });
    }

    private static string NormalizeSlug(string? slug) => slug?.Trim().ToLowerInvariant() ?? "";

    private static string? ValidateNameAndSlug(string name, string slug)
    {
        if (name.Length == 0 || name.Length > Tenant.MaxNameLength)
        {
            return "invalid_name";
        }
        if (slug.Length > Tenant.MaxSlugLength || !SlugPattern().IsMatch(slug))
        {
            return "invalid_slug";
        }
        return null;
    }

    /// <summary>The Tenant Admins of all restaurants, active or not.</summary>
    private static IQueryable<ApplicationUser> TenantAdmins(AppDbContext db) =>
        db.Users.Where(u => u.TenantId != null
            && db.UserRoles.Any(ur => ur.UserId == u.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == Roles.TenantAdmin)));

    /// <summary>The Tenant Admins of a restaurant, active or not.</summary>
    private static IQueryable<ApplicationUser> TenantAdminsOf(AppDbContext db, Guid tenantId) =>
        TenantAdmins(db).Where(u => u.TenantId == tenantId);

    private static async Task<SuperadminTenant> ToResponseAsync(AppDbContext db, Tenant tenant, TimeProvider timeProvider) =>
        (await ToResponsesAsync(db, [tenant], timeProvider)).Single();

    /// <summary>
    /// The restaurants with their key figures, in the order given. Reads them with the same fixed number of queries for any number
    /// of restaurants, each restricted to the given restaurants and grouped by restaurant.
    /// </summary>
    private static async Task<List<SuperadminTenant>> ToResponsesAsync(AppDbContext db, IReadOnlyList<Tenant> tenants, TimeProvider timeProvider)
    {
        if (tenants.Count == 0)
        {
            return [];
        }
        var ids = tenants.Select(t => t.Id).ToList();

        var adminCounts = await TenantAdmins(db)
            .Where(u => u.IsActive && ids.Contains(u.TenantId!.Value))
            .GroupBy(u => u.TenantId!.Value)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count);
        var staff = await db.Users
            .Where(u => u.TenantId != null && ids.Contains(u.TenantId.Value))
            .GroupBy(u => u.TenantId!.Value)
            .Select(g => new { TenantId = g.Key, ActiveCount = g.Count(u => u.IsActive), LastSignInAtUtc = g.Max(u => u.LastSignInAtUtc) })
            .ToDictionaryAsync(x => x.TenantId);

        // IgnoreQueryFilters (here and below): the Superadmin has no tenant, so the tenant filter would hide every row of the
        // restaurants. Every query is restricted to the given restaurants explicitly, grouped by restaurant, and only reads.
        // Archived tables do not count, neither here nor for the setup step.
        var tableCounts = await db.Tables.IgnoreQueryFilters()
            .Where(t => ids.Contains(t.TenantId) && t.ArchivedAtUtc == null)
            .GroupBy(t => t.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count);
        // IgnoreQueryFilters: which restaurants have opening hours, for their setup steps (read only, see above).
        var withOpeningHours = (await db.OpeningPeriods.IgnoreQueryFilters()
            .Where(p => ids.Contains(p.TenantId)).Select(p => p.TenantId).Distinct().ToListAsync()).ToHashSet();
        // IgnoreQueryFilters: which restaurants have an area with a floor plan image, or a drawn room with a table, for their setup
        // steps (read only, see above).
        var withFloorPlan = (await db.Areas.IgnoreQueryFilters()
            .Where(a => ids.Contains(a.TenantId) && a.ArchivedAtUtc == null
                && (a.FloorPlanFileName != null || db.Tables.IgnoreQueryFilters().Any(t => t.AreaId == a.Id && t.ArchivedAtUtc == null)))
            .Select(a => a.TenantId).Distinct().ToListAsync()).ToHashSet();
        // IgnoreQueryFilters: which restaurants have saved their reservation settings, for their setup steps (read only, see above).
        var withReservationSettings = (await db.ReservationSettings.IgnoreQueryFilters()
            .Where(r => ids.Contains(r.TenantId)).Select(r => r.TenantId).Distinct().ToListAsync()).ToHashSet();
        // IgnoreQueryFilters: the newest online booking of each restaurant, whatever became of it (read only, see above).
        var lastOnlineBookings = await db.Reservations.IgnoreQueryFilters()
            .Where(r => ids.Contains(r.TenantId) && r.Source == ReservationSource.Online)
            .GroupBy(r => r.TenantId)
            .Select(g => new { TenantId = g.Key, CreatedAtUtc = g.Max(r => r.CreatedAtUtc) })
            .ToDictionaryAsync(x => x.TenantId, x => x.CreatedAtUtc);

        // The reservations are counted from each restaurant's local now. The starts between the earliest of these nows minus 7 days
        // and the latest plus 7 days are read and counted per restaurant here; those after it are upcoming for every restaurant
        // and only counted by the database.
        var utcNow = timeProvider.GetUtcNow().UtcDateTime;
        var localNows = tenants.ToDictionary(t => t.Id, t => t.TimeZoneId is null ? utcNow : TimeZoneInfo.ConvertTimeBySystemTimeZoneId(utcNow, t.TimeZoneId));
        var windowStart = localNows.Values.Min().AddDays(-7);
        var windowEnd = localNows.Values.Max().AddDays(7);
        // IgnoreQueryFilters: the reservations of the restaurants, for their counts (read only, see above).
        var counted = db.Reservations.IgnoreQueryFilters().Where(r =>
            ids.Contains(r.TenantId)
            && r.Status != ReservationStatus.Cancelled
            && r.Status != ReservationStatus.Declined);
        var startsInWindow = (await counted
            .Where(r => r.StartLocal >= windowStart && r.StartLocal < windowEnd)
            .Select(r => new { r.TenantId, r.StartLocal })
            .ToListAsync()).ToLookup(r => r.TenantId, r => r.StartLocal);
        var countsAfterWindow = await counted
            .Where(r => r.StartLocal >= windowEnd)
            .GroupBy(r => r.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count);

        return tenants.Select(tenant =>
        {
            var localNow = localNows[tenant.Id];
            var starts = startsInWindow[tenant.Id];
            var tenantStaff = staff.GetValueOrDefault(tenant.Id);
            DateTime? lastOnlineBooking = lastOnlineBookings.TryGetValue(tenant.Id, out var createdAtUtc) ? AsUtc(createdAtUtc) : null;
            return new SuperadminTenant(
                tenant.Id,
                tenant.Name,
                tenant.Slug,
                tenant.CountryCode,
                tenant.RegionCode,
                tenant.IsActive,
                AsUtc(tenant.CreatedAt),
                adminCounts.GetValueOrDefault(tenant.Id),
                tenantStaff?.ActiveCount ?? 0,
                tableCounts.GetValueOrDefault(tenant.Id),
                starts.Count(start => start >= localNow) + countsAfterWindow.GetValueOrDefault(tenant.Id),
                // The same steps as GET /api/admin/setup-status (ProfileEndpoints).
                new ProfileEndpoints.SetupStatusResponse(
                    Profile: tenant is { Street: not null, PostalCode: not null, City: not null, Phone: not null },
                    Location: tenant.CountryCode is not null,
                    OpeningHours: withOpeningHours.Contains(tenant.Id),
                    FloorPlan: withFloorPlan.Contains(tenant.Id),
                    Tables: tableCounts.ContainsKey(tenant.Id),
                    ReservationSettings: withReservationSettings.Contains(tenant.Id)),
                starts.Count(start => start >= localNow.AddDays(-7) && start < localNow),
                starts.Count(start => start >= localNow && start < localNow.AddDays(7)),
                lastOnlineBooking,
                tenantStaff?.LastSignInAtUtc is { } lastSignIn ? AsUtc(lastSignIn) : null);
        }).ToList();
    }

    /// <summary>SQLite returns a stored UTC time without its kind; marks it, so the JSON carries the "Z".</summary>
    private static DateTime AsUtc(DateTime utc) => DateTime.SpecifyKind(utc, DateTimeKind.Utc);

    private static IResult BadRequest(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);

    private static IResult Conflict(string error) => ErrorResponse.Result(error, StatusCodes.Status409Conflict);
}
