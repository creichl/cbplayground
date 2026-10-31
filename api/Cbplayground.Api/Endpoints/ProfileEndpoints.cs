using System.Text.RegularExpressions;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The profile of the signed-in Tenant Admin's restaurant (address, contact, short description)
/// and the state of the restaurant's setup, shown as a checklist on the admin start page.
/// </summary>
public static partial class ProfileEndpoints
{
    /// <summary>
    /// The profile; every field is optional, empty fields are null. Errors (400): "invalid_street", "invalid_postal_code",
    /// "invalid_city", "invalid_phone", "invalid_description" (too long), "invalid_email", "invalid_website" (not an absolute http or https URL, or too long).
    /// </summary>
    public record ProfileDto(string? Street, string? PostalCode, string? City, string? Phone, string? Email, string? Website, string? Description);

    /// <summary>Whether each step of the setup is done.</summary>
    public record SetupStatusResponse(bool Profile, bool Location, bool OpeningHours, bool FloorPlan, bool Tables, bool ReservationSettings);

    [GeneratedRegex(@"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")]
    private static partial Regex EmailPattern();

    public static void MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/profile", async (ITenantContext tenantContext, AppDbContext db) =>
            ToDto(await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId)));

        group.MapPut("/profile", async (ProfileDto request, ITenantContext tenantContext, AppDbContext db) =>
        {
            var profile = new ProfileDto(
                Normalize(request.Street),
                Normalize(request.PostalCode),
                Normalize(request.City),
                Normalize(request.Phone),
                Normalize(request.Email),
                Normalize(request.Website),
                Normalize(request.Description));
            if (Validate(profile) is { } error)
            {
                return ErrorResponse.Result(error, StatusCodes.Status400BadRequest);
            }

            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            tenant.Street = profile.Street;
            tenant.PostalCode = profile.PostalCode;
            tenant.City = profile.City;
            tenant.Phone = profile.Phone;
            tenant.Email = profile.Email;
            tenant.Website = profile.Website;
            tenant.Description = profile.Description;
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(tenant));
        });

        group.MapGet("/setup-status", async (ITenantContext tenantContext, AppDbContext db) =>
        {
            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            // The query filter limits the following queries to the current tenant.
            return new SetupStatusResponse(
                Profile: tenant is { Street: not null, PostalCode: not null, City: not null, Phone: not null },
                Location: tenant.CountryCode is not null,
                OpeningHours: await db.OpeningPeriods.AnyAsync(),
                FloorPlan: await db.Areas.AnyAsync(a => a.FloorPlanFileName != null),
                Tables: await db.Tables.AnyAsync(),
                ReservationSettings: await db.ReservationSettings.AnyAsync());
        });
    }

    /// <summary>The error code of the first invalid field, or null if the (normalized) profile is valid.</summary>
    public static string? Validate(ProfileDto profile)
    {
        if (profile.Street?.Length > Tenant.MaxStreetLength)
        {
            return "invalid_street";
        }
        if (profile.PostalCode?.Length > Tenant.MaxPostalCodeLength)
        {
            return "invalid_postal_code";
        }
        if (profile.City?.Length > Tenant.MaxCityLength)
        {
            return "invalid_city";
        }
        if (profile.Phone?.Length > Tenant.MaxPhoneLength)
        {
            return "invalid_phone";
        }
        if (profile.Email is { } email && (email.Length > Tenant.MaxEmailLength || !EmailPattern().IsMatch(email)))
        {
            return "invalid_email";
        }
        if (profile.Website is { } website && (website.Length > Tenant.MaxWebsiteLength || !IsWebUrl(website)))
        {
            return "invalid_website";
        }
        if (profile.Description?.Length > Tenant.MaxDescriptionLength)
        {
            return "invalid_description";
        }
        return null;
    }

    private static bool IsWebUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
        && uri.Host.Length > 0;

    /// <summary>Trimmed; an empty field is stored as null.</summary>
    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ProfileDto ToDto(Tenant tenant) =>
        new(tenant.Street, tenant.PostalCode, tenant.City, tenant.Phone, tenant.Email, tenant.Website, tenant.Description);
}
