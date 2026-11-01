using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.FloorPlans;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.AreaEndpoints;
using static Cbplayground.Api.Endpoints.BrandingEndpoints;
using static Cbplayground.Api.Endpoints.OpeningHoursEndpoints;
using static Cbplayground.Api.Endpoints.ProfileEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;
using static Cbplayground.Api.Endpoints.TableEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The demo setup of the development seed, run against the test database: its two restaurants have the demo slugs
/// but none of the setup, like an existing development database from before the seed. The third demo restaurant,
/// Rooftop Belvedere, does not exist yet, as in a development database from before it was added.
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
        // Three floor plans plus logo and cover image of each of the three restaurants, copied once.
        Assert.Equal(9, Directory.GetFiles(factory.UploadsPath).Length);

        var hours = (await linde.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Ct))!;
        Assert.Equal(12, hours.Periods!.Count);
        Assert.DoesNotContain(hours.Periods, p => p.DayOfWeek == DayOfWeek.Monday);

        var settings = (await linde.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Ct))!;
        Assert.Equal(ConfirmationMode.Instant, settings.ConfirmationMode);
        Assert.Equal(TableSelectionMode.SystemAssigns, settings.TableSelectionMode);
        Assert.Equal([new DurationRuleDto(1, 2, 90), new DurationRuleDto(3, 6, 120)], settings.DurationRules);

        Assert.All(areas, a => Assert.Equal(80, a.TableScale));
        Assert.Equal(TableShape.Rectangle, tables.Single(t => t.Number == "8").Shape);
        Assert.Equal(TableShape.Round, tables.Single(t => t.Number == "T1").Shape);

        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        var dunavAreas = (await dunav.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!;
        Assert.Equal(["Sala", "Bašta"], dunavAreas.Select(a => a.Name));
        var dunavTables = (await dunav.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct))!;
        Assert.Equal(18, dunavTables.Count);
        Assert.Equal(12, dunavTables.Count(t => t.AreaId == dunavAreas[0].Id));

        // "Bašta" has no floor plan image; its tables of mixed size and shape are arranged without overlapping.
        var basta = dunavAreas[1];
        Assert.Null(basta.FloorPlanUrl);
        Assert.Equal(100, basta.TableScale);
        var bastaTables = dunavTables.Where(t => t.AreaId == basta.Id).ToList();
        Assert.Equal(6, bastaTables.Count);
        Assert.Equal(2, bastaTables.Min(t => t.Seats));
        Assert.Equal(8, bastaTables.Max(t => t.Seats));
        Assert.Contains(bastaTables, t => t.Shape == TableShape.Round);
        Assert.True(bastaTables.Select(t => t.Shape).Distinct().Count() > 1);
        AssertArrangedWithoutOverlap(bastaTables.Select(t => (t.Number, t.Shape, t.Seats, t.Rotation, t.PosX, t.PosY)).ToList(), basta.TableScale);

        var dunavSettings = (await dunav.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Ct))!;
        Assert.Equal(ConfirmationMode.Request, dunavSettings.ConfirmationMode);
        Assert.Equal(TableSelectionMode.GuestChooses, dunavSettings.TableSelectionMode);

        // Branding with logo and cover image for both, which guests can load.
        var lindeBranding = (await linde.GetFromJsonAsync<BrandingResponse>("/api/admin/branding", Ct))!;
        Assert.Equal(("#5a7d3a", ThemeMode.Light, FontStyle.Rustic), (lindeBranding.BrandColor, lindeBranding.ThemeMode, lindeBranding.FontStyle));
        var dunavBranding = (await dunav.GetFromJsonAsync<BrandingResponse>("/api/admin/branding", Ct))!;
        Assert.Equal(("#1f5f8b", ThemeMode.Light, FontStyle.Classic), (dunavBranding.BrandColor, dunavBranding.ThemeMode, dunavBranding.FontStyle));
        using var guest = factory.CreateHttpsClient();
        foreach (var url in new[] { lindeBranding.LogoUrl, lindeBranding.CoverUrl, dunavBranding.LogoUrl, dunavBranding.CoverUrl })
        {
            var image = await guest.GetAsync(url, Ct);
            Assert.Equal(HttpStatusCode.OK, image.StatusCode);
            Assert.Equal("image/png", image.Content.Headers.ContentType?.MediaType);
        }
    }

    [Fact]
    public async Task The_seed_adds_Rooftop_Belvedere_with_drawn_areas_and_a_dark_branding()
    {
        await SeedAsync();
        await SeedAsync();

        using var guest = factory.CreateHttpsClient();
        var rooftop = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>("/api/public/restaurants/rooftop-belvedere", Ct))!;
        Assert.Equal("Rooftop Belvedere", rooftop.Name);
        Assert.Equal("Wien", rooftop.City);
        Assert.All(new[] { rooftop.Street, rooftop.PostalCode, rooftop.Phone, rooftop.Email, rooftop.Website, rooftop.Description }, Assert.NotNull);
        Assert.Equal("Europe/Vienna", rooftop.TimeZoneId);
        Assert.Equal(ConfirmationMode.Instant, rooftop.ConfirmationMode);
        Assert.Equal(TableSelectionMode.GuestChooses, rooftop.TableSelectionMode);
        Assert.True(rooftop.Bookable);
        Assert.Equal(
            new[] { DayOfWeek.Sunday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday }.Select(d => new PeriodDto(d, "17:00", "24:00")),
            rooftop.OpeningHours);

        Assert.Equal(("#c9a96e", ThemeMode.Dark, FontStyle.Elegant), (rooftop.Branding.BrandColor, rooftop.Branding.ThemeMode, rooftop.Branding.FontStyle));
        foreach (var url in new[] { rooftop.Branding.LogoUrl, rooftop.Branding.CoverUrl })
        {
            Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(url, Ct)).StatusCode);
        }
        var listItem = Assert.Single((await guest.GetFromJsonAsync<List<TenantEndpoints.TenantListItem>>("/api/tenants", Ct))!, t => t.Slug == "rooftop-belvedere");
        Assert.Equal((rooftop.Branding.LogoUrl, rooftop.Branding.CoverUrl, "#c9a96e"), (listItem.LogoUrl, listItem.CoverUrl, listItem.BrandColor));

        // Only areas without floor plan image, their tables of mixed shape arranged without overlapping.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tenant = await db.Tenants.SingleAsync(t => t.Slug == "rooftop-belvedere", Ct);
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenant.Id;
        var areas = await db.Areas.OrderBy(a => a.SortOrder).ToListAsync(Ct);
        Assert.Equal(["Rooftop", "Lounge"], areas.Select(a => a.Name));
        Assert.All(areas, a => Assert.Null(a.FloorPlanFileName));
        Assert.Equal([70, 100], areas.Select(a => a.OnlineCapacityPercent));
        var tables = await db.Tables.ToListAsync(Ct);
        var rooftopTables = tables.Where(t => t.AreaId == areas[0].Id).ToList();
        var loungeTables = tables.Where(t => t.AreaId == areas[1].Id).ToList();
        Assert.Equal(8, rooftopTables.Count);
        Assert.Equal((2, 6), (rooftopTables.Min(t => t.Seats), rooftopTables.Max(t => t.Seats)));
        Assert.Contains(rooftopTables, t => t.Shape == TableShape.Round);
        Assert.Contains(rooftopTables, t => t.Shape != TableShape.Round);
        Assert.Equal(5, loungeTables.Count);
        Assert.Equal((2, 8), (loungeTables.Min(t => t.Seats), loungeTables.Max(t => t.Seats)));
        foreach (var area in areas)
        {
            AssertArrangedWithoutOverlap(tables.Where(t => t.AreaId == area.Id).Select(t => (t.Number, t.Shape, t.Seats, t.Rotation, t.PosX, t.PosY)).ToList(), area.TableScale);
        }
        var settings = await db.ReservationSettings.SingleAsync(Ct);
        Assert.Equal(120, settings.DefaultDurationMinutes);
        Assert.Equal(1, await db.Tenants.CountAsync(t => t.Slug == "rooftop-belvedere", Ct));
    }

    [Fact]
    public async Task The_demo_users_of_Rooftop_Belvedere_can_sign_in()
    {
        await SeedAsync();
        // The demo users of appsettings.Development.json (the tests run in the "Testing" environment).
        var environment = factory.Services.GetRequiredService<IWebHostEnvironment>();
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(environment.ContentRootPath, "appsettings.Development.json"), optional: false)
            .Build();
        using (var scope = factory.Services.CreateScope())
        {
            await DevelopmentSeed.SeedUsersAsync(scope.ServiceProvider, configuration);
            await DevelopmentSeed.SeedUsersAsync(scope.ServiceProvider, configuration);
        }

        foreach (var (email, role) in new[] { ("admin@rooftop-belvedere.local", "TenantAdmin"), ("frontdesk@rooftop-belvedere.local", "FrontDesk") })
        {
            using var client = factory.CreateHttpsClient();
            var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Demo1234!" }, Ct);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var me = (await client.GetFromJsonAsync<AuthEndpoints.MeResponse>("/api/auth/me", Ct))!;
            Assert.Equal(role, me.Role);
            Assert.Equal("rooftop-belvedere", me.Tenant?.Slug);
        }
    }

    [Fact]
    public async Task The_demo_reservations_cover_Rooftop_Belvedere()
    {
        await SeedAsync();

        await DevelopmentSeed.SeedReservationsAsync(factory.Services);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = (await db.Tenants.SingleAsync(t => t.Slug == "rooftop-belvedere", Ct)).Id;
        Assert.NotEmpty(await db.Reservations.ToListAsync(Ct));
    }

    /// <summary>The tables lie completely within the plan and do not overlap each other.</summary>
    private static void AssertArrangedWithoutOverlap(List<(string Number, TableShape Shape, int Seats, int Rotation, double PosX, double PosY)> tables, int tableScale)
    {
        foreach (var table in tables)
        {
            var (width, height) = TableLayout.TableSize(table.Shape, table.Seats, table.Rotation, tableScale);
            Assert.InRange(table.PosX - width / 2, 0, 1);
            Assert.InRange(table.PosX + width / 2, 0, 1);
            Assert.InRange(table.PosY - height * TableLayout.AspectRatio / 2, 0, 1);
            Assert.InRange(table.PosY + height * TableLayout.AspectRatio / 2, 0, 1);
            foreach (var other in tables.Where(t => t.Number != table.Number))
            {
                var otherSize = TableLayout.TableSize(other.Shape, other.Seats, other.Rotation, tableScale);
                Assert.True(Math.Abs(table.PosX - other.PosX) >= (width + otherSize.Width) / 2
                    || Math.Abs(table.PosY - other.PosY) >= (height + otherSize.Height) / 2 * TableLayout.AspectRatio,
                    $"Tables {table.Number} and {other.Number} overlap.");
            }
        }
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
        Assert.Equal(["Sala", "Bašta"], (await dunav.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!.Select(a => a.Name));
        Assert.Equal("RS", (await dunav.GetFromJsonAsync<LocationResponse>("/api/admin/location", Ct))?.CountryCode);
    }
}

