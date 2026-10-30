using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

public static class TenantEndpoints
{
    public record TenantResponse(Guid Id, string Name, string Slug);

    public static void MapTenantEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tenants");

        group.MapGet("/", async (AppDbContext db) =>
            await db.Tenants
                .OrderBy(t => t.Name)
                .Select(t => new TenantResponse(t.Id, t.Name, t.Slug))
                .ToListAsync());
    }
}
