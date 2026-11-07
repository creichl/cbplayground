using Cbplayground.Api.Auth;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.FloorPlans;
using Cbplayground.Api.OpeningHours;
using Cbplayground.Api.Reservations;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Data.TableShape;

namespace Cbplayground.Api.Data;

/// <summary>
/// Demo data for local development: the three demo restaurants with their setup (<see cref="SeedRestaurantsAsync"/>),
/// the demo staff users from the "Seed:Users" section of appsettings.Development.json (<see cref="SeedUsersAsync"/>)
/// and demo reservations for the past 7 days, today and the next 7 days (<see cref="SeedReservationsAsync(IServiceProvider)"/>).
/// </summary>
public static class DevelopmentSeed
{
    public record SeedUser(string Email, string Password, string DisplayName, string Role, string? TenantSlug = null);

    /// <summary>Folder of the seed floor plans, logos, cover images, area photos and gallery photos, relative to the content root; the photos' sources are in CREDITS.md there.</summary>
    private static readonly string SeedAssetsPath = Path.Combine("Data", "SeedAssets");

    /// <summary>Size of the seed floor plans in pixels; the table positions below are given in pixels of these images.</summary>
    private const double PlanWidth = 1800;
    private const double PlanHeight = 1200;

    /// <summary>A demo table; in an area without floor plan the position is ignored and the tables are arranged (<see cref="TableLayout"/>).</summary>
    private record DemoTable(string Number, int Seats, TableShape Shape, double X = 0, double Y = 0, int Rotation = 0);

    /// <summary>
    /// A demo area; without <see cref="FloorPlanFile"/> it has no floor plan image. <see cref="WidthMeters"/> is the real width
    /// of the plan (of the image, or of the drawn room); the table scale follows from it, so the tables are drawn at their real
    /// size (a table for 4 is 85 cm, <see cref="TableLayout.RealSizeScale"/>). <see cref="PhotoFile"/> is a photo in
    /// <see cref="SeedAssetsPath"/>, <see cref="Description"/> is in the restaurant's language. <see cref="Room"/> creates the
    /// elements of its room, new ones on every call.
    /// </summary>
    private record DemoArea(string Name, string? FloorPlanFile, int OnlineCapacityPercent, double WidthMeters, DemoTable[] Tables,
        string Description, string PhotoFile, RoomStyle RoomStyle = RoomStyle.Indoor, Func<List<RoomElement>>? Room = null);

    private record DemoPeriod(DayOfWeek Day, TimeOnly Start, TimeOnly End);

    /// <summary>Tables of a demo area that can be pushed together; seats and the smallest online party are the defaults.</summary>
    private record DemoCombination(string Area, string[] Tables);

    /// <summary>A demo branding; <see cref="LogoFile"/> and <see cref="CoverFile"/> are files in <see cref="SeedAssetsPath"/>.</summary>
    private record DemoBranding(string BrandColor, ThemeMode ThemeMode, FontStyle FontStyle, string LogoFile, string CoverFile);

    /// <summary>A photo of the demo gallery: a file in <see cref="SeedAssetsPath"/> and its caption in the restaurant's language.</summary>
    private record DemoGalleryPhoto(string File, string Caption);

    private record DemoRestaurant(
        string Name,
        string Slug,
        string CountryCode,
        string? RegionCode,
        ProfileEndpoints.ProfileDto Profile,
        DemoPeriod[] OpeningHours,
        DemoArea[] Areas,
        ReservationSettings Settings,
        DurationRule[] DurationRules,
        DemoBranding Branding,
        DemoGalleryPhoto[] Gallery,
        DemoCombination[] Combinations);

