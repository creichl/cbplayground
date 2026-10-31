using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using static Cbplayground.Api.Endpoints.AreaEndpoints;
using static Cbplayground.Api.Endpoints.TableEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// After the update to the schematic floor plan, the API arranges on its start the areas without floor plan image whose tables
/// lie on top of each other, in every environment.
/// </summary>
public class StackedTablesTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task On_start_stacked_tables_of_areas_without_image_are_arranged_and_everything_else_stays()
    {
        using var factory = new ApiFactory();
        // Test restaurants place every table at 0.5/0.5, as the API did before.
        var restaurant = await TestRestaurants.CreateAsync(factory,
        [
            new TestArea("Stapel", true, 100, ("1", 2), ("2", 4), ("3", 6), ("4", 8)),
            new TestArea("Verteilt", true, 100, ("V1", 4), ("V2", 4)),
            new TestArea("Mit Bild", true, 100, ("P1", 4), ("P2", 4)),
        ]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        (await admin.PutAsJsonAsync("/api/admin/tables/positions", new[]
        {
            new TablePosition(restaurant.Tables["V1"], 0.2, 0.3),
            new TablePosition(restaurant.Tables["V2"], 0.7, 0.6),
        }, Ct)).EnsureSuccessStatusCode();
        var image = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        (await admin.PutAsync($"/api/admin/areas/{restaurant.Areas["Mit Bild"]}/floorplan", image, Ct)).EnsureSuccessStatusCode();
        var before = (await admin.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct))!;

        // A second API on the same database, as after the update. Outside Development, so without demo data.
        void Restart()
        {
            using var restarted = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Production");
                builder.UseSetting("ConnectionStrings:Default", $"Data Source={factory.DatabasePath}");
                builder.UseSetting("Uploads:Path", factory.UploadsPath);
                builder.UseSetting("Backup:Enabled", "false");
                builder.UseSetting("Backup:Path", factory.BackupPath);
                builder.UseSetting("DataProtection:KeysPath", factory.KeysPath);
            });
            _ = restarted.Services;
        }
        Restart();

        var after = (await admin.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct))!;
        var stacked = after.Where(t => t.AreaId == restaurant.Areas["Stapel"]).ToList();
        Assert.Equal(4, stacked.Select(t => (t.PosX, t.PosY)).Distinct().Count());
        Assert.All(stacked, t => Assert.NotEqual((0.5, 0.5), (t.PosX, t.PosY)));
        // In the order of the numbers: "1" top left.
        Assert.True(stacked[0].PosX < stacked[1].PosX || stacked[0].PosY < stacked[1].PosY);
        Assert.Equal(before.Where(t => t.AreaId != restaurant.Areas["Stapel"]), after.Where(t => t.AreaId != restaurant.Areas["Stapel"]));
        Assert.All(after.Where(t => t.AreaId == restaurant.Areas["Mit Bild"]), t => Assert.Equal((0.5, 0.5), (t.PosX, t.PosY)));

        // A further start changes nothing.
        Restart();
        Assert.Equal(after, (await admin.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct))!);
        Assert.Contains((await admin.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!, a => a.Name == "Mit Bild" && a.FloorPlanUrl is not null);
    }
}