/// <summary>
/// The seed and a branding the admin maintained, on a factory of its own: the other seed tests expect the demo branding.
/// </summary>
public class DevelopmentSeedBrandingTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Ct);
        response.EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task The_seed_keeps_a_branding_the_admin_maintained_even_if_only_one_field_is_set()
    {
        using var linde = await LoginAsync("admin@zur-linde.test");
        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        (await linde.PutAsJsonAsync("/api/admin/branding", new { brandColor = "#112233", themeMode = "Dark", fontStyle = "Urban" }, Ct)).EnsureSuccessStatusCode();
        var logo = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        logo.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        var dunavLogo = (await (await dunav.PutAsync("/api/admin/branding/logo", logo, Ct)).Content.ReadFromJsonAsync<BrandingResponse>(Ct))!;

        using (var scope = factory.Services.CreateScope())
        {
            await DevelopmentSeed.SeedRestaurantsAsync(scope.ServiceProvider);
        }

        Assert.Equal(new BrandingResponse("#112233", ThemeMode.Dark, FontStyle.Urban, null, null), await linde.GetFromJsonAsync<BrandingResponse>("/api/admin/branding", Ct));
        Assert.Equal(dunavLogo, await dunav.GetFromJsonAsync<BrandingResponse>("/api/admin/branding", Ct));
        Assert.Null(dunavLogo.CoverUrl);
    }
}