    private static readonly DayOfWeek[] TuesdayToSunday =
        [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static readonly DayOfWeek[] WednesdayToSunday =
        [DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static readonly DemoRestaurant[] Restaurants =
    [
        new(
            Name: "Gasthaus zur Linde",
            Slug: "zur-linde",
            CountryCode: Locations.Germany,
            RegionCode: "DE-BY",
            Profile: new(
                Street: "Lindenstraße 12",
                PostalCode: "80331",
                City: "München",
                Phone: "+49 89 2345678",
                Email: "info@zur-linde.example",
                Website: "https://www.zur-linde.example",
                Description: "Bayerisches Wirtshaus mit Kachelofen-Stube und schattiger Terrasse unter der Kastanie. Regionale Küche, Mittagstisch und Bier vom Holzfass.\n\n"
                    + "Seit drei Generationen kochen wir, was die Höfe rund um München liefern: Schweinsbraten mit Kruste, Kalbsbackerl, Kasspatzn und im Herbst Wild aus dem Ebersberger Forst. Unsere Knödel drehen wir jeden Morgen von Hand.\n\n"
                    + "In der Stube wärmt im Winter der grüne Kachelofen, im Sommer sitzen Sie unter der alten Kastanie auf der Terrasse oder im Biergarten. Das Helle und das Dunkle kommen frisch vom Holzfass.\n\n"
                    + "Familien, Stammtische und Hunde sind bei uns gleichermaßen willkommen. Mittags gibt es unter der Woche einen wechselnden Mittagstisch."),
            // Tuesday to Sunday 11:30–14:30 and 17:30–22:00, closed on Mondays.
            OpeningHours:
            [
                .. TuesdayToSunday.Select(day => new DemoPeriod(day, new TimeOnly(11, 30), new TimeOnly(14, 30))),
                .. TuesdayToSunday.Select(day => new DemoPeriod(day, new TimeOnly(17, 30), new TimeOnly(22, 0))),
            ],
            Areas:
            [
                // A room of 11.8 × 7.5 m: tiled stove with its bench, corner bench, bar with stools, entrance at the bottom.
                new("Gaststube", "gaststube.webp", 100, 13,
                [
                    new("1", 2, Square, 443, 194), new("2", 4, Square, 658, 208), new("3", 4, Square, 900, 208),
                    new("4", 2, Square, 1115, 194), new("5", 2, Square, 1308, 194),
                    new("6", 4, Square, 208, 554), new("7", 6, Rectangle, 519, 554), new("8", 8, Rectangle, 907, 554),
                    new("9", 4, Round, 415, 900), new("10", 6, Rectangle, 1094, 872),
                ],
                Description: "Gemütliche Stube mit Holzbänken und Herrgottswinkel, wie früher beim Wirt im Dorf.",
                PhotoFile: "gaststube-photo.jpg"),
                // 13 × 8 m of stone slabs between the house and the hedges, the chestnut with its round bench at the bottom right.
                new("Terrasse", "terrasse.webp", 50, 14,
                [
                    new("T1", 4, Round, 206, 257), new("T2", 4, Round, 476, 309), new("T3", 6, Rectangle, 1363, 257),
                    new("T4", 2, Round, 206, 720), new("T5", 4, Round, 540, 823), new("T6", 2, Round, 874, 540),
                ],
                Description: "Schattige Terrasse unter alten Bäumen, im Sommer der schönste Platz im Haus.",
                PhotoFile: "terrasse-photo.jpg"),
            ],
            Settings: new ReservationSettings
            {
                ConfirmationMode = ConfirmationMode.Instant,
                TableSelectionMode = TableSelectionMode.SystemAssigns,
                DefaultDurationMinutes = 120,
            },
            DurationRules:
            [
                new DurationRule { MinGuests = 1, MaxGuests = 2, DurationMinutes = 90 },
                new DurationRule { MinGuests = 3, MaxGuests = 6, DurationMinutes = 120 },
            ],
            // A warm green, like the linden tree.
            Branding: new("#5a7d3a", ThemeMode.Light, FontStyle.Rustic, "zur-linde-logo.png", "zur-linde-cover.jpg"),
            Gallery:
            [
                new("zur-linde-gallery-schweinsbraten.jpg", "Schweinsbraten mit Knödel und Blaukraut"),
                new("zur-linde-gallery-holzfass.jpg", "Dunkles frisch vom Holzfass"),
                new("zur-linde-gallery-kachelofen.jpg", "Die Stube mit dem grünen Kachelofen"),
                new("zur-linde-gallery-biergarten.jpg", "Biergarten unter alten Kastanien"),
                new("zur-linde-gallery-weisswurst-brezn.jpg", "Weißwurst mit Brezn und süßem Senf"),
                new("zur-linde-gallery-helles.jpg", "Ein frisches Helles im Garten"),
                new("zur-linde-gallery-kaiserschmarrn.jpg", "Kaiserschmarrn mit Apfelmus"),
            ],
            // Two tables for 4 pushed together for a group of up to 8.
            Combinations: [new("Gaststube", ["2", "3"])]),
        new(
            Name: "Kafana Dunav",
            Slug: "kafana-dunav",
            CountryCode: Locations.Serbia,
            RegionCode: null,
            Profile: new(
                Street: "Sunčani kej 7",
                PostalCode: "21000",
                City: "Novi Sad",
                Phone: "+381 21 4567890",
                Email: "info@kafana-dunav.example",
                Website: "https://www.kafana-dunav.example",
                Description: "Kafana na keju uz Dunav: domaća kuhinja, riblja čorba i roštilj, a petkom i subotom tamburaši uživo.\n\n"
                    + "Riblju čorbu kuvamo u kotliću na otvorenoj vatri, od šarana i soma iz Dunava, a roštilj pečemo na ćumuru: ćevapi, pljeskavica, vešalica i domaća kobasica. Uz to ide domaći hleb, ajvar i kajmak.\n\n"
                    + "U bašti pod lipama gledate kako se Dunav sporo kreće prema Petrovaradinu, a zimi se okupljamo u toploj sali. Vinska karta je iz fruškogorskih podruma.\n\n"
                    + "Petkom i subotom uveče sviraju tamburaši, i tada je kafana puna pesme. Za veća društva i porodična slavlja rado pripremamo poseban meni."),
            // Every day 12:00–24:00.
            OpeningHours: [.. Enum.GetValues<DayOfWeek>().Select(day => new DemoPeriod(day, new TimeOnly(12, 0), OpeningPeriod.EndOfDay))],
            Areas:
            [
                // A room of 13.8 × 8.8 m: bar with stools at the top right, a podium for the musicians at the bottom right.
                new("Sala", "sala.webp", 100, 15,
                [
                    new("1", 2, Square, 240, 168), new("2", 4, Square, 480, 180), new("3", 4, Square, 720, 180),
                    new("4", 6, Rectangle, 1152, 240, Rotation: 90),
                    new("5", 4, Square, 240, 552), new("6", 6, Rectangle, 516, 552), new("7", 8, Rectangle, 864, 552),
                    new("8", 4, Round, 1200, 576),
                    new("9", 2, Square, 240, 888), new("10", 4, Square, 468, 888), new("11", 4, Square, 1080, 876),
                    new("12", 2, Square, 1284, 912),
                ],
                Description: "Topla sala sa domaćom atmosferom, za porodične ručkove i veća društva.",
                PhotoFile: "sala-photo.jpg"),
                // The garden has no floor plan image: the web draws its room, the suggested garden with the river at the top.
                new("Bašta", null, 100, 12,
                [
                    new("B1", 2, Round), new("B2", 4, Square), new("B3", 4, Round),
                    new("B4", 6, Rectangle), new("B5", 8, Rectangle), new("B6", 2, Square),
                ],
                Description: "Bašta u hladu lipa, pogled na Dunav",
                PhotoFile: "basta-photo.jpg",
                RoomStyle.Garden,
                () => [.. RoomSuggestion.Suggest(RoomStyle.Garden, 6), Label("Dunav", 0.27, top: true)]),
            ],
            Settings: new ReservationSettings
            {
                ConfirmationMode = ConfirmationMode.Request,
                TableSelectionMode = TableSelectionMode.GuestChooses,
                DefaultDurationMinutes = 120,
            },
            DurationRules: [],
            // Danube blue.
            Branding: new("#1f5f8b", ThemeMode.Light, FontStyle.Classic, "kafana-dunav-logo.png", "kafana-dunav-cover.jpg"),
            Gallery:
            [
                new("kafana-dunav-gallery-riblja-corba.jpg", "Riblja čorba iz kotlića"),
                new("kafana-dunav-gallery-rostilj.jpg", "Mešano meso sa roštilja"),
                new("kafana-dunav-gallery-vino.jpg", "Čaša crnog vina u suton"),
                new("kafana-dunav-gallery-dunav.jpg", "Veče na Dunavu"),
                new("kafana-dunav-gallery-tamburasi.jpg", "Tamburaši petkom i subotom"),
                new("kafana-dunav-gallery-sto.jpg", "Postavljen sto čeka goste"),
            ],
            // Two tables for 4 pushed together for a group of up to 8.
            Combinations: [new("Sala", ["2", "3"])]),
        new(
            Name: "Rooftop Belvedere",
            Slug: "rooftop-belvedere",
            CountryCode: Locations.Austria,
            RegionCode: null,
            Profile: new(
                Street: "Prinz-Eugen-Straße 18",
                PostalCode: "1040",
                City: "Wien",
                Phone: "+43 1 5054321",
                Email: "info@rooftop-belvedere.example",
                Website: "https://www.rooftop-belvedere.example",
                Description: "Rooftop-Bar über den Dächern Wiens mit Blick über die ganze Stadt: Signature-Cocktails, Sharing-Plates zum Teilen und lange Sommerabende unter freiem Himmel.\n\n"
                    + "Unsere Bar mixt Klassiker und eigene Kreationen mit Wiener Note, etwa den Belvedere Spritz mit Holunder und Marille. Dazu kommen mediterrane Sharing-Plates aus der offenen Küche: Burrata, gegrillte Pulpo, Mezze und Flatbreads.\n\n"
                    + "Von der Dachterrasse sehen Sie den Stephansdom, das Belvedere und bei klarem Wetter bis zum Kahlenberg. Wenn es regnet, rückt die Lounge hinter den Panoramafenstern zusammen.\n\n"
                    + "Ab Sonnenuntergang legt mittwochs bis samstags ein DJ auf. Ein Lift bringt Sie stufenlos vom Eingang bis aufs Dach."),
            // Wednesday to Sunday 17:00–24:00.
            OpeningHours: [.. WednesdayToSunday.Select(day => new DemoPeriod(day, new TimeOnly(17, 0), OpeningPeriod.EndOfDay))],
            // Both areas with a floor plan image; the image shows the room, so they have no room elements.
            Areas:
            [
                // A deck of 16 × 10 m behind glass: stairs and lift at the top left, the bar at the back, planters, the view at the bottom.
                new("Rooftop", "rooftop.webp", 70, 18,
                [
                    new("R1", 2, Round, 650, 450), new("R2", 2, Round, 870, 450), new("R3", 4, Square, 1110, 450),
                    new("R4", 4, Round, 1400, 460),
                    new("R5", 4, Square, 360, 880), new("R6", 6, Rectangle, 660, 900), new("R7", 2, Round, 970, 910),
                    new("R8", 6, Round, 1280, 880),
                ],
                Description: "Dachterrasse mit Blick über die Stadt, Cocktails unter freiem Himmel.",
                PhotoFile: "rooftop-photo.jpg",
                RoomStyle.Rooftop),
                // A room of 13 × 8.2 m: panorama windows at the top, a sofa at each side wall, a small bar at the bottom right.
                new("Lounge", "lounge.webp", 100, 14,
                [
                    new("L1", 2, Round, 386, 231), new("L2", 4, Square, 720, 244), new("L3", 4, Round, 1080, 244),
                    new("L4", 6, Rectangle, 540, 694), new("L5", 8, Rectangle, 1003, 643),
                ],
                Description: "Lounge hinter Panoramafenstern mit bequemen Sesseln, auch bei Regen mit Blick über die Dächer.",
                PhotoFile: "lounge-photo.jpg"),
            ],
            Settings: new ReservationSettings
            {
                ConfirmationMode = ConfirmationMode.Instant,
                TableSelectionMode = TableSelectionMode.GuestChooses,
                DefaultDurationMinutes = 120,
            },
            DurationRules: [],
            // Dark and elegant with a champagne gold accent.
            Branding: new("#c9a96e", ThemeMode.Dark, FontStyle.Elegant, "rooftop-belvedere-logo.png", "rooftop-belvedere-cover.jpg"),
            Gallery:
            [
                new("rooftop-belvedere-gallery-cocktails.jpg", "Signature-Cocktails auf der Terrasse"),
                new("rooftop-belvedere-gallery-sharing-plates.jpg", "Sharing-Plates zum Teilen"),
                new("rooftop-belvedere-gallery-bar.jpg", "An der Bar am Abend"),
                new("rooftop-belvedere-gallery-sonnenuntergang.jpg", "Wien im Licht des Sonnenuntergangs"),
                new("rooftop-belvedere-gallery-lounge.jpg", "Die Lounge-Ecke"),
                new("rooftop-belvedere-gallery-champagner.jpg", "Champagner zum Anstoßen"),
                new("rooftop-belvedere-gallery-blick.jpg", "Blick über die Dächer Wiens"),
            ],
            // Two tables for 4 pushed together for a group of up to 8.
            Combinations: [new("Lounge", ["L2", "L3"])]),
    ];

    /// <summary>A label of its default size at the top or bottom edge of the plan, centred at <paramref name="x"/>, readable (rotation 0).</summary>
    private static RoomElement Label(string text, double x, bool top)
    {
        var label = RoomSuggestion.Element(RoomElementKind.Label, 0, x, 0);
        label.PosY = top ? label.Height / 2 : 1 - label.Height / 2;
        label.Label = text;
        return label;
    }

    /// <summary>
    /// Creates the demo restaurants that do not exist yet and completes their setup. Each part is only added
    /// when the restaurant has nothing of it yet, so a second run adds nothing and nothing the admin maintained is overwritten:
    /// location (no country), profile (all profile fields empty), branding with logo and cover image (all branding fields empty),
    /// opening hours (none), areas with floor plans, rooms, tables, photo and description (no areas), reservation settings with duration
    /// rules (never saved), the photo gallery with its captions (no photos), the menu with its dish photos (no menu sections, see DemoMenus). An existing demo area gets its photo and description when it has neither.
    /// A demo image whose file is no longer in the uploads folder (logo, cover image, floor plan and photo of a demo area, gallery photo
    /// with a demo caption) gets a new copy of its seed asset, so the restaurants show all their images again after the files were lost.
    /// </summary>
    public static async Task SeedRestaurantsAsync(IServiceProvider services)
    {
        var options = services.GetRequiredService<DbContextOptions<AppDbContext>>();
        var environment = services.GetRequiredService<IWebHostEnvironment>();
        var configuration = services.GetRequiredService<IConfiguration>();
        var uploads = ImageUploads.UploadsDirectory(configuration, environment);
        Directory.CreateDirectory(uploads);

        // A new file name for every copy, as for an upload, so replacing or deleting the image deletes only its own copy.
        string CopySeedAsset(string file)
        {
            var fileName = $"{Guid.NewGuid():N}{Path.GetExtension(file)}";
            File.Copy(Path.Combine(environment.ContentRootPath, SeedAssetsPath, file), Path.Combine(uploads, fileName));
            return fileName;
        }

        // An image the database names but the uploads folder no longer has; the API answers it with 404.
        bool IsLost(string? fileName) => fileName is not null && !File.Exists(Path.Combine(uploads, fileName));

        foreach (var demo in Restaurants)
        {
            Guid tenantId;
            // Tenants are not tenant-owned, so this context needs no tenant.
            await using (var db = new AppDbContext(options, new SeedTenantContext(null)))
            {
                var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Slug == demo.Slug);
                if (tenant is null)
                {
                    tenant = new Tenant { Name = demo.Name, Slug = demo.Slug, CreatedAt = DateTime.UtcNow };
                    db.Tenants.Add(tenant);
                }
                if (tenant.CountryCode is null)
                {
                    tenant.CountryCode = demo.CountryCode;
                    tenant.RegionCode = demo.RegionCode;
                    tenant.TimeZoneId = Locations.TimeZones[demo.CountryCode];
                }
                if (tenant is { Street: null, PostalCode: null, City: null, Phone: null, Email: null, Website: null, Description: null })
                {
                    tenant.Street = demo.Profile.Street;
                    tenant.PostalCode = demo.Profile.PostalCode;
                    tenant.City = demo.Profile.City;
                    tenant.Phone = demo.Profile.Phone;
                    tenant.Email = demo.Profile.Email;
                    tenant.Website = demo.Profile.Website;
                    tenant.Description = demo.Profile.Description;
                }
                if (tenant is { BrandColor: null, ThemeMode: null, FontStyle: null, LogoFileName: null, CoverFileName: null })
                {
                    tenant.BrandColor = demo.Branding.BrandColor;
                    tenant.ThemeMode = demo.Branding.ThemeMode;
                    tenant.FontStyle = demo.Branding.FontStyle;
                    tenant.LogoFileName = CopySeedAsset(demo.Branding.LogoFile);
                    tenant.CoverFileName = CopySeedAsset(demo.Branding.CoverFile);
                }
                if (IsLost(tenant.LogoFileName))
                {
                    tenant.LogoFileName = CopySeedAsset(demo.Branding.LogoFile);
                }
                if (IsLost(tenant.CoverFileName))
                {
                    tenant.CoverFileName = CopySeedAsset(demo.Branding.CoverFile);
                }
                await db.SaveChangesAsync();
                tenantId = tenant.Id;
            }

            // The restaurant's own data is written as that restaurant, so the tenant rules of AppDbContext apply as in a request.
            await using (var db = new AppDbContext(options, new SeedTenantContext(tenantId)))
            {
                if (!await db.OpeningPeriods.AnyAsync())
                {
                    db.OpeningPeriods.AddRange(demo.OpeningHours.Select(p => new OpeningPeriod { DayOfWeek = p.Day, Start = p.Start, End = p.End }));
                }

                if (!await db.Areas.AnyAsync())
                {
                    for (var i = 0; i < demo.Areas.Length; i++)
                    {
                        var demoArea = demo.Areas[i];
                        var fileName = demoArea.FloorPlanFile is null ? null : CopySeedAsset(demoArea.FloorPlanFile);

                        var area = new Area
                        {
                            Id = Guid.NewGuid(),
                            Name = demoArea.Name,
                            SortOrder = i,
                            FloorPlanFileName = fileName,
                            Description = demoArea.Description,
                            PhotoFileName = CopySeedAsset(demoArea.PhotoFile),
                            OnlineCapacityPercent = demoArea.OnlineCapacityPercent,
                            TableScale = TableLayout.RealSizeScale(demoArea.WidthMeters),
                            WidthMeters = demoArea.WidthMeters,
                            RoomStyle = demoArea.RoomStyle,
                        };
                        db.Areas.Add(area);
                        var elements = demoArea.Room?.Invoke() ?? [];
                        for (var e = 0; e < elements.Count; e++)
                        {
                            elements[e].AreaId = area.Id;
                            elements[e].SortOrder = e;
                        }
                        db.RoomElements.AddRange(elements);
                        var tables = demoArea.Tables.Select(t => new Table
                        {
                            AreaId = area.Id,
                            Number = t.Number,
                            Seats = t.Seats,
                            // Online the large tables stay for groups, as a restaurant would set them.
                            MinGuests = t.Seats switch { >= 8 => 5, >= 6 => 3, _ => 1 },
                            Shape = t.Shape,
                            Rotation = t.Rotation,
                            PosX = t.X / PlanWidth,
                            PosY = t.Y / PlanHeight,
                        }).ToList();
                        if (fileName is null)
                        {
                            TableLayout.Arrange(tables, area.TableScale, elements);
                        }
                        db.Tables.AddRange(tables);
                    }
                }
                else
                {
                    // Areas from before the photos, and areas whose photo and description were both removed.
                    foreach (var area in await db.Areas.Where(a => a.Description == null && a.PhotoFileName == null).ToListAsync())
                    {
                        if (demo.Areas.SingleOrDefault(d => d.Name == area.Name) is { } demoArea)
                        {
                            area.Description = demoArea.Description;
                            area.PhotoFileName = CopySeedAsset(demoArea.PhotoFile);
                        }
                    }

                    // Demo areas whose floor plan or photo file was lost.
                    foreach (var area in await db.Areas.ToListAsync())
                    {
                        if (demo.Areas.SingleOrDefault(d => d.Name == area.Name) is not { } demoArea)
                        {
                            continue;
                        }
                        if (IsLost(area.FloorPlanFileName) && demoArea.FloorPlanFile is not null)
                        {
                            area.FloorPlanFileName = CopySeedAsset(demoArea.FloorPlanFile);
                        }
                        if (IsLost(area.PhotoFileName))
                        {
                            area.PhotoFileName = CopySeedAsset(demoArea.PhotoFile);
                        }
                    }
                }

                // Saved first, so the combinations find the tables of new areas.
                await db.SaveChangesAsync();
                if (!await db.TableCombinations.AnyAsync())
                {
                    var areas = await db.Areas.ToListAsync();
                    var tables = await db.Tables.ToListAsync();
                    foreach (var demoCombination in demo.Combinations)
                    {
                        // Only while the area and its tables are as in the demo.
                        var area = areas.SingleOrDefault(a => a.Name == demoCombination.Area);
                        var combined = demoCombination.Tables.Select(number => tables.SingleOrDefault(t => t.Number == number && t.AreaId == area?.Id)).ToList();
                        if (area is null || combined.Any(t => t is null))
                        {
                            continue;
                        }
                        db.TableCombinations.Add(new TableCombination
                        {
                            AreaId = area.Id,
                            Seats = combined.Sum(t => t!.Seats),
                            MinGuests = combined.Max(t => t!.Seats) + 1,
                            Tables = combined.Select(t => new TableCombinationTable { TableId = t!.Id }).ToList(),
                        });
                    }
                }

                if (!await db.ReservationSettings.AnyAsync())
                {
                    db.ReservationSettings.Add(new ReservationSettings
                    {
                        ConfirmationMode = demo.Settings.ConfirmationMode,
                        TableSelectionMode = demo.Settings.TableSelectionMode,
                        DefaultDurationMinutes = demo.Settings.DefaultDurationMinutes,
                    });
                    if (!await db.DurationRules.AnyAsync())
                    {
                        db.DurationRules.AddRange(demo.DurationRules.Select(r => new DurationRule
                        {
                            MinGuests = r.MinGuests,
                            MaxGuests = r.MaxGuests,
                            DurationMinutes = r.DurationMinutes,
                        }));
                    }
                }

                await DemoDetails.SeedAsync(db, demo.Slug);

                if (!await db.GalleryPhotos.AnyAsync())
                {
                    db.GalleryPhotos.AddRange(demo.Gallery.Select((photo, i) => new GalleryPhoto
                    {
                        FileName = CopySeedAsset(photo.File),
                        Caption = photo.Caption,
                        SortOrder = i,
                        CreatedAt = DateTime.UtcNow,
                    }));
                }
                else
                {
                    // Gallery photos with a demo caption whose file was lost.
                    foreach (var photo in (await db.GalleryPhotos.ToListAsync()).Where(p => IsLost(p.FileName)))
                    {
                        if (demo.Gallery.FirstOrDefault(d => d.Caption == photo.Caption) is { } demoPhoto)
                        {
                            photo.FileName = CopySeedAsset(demoPhoto.File);
                        }
                    }
                }

                await DemoMenus.SeedAsync(db, demo.Slug, CopySeedAsset, IsLost);
                await db.SaveChangesAsync();
            }
        }
    }

    /// <summary>Adds every configured user that does not exist yet; existing users are left as they are.</summary>
    public static async Task SeedUsersAsync(IServiceProvider services, IConfiguration configuration)
    {
        var db = services.GetRequiredService<AppDbContext>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var users = configuration.GetSection("Seed:Users").Get<List<SeedUser>>() ?? [];

        foreach (var seedUser in users)
        {
            if (await userManager.FindByEmailAsync(seedUser.Email) is not null)
            {
                continue;
            }

            Guid? tenantId = null;
            if (seedUser.TenantSlug is not null)
            {
                var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Slug == seedUser.TenantSlug)
                    ?? throw new InvalidOperationException($"Seed user {seedUser.Email}: there is no tenant with the slug '{seedUser.TenantSlug}'.");
                tenantId = tenant.Id;
            }

            var user = new ApplicationUser
            {
                UserName = seedUser.Email,
                Email = seedUser.Email,
                EmailConfirmed = true,
                DisplayName = seedUser.DisplayName,
                TenantId = tenantId,
            };
            ThrowOnError(await userManager.CreateAsync(user, seedUser.Password), seedUser.Email);
            ThrowOnError(await userManager.AddToRoleAsync(user, seedUser.Role), seedUser.Email);
        }
    }

