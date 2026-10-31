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
/// Demo data for local development: the two demo restaurants with their setup (<see cref="SeedRestaurantsAsync"/>),
/// the demo staff users from the "Seed:Users" section of appsettings.Development.json (<see cref="SeedUsersAsync"/>)
/// and demo reservations for today and the next 7 days (<see cref="SeedReservationsAsync(IServiceProvider)"/>).
/// </summary>
public static class DevelopmentSeed
{
    public record SeedUser(string Email, string Password, string DisplayName, string Role, string? TenantSlug = null);

    /// <summary>Folder of the seed floor plans, relative to the content root.</summary>
    private static readonly string SeedAssetsPath = Path.Combine("Data", "SeedAssets");

    /// <summary>Size of the seed floor plans in pixels; the table positions below are given in pixels of these images.</summary>
    private const double PlanWidth = 1200;
    private const double PlanHeight = 800;

    /// <summary>Table scale of the areas with a seed floor plan: at 100 % the drawn tables are large for the rooms and come too close.</summary>
    private const int SeedFloorPlanTableScale = 80;

    /// <summary>A demo table; in an area without floor plan the position is ignored and the tables are arranged (<see cref="TableLayout"/>).</summary>
    private record DemoTable(string Number, int Seats, TableShape Shape, double X = 0, double Y = 0, int Rotation = 0);

