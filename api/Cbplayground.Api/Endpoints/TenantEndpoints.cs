using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

public static class TenantEndpoints
{
    public record TenantResponse(Guid Id, string Name, string Slug);

    /// <summary>
    /// An active restaurant in the public list, with its city and description from the profile, its logo, cover image
    /// and accent colour from the branding (each null when empty) and its cuisines, price level and features from the details
    /// (empty lists or null when not set, see <see cref="RestaurantDetailsEndpoints.DetailsResponse"/>).
    /// </summary>
    public record TenantListItem(Guid Id, string Name, string Slug, string? City, string? Description, string? LogoUrl, string? CoverUrl, string? BrandColor,
        IReadOnlyList<Cuisine> Cuisines, int? PriceLevel, IReadOnlyList<RestaurantFeature> Features);

    public static void MapTenantEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tenants");

        // Deactivated restaurants are hidden from guests.
        group.MapGet("/", async (AppDbContext db) =>
            (await db.Tenants
                .Where(t => t.IsActive)
                .OrderBy(t => t.Name)
                .ToListAsync())
                .Select(t => new TenantListItem(t.Id, t.Name, t.Slug, t.City, t.Description, BrandingEndpoints.LogoUrl(t), BrandingEndpoints.CoverUrl(t), t.BrandColor,
                    t.Cuisines, t.PriceLevel, t.Features)));
    }
}