    /// <summary>
    /// Adds demo reservations from today to today + 7 days for every restaurant that has tables, a location and opening hours,
    /// but no reservations from today on; and, if it has none in the past 7 days either, for those days too (so the Superadmin's
    /// bookings of the last 7 days show a figure). Wherever the tables come from (demo data or entered by hand) does not matter.
    /// </summary>
    public static async Task SeedReservationsAsync(IServiceProvider services)
    {
        List<Tenant> tenants;
        using (var scope = services.CreateScope())
        {
            tenants = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Tenants.ToListAsync();
        }

        foreach (var tenant in tenants)
        {
            // One scope per restaurant: its tenant is set explicitly, as for the public endpoints.
            using var scope = services.CreateScope();
            scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenant.Id;
            await SeedReservationsAsync(scope.ServiceProvider, tenant);
        }
    }

    private static async Task SeedReservationsAsync(IServiceProvider services, Tenant tenant)
    {
        var db = services.GetRequiredService<AppDbContext>();
        var openingCalendar = services.GetRequiredService<IOpeningCalendar>();
        var durationPolicy = services.GetRequiredService<IReservationDurationPolicy>();
        if (await services.GetRequiredService<IAvailabilityService>().GetLocalNowAsync() is not { } now)
        {
            return;
        }

        var today = DateOnly.FromDateTime(now);
        var todayStart = today.ToDateTime(TimeOnly.MinValue);
        if (await db.Reservations.AnyAsync(r => r.StartLocal >= todayStart))
        {
            return;
        }
        var weekAgo = todayStart.AddDays(-7);
        var firstDay = await db.Reservations.AnyAsync(r => r.StartLocal >= weekAgo) ? 0 : -7;
        var tables = await db.Tables.Where(t => t.ArchivedAtUtc == null)
            .Join(db.Areas.Where(a => a.ArchivedAtUtc == null), t => t.AreaId, a => a.Id, (t, a) => new { Table = t, Area = a })
            .ToListAsync();
        if (tables.Count == 0)
        {
            return;
        }
        var tableById = tables.ToDictionary(t => t.Table.Id);
        var settings = await db.ReservationSettings.SingleOrDefaultAsync() ?? new ReservationSettings();
        var guests = DemoGuests.For(tenant.CountryCode);

        // Same demo data on every start of an empty database, different per restaurant.
        var random = new Random(tenant.Id.GetHashCode());
        // Guests who come again: a third of the reservations is theirs, so the front desk sees guests with several visits.
        var regulars = Enumerable.Range(0, RegularGuests).Select(_ => guests.NextRegular(random)).ToList();
        var reservations = new List<Reservation>();
        var referenceCodes = new HashSet<string>();
        for (var day = firstDay; day <= 7; day++)
        {
            var date = today.AddDays(day);
            foreach (var period in await openingCalendar.GetOpenPeriodsAsync(date))
            {
                var periodStart = date.ToDateTime(period.Start);
                var periodEnd = period.End == OpeningPeriod.EndOfDay ? date.AddDays(1).ToDateTime(TimeOnly.MinValue) : date.ToDateTime(period.End);
                var peakTimes = PeakTimes(date, periodStart, periodEnd);

                // 30–60 % of the tables are booked at the peak time of each opening window.
                var occupancy = 0.3 + random.NextDouble() * 0.3;
                foreach (var entry in tables.OrderBy(_ => random.Next()))
                {
                    if (random.NextDouble() >= occupancy)
                    {
                        continue;
                    }

                    var partySize = random.Next((entry.Table.Seats + 1) / 2, entry.Table.Seats + 1);
                    var duration = await durationPolicy.GetDurationAsync(partySize);
                    var starts = peakTimes.Where(t => t.AddMinutes(duration) <= periodEnd).ToList();
                    if (starts.Count == 0)
                    {
                        continue;
                    }
                    var start = starts[random.Next(starts.Count)];
                    var end = start.AddMinutes(duration);
                    if (reservations.Any(r => r.TableId == entry.Table.Id && r.StartLocal < end && r.EndLocal > start))
                    {
                        continue;
                    }

                    // Online only within the area's online quota, as an online booking would have been.
                    var onlineLimit = tables.Where(t => t.Area.Id == entry.Area.Id).Sum(t => t.Table.Seats) * entry.Area.OnlineCapacityPercent / 100;
                    var onlineSeats = reservations
                        .Where(r => r.Source == ReservationSource.Online && r.StartLocal < end && r.EndLocal > start
                            && tableById[r.TableId].Area.Id == entry.Area.Id)
                        .Sum(r => tableById[r.TableId].Table.Seats);
                    var source = entry.Area.OnlineBookingEnabled && onlineSeats + entry.Table.Seats <= onlineLimit && random.NextDouble() < 0.5
                        && partySize >= entry.Table.MinGuests
                        ? ReservationSource.Online
                        : ReservationSource.Staff;

                    var guest = random.NextDouble() < RegularShare ? regulars[random.Next(regulars.Count)] : guests.Next(random);
                    // A regular comes at most once a day.
                    if (regulars.Contains(guest) && reservations.Any(r => r.GuestPhone == guest.Phone && r.StartLocal.Date == start.Date))
                    {
                        guest = guests.Next(random);
                    }
                    var status = day < 0 ? PastDemoStatus(random) : DemoStatus(random, start <= now, source, settings.ConfirmationMode);
                    var reservation = new Reservation
                    {
                        TableId = entry.Table.Id,
                        Tables = [new ReservationTable { TableId = entry.Table.Id }],
                        StartLocal = start,
                        EndLocal = end,
                        DurationMinutes = duration,
                        PartySize = partySize,
                        GuestName = guest.Name,
                        GuestPhone = guest.Phone,
                        GuestEmail = guest.Email,
                        Notes = guest.Notes,
                        Occasion = guest.Notes == guests.BirthdayNote ? Occasion.Birthday : Occasion.None,
                        Status = status,
                        WasRequested = status == ReservationStatus.Requested,
                        Source = source,
                        ReferenceCode = await UniqueReferenceCodeAsync(db, referenceCodes),
                        Language = guest.Language,
                        // A reservation of a past day was made two days before it.
                        CreatedAtUtc = DateTime.UtcNow.AddDays(day < 0 ? day - 2 : 0),
                        UpdatedAtUtc = DateTime.UtcNow,
                    };
                    if (reservation.Status == ReservationStatus.Completed)
                    {
                        reservation.CompletedAtLocal = end;
                    }
                    reservations.Add(reservation);
                }
            }
        }

        // The guest profiles, as the bookings would have made them, in the order the reservations were made.
        foreach (var reservation in reservations.OrderBy(r => r.CreatedAtUtc).ThenBy(r => r.StartLocal))
        {
            await GuestProfiles.LinkAsync(db, reservation, tenant.CountryCode, reservation.CreatedAtUtc);
        }
        // The regular with the most reservations has an allergy the kitchen has to know about.
        var allergic = reservations.Where(r => regulars.Any(g => g.Phone == r.GuestPhone)).GroupBy(r => r.GuestId).MaxBy(g => g.Count())?.Key;
        if (db.Guests.Local.FirstOrDefault(g => g.Id == allergic) is { } allergicGuest)
        {
            allergicGuest.AllergyNotes = guests.AllergyNote;
        }

        db.Reservations.AddRange(reservations);
        foreach (var reservation in reservations)
        {
            ReservationHistory.Record(db, reservation, ReservationEventKind.Created, ReservationEditor.System, reservation.CreatedAtUtc);
        }
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// The start times guests prefer within an opening window: 12:00–13:00 and 18:00–20:00 in quarter hours.
    /// A window without either gets all quarter hours of the window.
    /// </summary>
    private static List<DateTime> PeakTimes(DateOnly date, DateTime periodStart, DateTime periodEnd)
    {
        var quarterHours = new List<DateTime>();
        for (var time = date.ToDateTime(TimeOnly.MinValue); time < periodEnd; time = time.AddMinutes(ReservationRules.SlotMinutes))
        {
            if (time >= periodStart)
            {
                quarterHours.Add(time);
            }
        }
        var peak = quarterHours.Where(t => t.Hour == 12 || (t.Hour == 13 && t.Minute == 0) || t.Hour is 18 or 19 || (t.Hour == 20 && t.Minute == 0)).ToList();
        return peak.Count > 0 ? peak : quarterHours;
    }

    /// <summary>Started reservations of today: mostly arrived, some late or cancelled. Later ones: confirmed, some cancelled; online ones of a request restaurant partly still requested.</summary>
    private static ReservationStatus DemoStatus(Random random, bool started, ReservationSource source, ConfirmationMode confirmationMode)
    {
        var value = random.NextDouble();
        if (started)
        {
            return value < 0.15 ? ReservationStatus.Late : value < 0.22 ? ReservationStatus.Cancelled : ReservationStatus.Arrived;
        }
        if (source == ReservationSource.Online && confirmationMode == ConfirmationMode.Request && value < 0.5)
        {
            return ReservationStatus.Requested;
        }
        return value > 0.93 ? ReservationStatus.Cancelled : ReservationStatus.Confirmed;
    }

    /// <summary>Reservations of a past day: mostly the guests came and left, some did not come, some cancelled.</summary>
    private static ReservationStatus PastDemoStatus(Random random)
    {
        var value = random.NextDouble();
        return value < 0.08 ? ReservationStatus.NoShow : value < 0.15 ? ReservationStatus.Cancelled : ReservationStatus.Completed;
    }

    private static async Task<string> UniqueReferenceCodeAsync(AppDbContext db, HashSet<string> taken)
    {
        while (true)
        {
            var code = await ReferenceCode.GenerateUniqueAsync(db);
            if (taken.Add(code))
            {
                return code;
            }
        }
    }

    /// <summary>The number of demo guests per restaurant who come again and again.</summary>
    private const int RegularGuests = 8;

    /// <summary>The share of the demo reservations that belongs to them.</summary>
    private const double RegularShare = 0.35;

    /// <summary>
    /// Plausible guests for the restaurant's country: German names for Germany and Austria (and without location), Serbian ones for
    /// Serbia. The first of the notes is the birthday, which the reservation also has as its occasion.
    /// </summary>
    private class DemoGuests(string[] firstNames, string[] lastNames, string phonePrefix, string[] languages, string[] notes, string allergyNote)
    {
        public string BirthdayNote => notes[0];

        /// <summary>The allergy note of one of the regulars' profiles.</summary>
        public string AllergyNote => allergyNote;

        public record Guest(string Name, string? Phone, string? Email, string? Notes, string Language);

        public static DemoGuests For(string? countryCode) => countryCode switch
        {
            Locations.Serbia => new DemoGuests(
                ["Marko", "Jelena", "Nikola", "Milica", "Stefan", "Ana", "Luka", "Jovana", "Miloš", "Ivana", "Nemanja", "Dragana", "Aleksandar", "Tamara"],
                ["Jovanović", "Petrović", "Nikolić", "Marković", "Đorđević", "Stojanović", "Ilić", "Stanković", "Pavlović", "Popović", "Kostić", "Savić"],
                "+381 6",
                ["sr-Latn", "sr-Latn", "sr-Cyrl", "en"],
                ["Rođendan", "Dečja stolica, molim", "Sto pored prozora ako je moguće"],
                "Alergija na orašaste plodove"),
            Locations.Austria => new DemoGuests(
                ["Lukas", "Anna", "Maximilian", "Sophie", "Florian", "Katharina", "Tobias", "Lena", "Stefan", "Sabine", "Johannes", "Theresa"],
                ["Gruber", "Huber", "Bauer", "Wagner", "Müller", "Pichler", "Steiner", "Moser", "Mayer", "Hofer", "Leitner", "Berger"],
                "+43 66",
                ["de", "de", "de", "en"],
                ["Geburtstag", "Bitte einen Kinderstuhl", "Wenn möglich am Fenster"],
                "Nussallergie"),
            _ => new DemoGuests(
                ["Lukas", "Anna", "Jonas", "Marie", "Felix", "Laura", "Paul", "Julia", "Thomas", "Monika", "Stefan", "Katrin"],
                ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schulz", "Koch", "Richter"],
                "+49 15",
                ["de", "de", "de", "en"],
                ["Geburtstag", "Bitte einen Kinderstuhl", "Wenn möglich am Fenster"],
                "Nussallergie"),
        };

        /// <summary>A guest with a phone number, an email address or both, sometimes with a note.</summary>
        public Guest Next(Random random)
        {
            var firstName = firstNames[random.Next(firstNames.Length)];
            var lastName = lastNames[random.Next(lastNames.Length)];
            var contact = random.NextDouble();
            var phone = contact < 0.85 ? $"{phonePrefix}{random.Next(0, 10)} {random.Next(1000000, 9999999)}" : null;
            var email = contact > 0.6 ? $"{Ascii(firstName)}.{Ascii(lastName)}@example.com" : null;
            var note = random.NextDouble() < 0.15 ? notes[random.Next(notes.Length)] : null;
            return new Guest($"{firstName} {lastName}", phone, email, note, languages[random.Next(languages.Length)]);
        }

        /// <summary>A guest who comes again: always with a phone number, by which the profiles recognise them, and without a note.</summary>
        public Guest NextRegular(Random random)
        {
            var guest = Next(random);
            return guest with { Phone = guest.Phone ?? $"{phonePrefix}{random.Next(0, 10)} {random.Next(1000000, 9999999)}", Notes = null };
        }

        private static string Ascii(string name) => name.ToLowerInvariant()
            .Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue").Replace("ß", "ss")
            .Replace("đ", "dj").Replace("ć", "c").Replace("č", "c").Replace("š", "s").Replace("ž", "z");
    }

    private static void ThrowOnError(IdentityResult result, string email)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException($"Seed user {email}: {string.Join(" ", result.Errors.Select(e => e.Description))}");
        }
    }

    /// <summary>The tenant the seed writes as; there is no request to take it from.</summary>
    private sealed class SeedTenantContext(Guid? tenantId) : ITenantContext
    {
        public Guid? TenantId { get; } = tenantId;
    }
}
