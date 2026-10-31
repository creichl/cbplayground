using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

public static class TenantEndpoints
{
    public record TenantResponse(Guid Id, string Name, string Slug);

    /// <summary>An active restaurant in the public list, with its city and short description from the profile (null when empty).</summary>
    public record TenantListItem(Guid Id, string Name, string Slug, string? City, string? Description);

    public static void MapTenantEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tenants");

        // Deactivated restaurants are hidden from guests.
        group.MapGet("/", async (AppDbContext db) =>
            await db.Tenants
                .Where(t => t.IsActive)
                .OrderBy(t => t.Name)
                .Select(t => new TenantListItem(t.Id, t.Name, t.Slug, t.City, t.Description))
                .ToListAsync());
    }
}
