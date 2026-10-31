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
/// counts use <c>IgnoreQueryFilters()</c> (justified where used). Nothing tenant-owned is written here.
/// Failed requests are answered with <c>{ "error": "..." }</c>; the codes are listed at the request types.
/// </summary>
public static partial class SuperadminEndpoints
{
    /// <summary>
    /// A restaurant with its key figures: <see cref="AdminCount"/> active Tenant Admins, <see cref="TableCount"/> tables and
    /// <see cref="UpcomingReservationCount"/> reservations that start from now on (in the restaurant's time zone) and are not cancelled or declined.
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
        int TableCount,
        int UpcomingReservationCount);

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

        group.MapGet("/", async (AppDbContext db) =>
        {
            var tenants = await db.Tenants.OrderBy(t => t.Name).ToListAsync();
            var result = new List<SuperadminTenant>();
            foreach (var tenant in tenants)
            {
                result.Add(await ToResponseAsync(db, tenant));
            }
            return result;
        });

        group.MapPost("/", async (CreateTenantRequest request, AppDbContext db) =>
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

            return Results.Created($"/api/superadmin/tenants/{tenant.Id}", await ToResponseAsync(db, tenant));
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateTenantRequest request, AppDbContext db) =>
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

            return Results.Ok(await ToResponseAsync(db, tenant));
        });

        group.MapPost("/{id:guid}/deactivate", async (Guid id, AppDbContext db, UserManager<ApplicationUser> userManager) =>
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

            return Results.Ok(await ToResponseAsync(db, tenant));
        });

        group.MapPost("/{id:guid}/activate", async (Guid id, AppDbContext db) =>
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

            return Results.Ok(await ToResponseAsync(db, tenant));
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

    /// <summary>The Tenant Admins of a restaurant, active or not.</summary>
    private static IQueryable<ApplicationUser> TenantAdminsOf(AppDbContext db, Guid tenantId) =>
        db.Users.Where(u => u.TenantId == tenantId
            && db.UserRoles.Any(ur => ur.UserId == u.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == Roles.TenantAdmin)));

    private static async Task<SuperadminTenant> ToResponseAsync(AppDbContext db, Tenant tenant)
    {
        var adminCount = await TenantAdminsOf(db, tenant.Id).CountAsync(u => u.IsActive);

        // IgnoreQueryFilters: the Superadmin has no tenant, so the tenant filter would hide every table and reservation.
        // Both counts are restricted to this restaurant explicitly and only read.
        var tableCount = await db.Tables.IgnoreQueryFilters().CountAsync(t => t.TenantId == tenant.Id);
        var localNow = tenant.TimeZoneId is null
            ? DateTime.UtcNow
            : TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, tenant.TimeZoneId);
        var upcomingReservationCount = await db.Reservations.IgnoreQueryFilters().CountAsync(r =>
            r.TenantId == tenant.Id
            && r.StartLocal >= localNow
            && r.Status != ReservationStatus.Cancelled
            && r.Status != ReservationStatus.Declined);

        return new SuperadminTenant(
            tenant.Id,
            tenant.Name,
            tenant.Slug,
            tenant.CountryCode,
            tenant.RegionCode,
            tenant.IsActive,
            // SQLite returns the stored UTC time without its kind; mark it, so the JSON carries the "Z".
            DateTime.SpecifyKind(tenant.CreatedAt, DateTimeKind.Utc),
            adminCount,
            tableCount,
            upcomingReservationCount);
    }

    private static IResult BadRequest(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);

    private static IResult Conflict(string error) => ErrorResponse.Result(error, StatusCodes.Status409Conflict);
}
