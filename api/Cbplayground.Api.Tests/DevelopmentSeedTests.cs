using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.AreaEndpoints;
using static Cbplayground.Api.Endpoints.OpeningHoursEndpoints;
using static Cbplayground.Api.Endpoints.ProfileEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;
using static Cbplayground.Api.Endpoints.TableEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The demo setup of the development seed, run against the test database: its two restaurants have the demo slugs
/// but none of the setup, like an existing development database from before the seed.
/// </summary>
public class DevelopmentSeedTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Ct);
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task SeedAsync()
    {
        using var scope = factory.Services.CreateScope();
        await DevelopmentSeed.SeedRestaurantsAsync(scope.ServiceProvider);
    }

    [Fact]
    public async Task The_seed_sets_up_the_restaurants_completely_and_adds_nothing_twice()
    {
        await SeedAsync();
        await SeedAsync();

        using var linde = await LoginAsync("admin@zur-linde.test");
        Assert.Equal(new SetupStatusResponse(true, true, true, true, true, true), await linde.GetFromJsonAsync<SetupStatusResponse>("/api/admin/setup-status", Ct));

        var areas = (await linde.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!;
        Assert.Equal(["Gaststube", "Terrasse"], areas.Select(a => a.Name));
        Assert.Equal(50, areas[1].OnlineCapacityPercent);
        var tables = (await linde.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct))!;
        Assert.Equal(16, tables.Count);
        Assert.All(tables, t => Assert.InRange(t.PosX, 0, 1));
        Assert.All(tables, t => Assert.InRange(t.PosY, 0, 1));

        // The floor plans were copied into the uploads folder.
        foreach (var area in areas)
        {
            var image = await linde.GetAsync(area.FloorPlanUrl, Ct);
            Assert.Equal(HttpStatusCode.OK, image.StatusCode);
            Assert.Equal("image/png", image.Content.Headers.ContentType?.MediaType);
        }
        Assert.Equal(3, Directory.GetFiles(factory.UploadsPath).Length);

        var hours = (await linde.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Ct))!;
        Assert.Equal(12, hours.Periods!.Count);
        Assert.DoesNotContain(hours.Periods, p => p.DayOfWeek == DayOfWeek.Monday);

        var settings = (await linde.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Ct))!;
        Assert.Equal(ConfirmationMode.Instant, settings.ConfirmationMode);
        Assert.Equal(TableSelectionMode.SystemAssigns, settings.TableSelectionMode);
        Assert.Equal([new DurationRuleDto(1, 2, 90), new DurationRuleDto(3, 6, 120)], settings.DurationRules);

        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        Assert.Equal(12, (await dunav.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct))!.Count);
        var dunavSettings = (await dunav.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Ct))!;
        Assert.Equal(ConfirmationMode.Request, dunavSettings.ConfirmationMode);
        Assert.Equal(TableSelectionMode.GuestChooses, dunavSettings.TableSelectionMode);
    }

    [Fact]
    public async Task The_seed_keeps_what_the_admin_maintained_and_only_adds_what_is_missing()
    {
        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        var ownProfile = new ProfileDto("Zmaj Jovina 1", "21000", "Novi Sad", "+381 21 111111", null, null, null);
        (await dunav.PutAsJsonAsync("/api/admin/profile", ownProfile, Ct)).EnsureSuccessStatusCode();
        (await dunav.PutAsJsonAsync("/api/admin/opening-hours", new { periods = new[] { new { dayOfWeek = 5, start = "18:00", end = "23:00" } } }, Ct)).EnsureSuccessStatusCode();

        await SeedAsync();

        Assert.Equal(ownProfile, await dunav.GetFromJsonAsync<ProfileDto>("/api/admin/profile", Ct));
        var hours = (await dunav.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Ct))!;
        Assert.Equal([new PeriodDto(DayOfWeek.Friday, "18:00", "23:00")], hours.Periods);
        // What was missing has been added.
        Assert.Equal(["Sala"], (await dunav.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!.Select(a => a.Name));
        Assert.Equal("RS", (await dunav.GetFromJsonAsync<LocationResponse>("/api/admin/location", Ct))?.CountryCode);
    }
}
