using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Data;

/// <summary>
/// Demo data for local development: the two demo restaurants with their setup (<see cref="SeedRestaurantsAsync"/>)
/// and the demo staff users from the "Seed:Users" section of appsettings.Development.json (<see cref="SeedUsersAsync"/>).
/// </summary>
public static class DevelopmentSeed
{
    public record SeedUser(string Email, string Password, string DisplayName, string Role, string? TenantSlug = null);

    /// <summary>Folder of the seed floor plans, relative to the content root.</summary>
    private static readonly string SeedAssetsPath = Path.Combine("Data", "SeedAssets");

    /// <summary>Size of the seed floor plans in pixels; the table positions below are given in pixels of these images.</summary>
    private const double PlanWidth = 1200;
    private const double PlanHeight = 800;

    private record DemoTable(string Number, int Seats, double X, double Y);

    private record DemoArea(string Name, string FloorPlanFile, int OnlineCapacityPercent, DemoTable[] Tables);

    private record DemoPeriod(DayOfWeek Day, TimeOnly Start, TimeOnly End);

    private record DemoRestaurant(
        string Name,
        string Slug,
        string CountryCode,
        string? RegionCode,
        ProfileEndpoints.ProfileDto Profile,
        DemoPeriod[] OpeningHours,
        DemoArea[] Areas,
        ReservationSettings Settings,
        DurationRule[] DurationRules);

    private static readonly DayOfWeek[] TuesdayToSunday =
        [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday, DayOfWeek.Sunday];

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
                Description: "Bayerisches Wirtshaus mit Kachelofen-Stube und schattiger Terrasse unter der Kastanie. Regionale Küche, Mittagstisch und Bier vom Holzfass."),
            // Tuesday to Sunday 11:30–14:30 and 17:30–22:00, closed on Mondays.
            OpeningHours:
            [
                .. TuesdayToSunday.Select(day => new DemoPeriod(day, new TimeOnly(11, 30), new TimeOnly(14, 30))),
                .. TuesdayToSunday.Select(day => new DemoPeriod(day, new TimeOnly(17, 30), new TimeOnly(22, 0))),
            ],
            Areas:
            [
                new("Gaststube", "gaststube.png", 100,
                [
                    new("1", 2, 260, 270), new("2", 4, 450, 270), new("3", 4, 640, 270), new("4", 2, 880, 250), new("5", 2, 1060, 250),
                    new("6", 4, 260, 470), new("7", 6, 470, 470), new("8", 8, 720, 470), new("9", 4, 980, 470), new("10", 6, 260, 660),
                ]),
                new("Terrasse", "terrasse.png", 50,
                [
                    new("T1", 4, 220, 230), new("T2", 4, 480, 260), new("T3", 6, 800, 230),
                    new("T4", 2, 220, 520), new("T5", 4, 500, 540), new("T6", 2, 760, 500),
                ]),
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
            ]),
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
                Description: "Kafana na keju uz Dunav: domaća kuhinja, riblja čorba i roštilj, a petkom i subotom tamburaši uživo."),
            // Every day 12:00–24:00.
            OpeningHours: [.. Enum.GetValues<DayOfWeek>().Select(day => new DemoPeriod(day, new TimeOnly(12, 0), OpeningPeriod.EndOfDay))],
            Areas:
            [
                new("Sala", "sala.png", 100,
                [
                    new("1", 2, 300, 200), new("2", 4, 500, 200), new("3", 4, 700, 200), new("4", 6, 860, 330),
                    new("5", 4, 300, 400), new("6", 6, 500, 400), new("7", 8, 700, 400), new("8", 4, 960, 420),
                    new("9", 2, 300, 620), new("10", 4, 500, 620), new("11", 4, 700, 620), new("12", 2, 900, 620),
                ]),
            ],
            Settings: new ReservationSettings
            {
                ConfirmationMode = ConfirmationMode.Request,
                TableSelectionMode = TableSelectionMode.GuestChooses,
                DefaultDurationMinutes = 120,
            },
            DurationRules: []),
    ];

    /// <summary>
    /// Creates the demo restaurants that do not exist yet and completes their setup. Each part is only added
    /// when the restaurant has nothing of it yet, so a second run adds nothing and nothing the admin maintained is overwritten:
    /// location (no country), profile (all profile fields empty), opening hours (none), areas with floor plans and tables
    /// (no areas), reservation settings with duration rules (never saved).
    /// </summary>
    public static async Task SeedRestaurantsAsync(IServiceProvider services)
    {
        var options = services.GetRequiredService<DbContextOptions<AppDbContext>>();
        var environment = services.GetRequiredService<IWebHostEnvironment>();
        var configuration = services.GetRequiredService<IConfiguration>();

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
                    var uploads = AreaEndpoints.FloorPlanDirectory(configuration, environment);
                    Directory.CreateDirectory(uploads);
                    for (var i = 0; i < demo.Areas.Length; i++)
                    {
                        var demoArea = demo.Areas[i];
                        // A new file name for every copy, as for an upload, so deleting the area deletes only its own copy.
                        var fileName = $"{Guid.NewGuid():N}{Path.GetExtension(demoArea.FloorPlanFile)}";
                        File.Copy(Path.Combine(environment.ContentRootPath, SeedAssetsPath, demoArea.FloorPlanFile), Path.Combine(uploads, fileName));

                        var area = new Area
                        {
                            Id = Guid.NewGuid(),
                            Name = demoArea.Name,
                            SortOrder = i,
                            FloorPlanFileName = fileName,
                            OnlineCapacityPercent = demoArea.OnlineCapacityPercent,
                        };
                        db.Areas.Add(area);
                        db.Tables.AddRange(demoArea.Tables.Select(t => new Table
                        {
                            AreaId = area.Id,
                            Number = t.Number,
                            Seats = t.Seats,
                            PosX = t.X / PlanWidth,
                            PosY = t.Y / PlanHeight,
                        }));
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
