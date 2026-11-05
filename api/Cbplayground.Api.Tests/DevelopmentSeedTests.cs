using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
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
            Assert.Equal("image/webp", image.Content.Headers.ContentType?.MediaType);
        }
        // Five floor plans, logo and cover image of each of the three restaurants, a photo of each of the six areas and the
        // gallery photos, copied once.
        var seedAssets = Path.Combine(factory.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath, "Data", "SeedAssets");
        Assert.Equal(17 + Directory.GetFiles(seedAssets, "*-gallery-*").Length, Directory.GetFiles(factory.UploadsPath).Length);

        var hours = (await linde.GetFromJsonAsync<OpeningHoursDto>("/api/admin/opening-hours", Ct))!;
        Assert.Equal(12, hours.Periods!.Count);
        Assert.DoesNotContain(hours.Periods, p => p.DayOfWeek == DayOfWeek.Monday);

        var settings = (await linde.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Ct))!;
        Assert.Equal(ConfirmationMode.Instant, settings.ConfirmationMode);
        Assert.Equal(TableSelectionMode.SystemAssigns, settings.TableSelectionMode);
        Assert.Equal([new DurationRuleDto(1, 2, 90), new DurationRuleDto(3, 6, 120)], settings.DurationRules);

        // On the floor plan images, the table scale fits the plan's scale; the tables lie within the plan without overlapping.
        Assert.Equal([90, 85], areas.Select(a => a.TableScale));
        foreach (var area in areas)
        {
            AssertArrangedWithoutOverlap(tables.Where(t => t.AreaId == area.Id).Select(t => (t.Number, t.Shape, t.Seats, t.Rotation, t.PosX, t.PosY)).ToList(), area.TableScale);
        }
        Assert.Equal(TableShape.Rectangle, tables.Single(t => t.Number == "8").Shape);
        Assert.Equal(TableShape.Round, tables.Single(t => t.Number == "T1").Shape);

        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        var dunavAreas = (await dunav.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!;
        Assert.Equal(["Sala", "Bašta"], dunavAreas.Select(a => a.Name));
        var dunavTables = (await dunav.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct))!;
        Assert.Equal(18, dunavTables.Count);
        Assert.Equal(12, dunavTables.Count(t => t.AreaId == dunavAreas[0].Id));
        Assert.Equal(80, dunavAreas[0].TableScale);
        AssertArrangedWithoutOverlap(dunavTables.Where(t => t.AreaId == dunavAreas[0].Id).Select(t => (t.Number, t.Shape, t.Seats, t.Rotation, t.PosX, t.PosY)).ToList(), dunavAreas[0].TableScale);

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

        // "Bašta" is a garden with the Danube on one side; the tables keep away from its plants and its entrance.
        Assert.Equal(RoomStyle.Garden, basta.RoomStyle);
        var bastaRoom = (await dunav.GetFromJsonAsync<RoomResponse>($"/api/admin/areas/{basta.Id}/room", Ct))!;
        Assert.Single(bastaRoom.Elements, e => e.Kind == RoomElementKind.Entrance);
        Assert.True(bastaRoom.Elements.Count(e => e.Kind == RoomElementKind.Plant) >= 4);
        Assert.Equal("Dunav", Assert.Single(bastaRoom.Elements, e => e.Kind == RoomElementKind.Label).Label);
        AssertClearOfElements(bastaTables, bastaRoom.Elements);
        // The areas with a floor plan image keep the default room.
        Assert.Equal(RoomStyle.Indoor, dunavAreas[0].RoomStyle);
        Assert.Empty((await dunav.GetFromJsonAsync<RoomResponse>($"/api/admin/areas/{dunavAreas[0].Id}/room", Ct))!.Elements);
        Assert.All(areas, a => Assert.Equal(RoomStyle.Indoor, a.RoomStyle));

        var dunavSettings = (await dunav.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Ct))!;
        Assert.Equal(ConfirmationMode.Request, dunavSettings.ConfirmationMode);
        Assert.Equal(TableSelectionMode.GuestChooses, dunavSettings.TableSelectionMode);

        // Every area has a photo, which guests can load, and a description in the restaurant's language.
        using var guest = factory.CreateHttpsClient();
        foreach (var area in areas.Concat(dunavAreas))
        {
            Assert.False(string.IsNullOrEmpty(area.Description));
            Assert.InRange(area.Description!.Length, 1, Area.MaxDescriptionLength);
            var photo = await guest.GetAsync(area.PhotoUrl, Ct);
            Assert.Equal(HttpStatusCode.OK, photo.StatusCode);
            Assert.Equal("image/jpeg", photo.Content.Headers.ContentType?.MediaType);
        }
        Assert.Equal("Bašta u hladu lipa, pogled na Dunav", basta.Description);

        // Branding with logo and cover image for both, which guests can load: the logos are drawn, the cover images are photos.
        var lindeBranding = (await linde.GetFromJsonAsync<BrandingResponse>("/api/admin/branding", Ct))!;
        Assert.Equal(("#5a7d3a", ThemeMode.Light, FontStyle.Rustic), (lindeBranding.BrandColor, lindeBranding.ThemeMode, lindeBranding.FontStyle));
        var dunavBranding = (await dunav.GetFromJsonAsync<BrandingResponse>("/api/admin/branding", Ct))!;
        Assert.Equal(("#1f5f8b", ThemeMode.Light, FontStyle.Classic), (dunavBranding.BrandColor, dunavBranding.ThemeMode, dunavBranding.FontStyle));
        foreach (var (url, type) in new[] { (lindeBranding.LogoUrl, "image/png"), (lindeBranding.CoverUrl, "image/jpeg"), (dunavBranding.LogoUrl, "image/png"), (dunavBranding.CoverUrl, "image/jpeg") })
        {
            var image = await guest.GetAsync(url, Ct);
            Assert.Equal(HttpStatusCode.OK, image.StatusCode);
            Assert.Equal(type, image.Content.Headers.ContentType?.MediaType);
        }
    }

    [Fact]
    public async Task The_seed_adds_Rooftop_Belvedere_with_floor_plan_images_and_a_dark_branding()
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
        Assert.Equal("image/jpeg", (await guest.GetAsync(rooftop.Branding.CoverUrl, Ct)).Content.Headers.ContentType?.MediaType);
        var listItem = Assert.Single((await guest.GetFromJsonAsync<List<TenantEndpoints.TenantListItem>>("/api/tenants", Ct))!, t => t.Slug == "rooftop-belvedere");
        Assert.Equal((rooftop.Branding.LogoUrl, rooftop.Branding.CoverUrl, "#c9a96e"), (listItem.LogoUrl, listItem.CoverUrl, listItem.BrandColor));

        // Both areas with a floor plan image and the table scale of its plan; their tables of mixed shape lie within the plan without overlapping.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tenant = await db.Tenants.SingleAsync(t => t.Slug == "rooftop-belvedere", Ct);
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenant.Id;
        var areas = await db.Areas.OrderBy(a => a.SortOrder).ToListAsync(Ct);
        Assert.Equal(["Rooftop", "Lounge"], areas.Select(a => a.Name));
        Assert.All(areas, a => Assert.EndsWith(".webp", a.FloorPlanFileName));
        Assert.All(areas, a => Assert.True(File.Exists(Path.Combine(factory.UploadsPath, a.FloorPlanFileName!))));
        Assert.Equal([68, 85], areas.Select(a => a.TableScale));
        Assert.All(areas, a => Assert.NotNull(a.PhotoFileName));
        Assert.Equal("Dachterrasse mit Blick über die Stadt, Cocktails unter freiem Himmel.", areas[0].Description);
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

        // The images show the rooms, so the areas have no room elements; the rooftop keeps its room style.
        Assert.Equal([RoomStyle.Rooftop, RoomStyle.Indoor], areas.Select(a => a.RoomStyle));
        Assert.Empty(await db.RoomElements.ToListAsync(Ct));
        var settings = await db.ReservationSettings.SingleAsync(Ct);
        Assert.Equal(120, settings.DefaultDurationMinutes);
        Assert.Equal(1, await db.Tenants.CountAsync(t => t.Slug == "rooftop-belvedere", Ct));
    }

    [Fact]
    public async Task Every_demo_restaurant_has_a_gallery_of_6_to_8_captioned_photos_that_guests_can_load()
    {
        await SeedAsync();
        await SeedAsync();

        using var guest = factory.CreateHttpsClient();
        foreach (var slug in new[] { "zur-linde", "kafana-dunav", "rooftop-belvedere" })
        {
            var restaurant = (await guest.GetFromJsonAsync<PublicRestaurantEndpoints.RestaurantResponse>($"/api/public/restaurants/{slug}", Ct))!;
            Assert.InRange(restaurant.Gallery.Count, 6, 8);
            Assert.All(restaurant.Gallery, p => Assert.InRange(p.Caption?.Length ?? 0, 1, GalleryPhoto.MaxCaptionLength));
            Assert.Equal(restaurant.Gallery.Count, restaurant.Gallery.Select(p => p.Caption).Distinct().Count());
            foreach (var photo in restaurant.Gallery)
            {
                Assert.StartsWith($"/api/public/restaurants/{slug}/gallery/{photo.Id}?v=", photo.Url);
                var image = await guest.GetAsync(photo.Url, Ct);
                Assert.Equal(HttpStatusCode.OK, image.StatusCode);
                Assert.Contains(image.Content.Headers.ContentType?.MediaType, new[] { "image/jpeg", "image/webp" });
            }
        }
    }

    [Fact]
    public void The_gallery_photos_are_JPEG_or_WebP_of_at_most_about_350_KB()
    {
        var folder = Path.Combine(factory.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath, "Data", "SeedAssets");
        var files = Directory.GetFiles(folder, "*-gallery-*");

        Assert.InRange(files.Length, 18, 24);
        Assert.All(files, f => Assert.Contains(Path.GetExtension(f), new[] { ".jpg", ".webp" }));
        Assert.All(files, f => Assert.InRange(new FileInfo(f).Length, 1, 360 * 1024));
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

    [Fact]
    public void Every_seed_asset_has_complete_credits()
    {
        var folder = Path.Combine(factory.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath, "Data", "SeedAssets");
        var credits = File.ReadAllText(Path.Combine(folder, "CREDITS.md"));
        var sections = Regex.Split(credits, @"^(?=## `)", RegexOptions.Multiline).Skip(1).ToList();

        // One section per file, and no section without its file.
        Assert.Equal(
            Directory.GetFiles(folder).Select(Path.GetFileName).Where(f => f != "CREDITS.md").Order(),
            sections.Select(section => Regex.Match(section, @"^## `([^`]+)`").Groups[1].Value).Order());
        foreach (var section in sections)
        {
            foreach (var field in new[] { "- Source: ", "- Licence: ", "- Retrieved: ", "- Changes: " })
            {
                Assert.Contains(field, section);
            }
            Assert.True(section.Contains("- Author: ") || section.Contains("- Photographer: "), section);
        }
    }

    /// <summary>The tables and their chairs do not touch a blocking element or the room in front of an entrance.</summary>
    private static void AssertClearOfElements(List<TableResponse> tables, IReadOnlyList<RoomElementResponse> elements) =>
        RoomLayoutTests.AssertClearOfElements(
            tables.Select(t => new Table { Number = t.Number, Seats = t.Seats, Shape = t.Shape, Rotation = t.Rotation, PosX = t.PosX, PosY = t.PosY }),
            elements.Select(e => new RoomElement { Kind = e.Kind, PosX = e.PosX, PosY = e.PosY, Width = e.Width, Height = e.Height, Rotation = e.Rotation }),
            100,
            TableLayout.ChairSpace);

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

/// <summary>
/// The seed and area photos and descriptions the admin maintained, on a factory of its own: the other seed tests count the uploaded files.
/// </summary>
public class DevelopmentSeedAreaPhotoTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task SeedAsync()
    {
        using var scope = factory.Services.CreateScope();
        await DevelopmentSeed.SeedRestaurantsAsync(scope.ServiceProvider);
    }

    [Fact]
    public async Task The_seed_adds_photo_and_description_only_to_an_area_that_has_neither()
    {
        await SeedAsync();
        using var linde = factory.CreateHttpsClient();
        (await linde.PostAsJsonAsync("/api/auth/login", new { email = "admin@zur-linde.test", password = ApiFactory.Password }, Ct)).EnsureSuccessStatusCode();
        var areas = (await linde.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!;
        var (gaststube, terrasse) = (areas.Single(a => a.Name == "Gaststube"), areas.Single(a => a.Name == "Terrasse"));
        // Gaststube keeps an own description without photo; Terrasse loses both, like an area from before the photos.
        (await linde.DeleteAsync($"/api/admin/areas/{gaststube.Id}/photo", Ct)).EnsureSuccessStatusCode();
        (await linde.PutAsJsonAsync($"/api/admin/areas/{gaststube.Id}", new { name = "Gaststube", onlineBookingEnabled = true, onlineCapacityPercent = 100, description = "Unsere Stube" }, Ct)).EnsureSuccessStatusCode();
        (await linde.DeleteAsync($"/api/admin/areas/{terrasse.Id}/photo", Ct)).EnsureSuccessStatusCode();
        (await linde.PutAsJsonAsync($"/api/admin/areas/{terrasse.Id}", new { name = "Terrasse", onlineBookingEnabled = true, onlineCapacityPercent = 50, description = "" }, Ct)).EnsureSuccessStatusCode();

        await SeedAsync();

        areas = (await linde.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!;
        var gaststubeAfter = areas.Single(a => a.Id == gaststube.Id);
        Assert.Equal(("Unsere Stube", null), (gaststubeAfter.Description, gaststubeAfter.PhotoUrl));
        var terrasseAfter = areas.Single(a => a.Id == terrasse.Id);
        Assert.Equal(terrasse.Description, terrasseAfter.Description);
        Assert.NotNull(terrasseAfter.PhotoUrl);
        Assert.NotEqual(terrasse.PhotoUrl, terrasseAfter.PhotoUrl);
    }
}

/// <summary>
/// The seed and a gallery the admin maintained, on a factory of its own: the other seed tests count the uploaded files.
/// </summary>
public class DevelopmentSeedGalleryTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task SeedAsync()
    {
        using var scope = factory.Services.CreateScope();
        await DevelopmentSeed.SeedRestaurantsAsync(scope.ServiceProvider);
    }

    [Fact]
    public async Task The_seed_adds_the_gallery_only_to_a_restaurant_without_photos()
    {
        await SeedAsync();
        using var linde = factory.CreateHttpsClient();
        (await linde.PostAsJsonAsync("/api/auth/login", new { email = "admin@zur-linde.test", password = ApiFactory.Password }, Ct)).EnsureSuccessStatusCode();
        using var dunav = factory.CreateHttpsClient();
        (await dunav.PostAsJsonAsync("/api/auth/login", new { email = "admin@kafana-dunav.test", password = ApiFactory.Password }, Ct)).EnsureSuccessStatusCode();
        // Linde keeps one photo with an own caption; Dunav deletes all of its photos.
        var lindeGallery = (await linde.GetFromJsonAsync<List<GalleryEndpoints.GalleryPhotoResponse>>("/api/admin/gallery", Ct))!;
        foreach (var photo in lindeGallery.Skip(1))
        {
            (await linde.DeleteAsync($"/api/admin/gallery/{photo.Id}", Ct)).EnsureSuccessStatusCode();
        }
        (await linde.PutAsJsonAsync($"/api/admin/gallery/{lindeGallery[0].Id}", new { caption = "Unser Lieblingsbild" }, Ct)).EnsureSuccessStatusCode();
        var dunavGallery = (await dunav.GetFromJsonAsync<List<GalleryEndpoints.GalleryPhotoResponse>>("/api/admin/gallery", Ct))!;
        foreach (var photo in dunavGallery)
        {
            (await dunav.DeleteAsync($"/api/admin/gallery/{photo.Id}", Ct)).EnsureSuccessStatusCode();
        }

        await SeedAsync();

        Assert.Equal([lindeGallery[0] with { Caption = "Unser Lieblingsbild" }], await linde.GetFromJsonAsync<List<GalleryEndpoints.GalleryPhotoResponse>>("/api/admin/gallery", Ct));
        var dunavAfter = (await dunav.GetFromJsonAsync<List<GalleryEndpoints.GalleryPhotoResponse>>("/api/admin/gallery", Ct))!;
        Assert.Equal(dunavGallery.Select(p => p.Caption), dunavAfter.Select(p => p.Caption));
        Assert.Empty(dunavAfter.Select(p => p.Id).Intersect(dunavGallery.Select(p => p.Id)));
    }
}
