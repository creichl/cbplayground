using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>Endpoints of the admin area. Only Tenant Admins may call them.</summary>
public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin").RequireAuthorization(Policies.RequireTenantAdmin);

        // The restaurant of the signed-in Tenant Admin.
        group.MapGet("/tenant", async (ITenantContext tenantContext, AppDbContext db) =>
            await db.Tenants
                .Where(t => t.Id == tenantContext.TenantId)
                .Select(t => new TenantEndpoints.TenantResponse(t.Id, t.Name, t.Slug))
                .SingleAsync());
    }
}