    /// <summary>A demo area; without <see cref="FloorPlanFile"/> it has no floor plan image.</summary>
    private record DemoArea(string Name, string? FloorPlanFile, int OnlineCapacityPercent, int TableScale, DemoTable[] Tables);

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
                new("Gaststube", "gaststube.png", 100, SeedFloorPlanTableScale,
                [
                    new("1", 2, Square, 260, 270), new("2", 4, Square, 450, 270), new("3", 4, Square, 640, 270),
                    new("4", 2, Square, 880, 250), new("5", 2, Square, 1060, 250),
                    new("6", 4, Square, 260, 470), new("7", 6, Rectangle, 470, 470), new("8", 8, Rectangle, 720, 470),
                    new("9", 4, Round, 980, 470), new("10", 6, Rectangle, 260, 660),
                ]),
                new("Terrasse", "terrasse.png", 50, SeedFloorPlanTableScale,
                [
                    new("T1", 4, Round, 220, 230), new("T2", 4, Round, 480, 260), new("T3", 6, Rectangle, 800, 230),
                    new("T4", 2, Round, 220, 520), new("T5", 4, Round, 500, 540), new("T6", 2, Round, 760, 500),
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
                new("Sala", "sala.png", 100, SeedFloorPlanTableScale,
                [
                    new("1", 2, Square, 300, 200), new("2", 4, Square, 500, 200), new("3", 4, Square, 700, 200),
                    new("4", 6, Rectangle, 860, 330, Rotation: 90),
                    new("5", 4, Square, 300, 400), new("6", 6, Rectangle, 500, 400), new("7", 8, Rectangle, 700, 400),
                    new("8", 4, Round, 960, 420),
                    new("9", 2, Square, 300, 620), new("10", 4, Square, 500, 620), new("11", 4, Square, 700, 620),
                    new("12", 2, Square, 900, 620),
                ]),
                // The garden has no floor plan image: the API draws it from the tables.
                new("Bašta", null, 100, 100,
                [
                    new("B1", 2, Round), new("B2", 4, Square), new("B3", 4, Round),
                    new("B4", 6, Rectangle), new("B5", 8, Rectangle), new("B6", 2, Square),
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
                        string? fileName = null;
                        if (demoArea.FloorPlanFile is not null)
                        {
                            // A new file name for every copy, as for an upload, so deleting the area deletes only its own copy.
                            fileName = $"{Guid.NewGuid():N}{Path.GetExtension(demoArea.FloorPlanFile)}";
                            File.Copy(Path.Combine(environment.ContentRootPath, SeedAssetsPath, demoArea.FloorPlanFile), Path.Combine(uploads, fileName));
                        }

                        var area = new Area
                        {
                            Id = Guid.NewGuid(),
                            Name = demoArea.Name,
                            SortOrder = i,
                            FloorPlanFileName = fileName,
                            OnlineCapacityPercent = demoArea.OnlineCapacityPercent,
                            TableScale = demoArea.TableScale,
                        };
                        db.Areas.Add(area);
                        var tables = demoArea.Tables.Select(t => new Table
                        {
                            AreaId = area.Id,
                            Number = t.Number,
                            Seats = t.Seats,
                            Shape = t.Shape,
                            Rotation = t.Rotation,
                            PosX = t.X / PlanWidth,
                            PosY = t.Y / PlanHeight,
                        }).ToList();
                        if (fileName is null)
                        {
                            TableLayout.Arrange(tables, area.TableScale);
                        }
                        db.Tables.AddRange(tables);
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

    /// <summary>
    /// Adds demo reservations from today to today + 7 days for every restaurant that has tables, a location and opening hours,
    /// but no reservations from today on. Wherever the tables come from (demo data or entered by hand) does not matter.
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
        var tables = await db.Tables.Join(db.Areas, t => t.AreaId, a => a.Id, (t, a) => new { Table = t, Area = a }).ToListAsync();
        if (tables.Count == 0)
        {
            return;
        }
        var tableById = tables.ToDictionary(t => t.Table.Id);
        var settings = await db.ReservationSettings.SingleOrDefaultAsync() ?? new ReservationSettings();
        var guests = DemoGuests.For(tenant.CountryCode);

        // Same demo data on every start of an empty database, different per restaurant.
        var random = new Random(tenant.Id.GetHashCode());
        var reservations = new List<Reservation>();
        var referenceCodes = new HashSet<string>();
        for (var day = 0; day <= 7; day++)
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
                        ? ReservationSource.Online
                        : ReservationSource.Staff;

                    var guest = guests.Next(random);
                    var reservation = new Reservation
                    {
                        TableId = entry.Table.Id,
                        StartLocal = start,
                        EndLocal = end,
                        DurationMinutes = duration,
                        PartySize = partySize,
                        GuestName = guest.Name,
                        GuestPhone = guest.Phone,
                        GuestEmail = guest.Email,
                        Notes = guest.Notes,
                        Status = DemoStatus(random, start <= now, source, settings.ConfirmationMode),
                        Source = source,
                        ReferenceCode = await UniqueReferenceCodeAsync(db, referenceCodes),
                        Language = guest.Language,
                        CreatedAtUtc = DateTime.UtcNow,
                        UpdatedAtUtc = DateTime.UtcNow,
                    };
                    reservations.Add(reservation);
                }
            }
        }

        db.Reservations.AddRange(reservations);
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

    /// <summary>Plausible guests for the restaurant's country: German names for Germany and Austria (and without location), Serbian ones for Serbia.</summary>
    private class DemoGuests(string[] firstNames, string[] lastNames, string phonePrefix, string[] languages, string[] notes)
    {
        public record Guest(string Name, string? Phone, string? Email, string? Notes, string Language);

        public static DemoGuests For(string? countryCode) => countryCode switch
        {
            Locations.Serbia => new DemoGuests(
                ["Marko", "Jelena", "Nikola", "Milica", "Stefan", "Ana", "Luka", "Jovana", "Miloš", "Ivana", "Nemanja", "Dragana", "Aleksandar", "Tamara"],
                ["Jovanović", "Petrović", "Nikolić", "Marković", "Đorđević", "Stojanović", "Ilić", "Stanković", "Pavlović", "Popović", "Kostić", "Savić"],
                "+381 6",
                ["sr-Latn", "sr-Latn", "sr-Cyrl", "en"],
                ["Rođendan", "Dečja stolica, molim", "Sto pored prozora ako je moguće"]),
            Locations.Austria => new DemoGuests(
                ["Lukas", "Anna", "Maximilian", "Sophie", "Florian", "Katharina", "Tobias", "Lena", "Stefan", "Sabine", "Johannes", "Theresa"],
                ["Gruber", "Huber", "Bauer", "Wagner", "Müller", "Pichler", "Steiner", "Moser", "Mayer", "Hofer", "Leitner", "Berger"],
                "+43 66",
                ["de", "de", "de", "en"],
                ["Geburtstag", "Bitte einen Kinderstuhl", "Wenn möglich am Fenster"]),
            _ => new DemoGuests(
                ["Lukas", "Anna", "Jonas", "Marie", "Felix", "Laura", "Paul", "Julia", "Thomas", "Monika", "Stefan", "Katrin"],
                ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Schulz", "Koch", "Richter"],
                "+49 15",
                ["de", "de", "de", "en"],
                ["Geburtstag", "Bitte einen Kinderstuhl", "Wenn möglich am Fenster"]),
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
