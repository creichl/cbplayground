using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.FloorPlans;

/// <summary>
/// Before the schematic floor plan, every new table was placed at 0.5/0.5, and in an area without floor plan image the tables
/// could not be moved, so they all lay on top of each other. On every start, in every environment, this arranges each area
/// without floor plan image in which at least two tables have exactly the same position (<see cref="TableLayout.Arrange"/>).
/// Idempotent: an arranged area has no stacked tables any more; areas with an image and areas whose tables are spread are left alone.
/// </summary>
public static class StackedTables
{
    public static async Task ArrangeAsync(IServiceProvider services)
    {
        List<Guid> tenantIds;
        using (var scope = services.CreateScope())
        {
            // Tenants are not tenant-owned, so this query needs no tenant.
            tenantIds = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Tenants.Select(t => t.Id).ToListAsync();
        }

        foreach (var tenantId in tenantIds)
        {
            // One scope per restaurant with its tenant set, so the tenant rules of AppDbContext apply as in a request.
            using var scope = services.CreateScope();
            scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenantId;
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var areas = await db.Areas.Where(a => a.FloorPlanFileName == null).ToListAsync();
            var areaIds = areas.Select(a => a.Id).ToList();
            var tables = await db.Tables.Where(t => areaIds.Contains(t.AreaId)).ToListAsync();
            foreach (var area in areas)
            {
                var areaTables = tables.Where(t => t.AreaId == area.Id).ToList();
                if (areaTables.GroupBy(t => (t.PosX, t.PosY)).Any(g => g.Count() > 1))
                {
                    TableLayout.Arrange(areaTables, area.TableScale);
                }
            }
            await db.SaveChangesAsync();
        }
    }
}
