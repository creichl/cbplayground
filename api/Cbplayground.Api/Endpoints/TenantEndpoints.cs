using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

public static class TenantEndpoints
{
    public record TenantResponse(Guid Id, string Name, string Slug);

    /// <summary>An opening window of today, "HH:mm"; the end may be "24:00".</summary>
    public record TodayPeriod(string Start, string End);

    /// <summary>
    /// An active restaurant in the public list, with its city and description from the profile, its logo, cover image
    /// and accent colour from the branding (each null when empty) and its cuisines, price level and features from the details
    /// (empty lists or null when not set, see <see cref="RestaurantDetailsEndpoints.DetailsResponse"/>).
    /// <see cref="OpenToday"/> tells whether it has an opening window today in its own time zone, with public holidays, closing
    /// days and special hours (<see cref="IOpeningCalendar"/>); <see cref="TodayHours"/> are those windows, sorted by start.
    /// A restaurant without location is never open today.
    /// </summary>
    public record TenantListItem(Guid Id, string Name, string Slug, string? City, string? Description, string? LogoUrl, string? CoverUrl, string? BrandColor,
        IReadOnlyList<Cuisine> Cuisines, int? PriceLevel, IReadOnlyList<RestaurantFeature> Features, bool OpenToday, IReadOnlyList<TodayPeriod> TodayHours);

    public static void MapTenantEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tenants");

        // Deactivated restaurants are hidden from guests.
        group.MapGet("/", async (AppDbContext db, TenantScope tenantScope, IOpeningCalendar openingCalendar, TimeProvider timeProvider, CancellationToken cancellationToken) =>
        {
            var tenants = await db.Tenants
                .Where(t => t.IsActive)
                .OrderBy(t => t.Name)
                .ToListAsync(cancellationToken);

            // One evaluation of the opening calendar per restaurant, each with the restaurant as the tenant of the request, as
            // the public endpoints of a restaurant do; the tenant filters keep every restaurant's hours to itself.
            var utcNow = timeProvider.GetUtcNow().UtcDateTime;
            var scopedTenantId = tenantScope.TenantId;
            var items = new List<TenantListItem>();
            try
            {
                foreach (var tenant in tenants)
                {
                    IReadOnlyList<OpenPeriod> today = [];
                    if (tenant.TimeZoneId is not null)
                    {
                        tenantScope.TenantId = tenant.Id;
                        var date = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(utcNow, tenant.TimeZoneId));
                        today = await openingCalendar.GetOpenPeriodsAsync(date, cancellationToken);
                    }
                    items.Add(new TenantListItem(tenant.Id, tenant.Name, tenant.Slug, tenant.City, tenant.Description, BrandingEndpoints.LogoUrl(tenant),
                        BrandingEndpoints.CoverUrl(tenant), tenant.BrandColor, tenant.Cuisines, tenant.PriceLevel, tenant.Features,
                        OpenToday: today.Count > 0,
                        TodayHours: today.Select(p => new TodayPeriod(OpeningHoursEndpoints.FormatTime(p.Start), OpeningHoursEndpoints.FormatTime(p.End))).ToList()));
                }
            }
            finally
            {
                tenantScope.TenantId = scopedTenantId;
            }
            return items;
        });
    }
}
