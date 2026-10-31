using Cbplayground.Api.Auth;
using Cbplayground.Api.OpeningHours;
using Cbplayground.Api.Reservations;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Data;

/// <summary>
/// Demo data for the Development environment: the staff users from the "Seed:Users" section of appsettings.Development.json
/// and demo reservations for today and the next 7 days.
/// </summary>
public static class DevelopmentSeed
{
    public record SeedUser(string Email, string Password, string DisplayName, string Role, string? TenantSlug = null);

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
}
