using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace Cbplayground.Api.Tests;

/// <summary>An area of a test restaurant with its tables (number and seats).</summary>
public record TestArea(string Name, bool OnlineBookingEnabled, int OnlineCapacityPercent, params (string Number, int Seats)[] Tables);

/// <summary>A restaurant created for one test, with a Tenant Admin and a Front desk user.</summary>
public record TestRestaurant(Guid Id, string Slug, string AdminEmail, string FrontDeskEmail, IReadOnlyDictionary<string, Guid> Tables, IReadOnlyDictionary<string, Guid> Areas)
{
    /// <summary>The tests' local "now": the restaurants are in Austria (Europe/Vienna).</summary>
    public static DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Europe/Vienna"));
}

/// <summary>
/// Creates restaurants of their own for the reservation tests, so the tests do not see each other's reservations.
/// The data is written like the public endpoints do it: with the tenant set in <see cref="TenantScope"/>.
/// </summary>
public static class TestRestaurants
{
    /// <summary>Every day except Monday, 11:30–14:30 and 17:00–22:00.</summary>
    public static readonly (DayOfWeek Day, TimeOnly Start, TimeOnly End)[] DefaultHours = Enum.GetValues<DayOfWeek>()
        .Where(d => d != DayOfWeek.Monday)
        .SelectMany(d => new[] { (d, new TimeOnly(11, 30), new TimeOnly(14, 30)), (d, new TimeOnly(17, 0), new TimeOnly(22, 0)) })
        .ToArray();

    public static async Task<TestRestaurant> CreateAsync(
        ApiFactory factory,
        TestArea[] areas,
        ConfirmationMode confirmationMode = ConfirmationMode.Instant,
        TableSelectionMode tableSelectionMode = TableSelectionMode.SystemAssigns,
        int defaultDurationMinutes = 120,
        (int Min, int Max, int Minutes)[]? durationRules = null,
        (DayOfWeek Day, TimeOnly Start, TimeOnly End)[]? hours = null,
        bool withLocation = true)
    {
        var slug = $"r-{Guid.NewGuid():N}"[..14];
        using var scope = factory.Services.CreateScope();
        var services = scope.ServiceProvider;
        var db = services.GetRequiredService<AppDbContext>();

        var tenant = new Tenant { Name = $"Restaurant {slug}", Slug = slug, CreatedAt = DateTime.UtcNow };
        if (withLocation)
        {
            tenant.CountryCode = Locations.Austria;
            tenant.TimeZoneId = Locations.TimeZones[Locations.Austria];
        }
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync();

        services.GetRequiredService<TenantScope>().TenantId = tenant.Id;
        var tableIds = new Dictionary<string, Guid>();
        var areaIds = new Dictionary<string, Guid>();
        for (var i = 0; i < areas.Length; i++)
        {
            var area = new Area { Name = areas[i].Name, SortOrder = i, OnlineBookingEnabled = areas[i].OnlineBookingEnabled, OnlineCapacityPercent = areas[i].OnlineCapacityPercent };
            db.Areas.Add(area);
            await db.SaveChangesAsync();
            areaIds[area.Name] = area.Id;
            foreach (var (number, seats) in areas[i].Tables)
            {
                var table = new Table { AreaId = area.Id, Number = number, Seats = seats, PosX = 0.5, PosY = 0.5 };
                db.Tables.Add(table);
                await db.SaveChangesAsync();
                tableIds[number] = table.Id;
            }
        }
        db.OpeningPeriods.AddRange((hours ?? DefaultHours).Select(h => new OpeningPeriod { DayOfWeek = h.Day, Start = h.Start, End = h.End }));
        db.ReservationSettings.Add(new ReservationSettings
        {
            ConfirmationMode = confirmationMode,
            TableSelectionMode = tableSelectionMode,
            DefaultDurationMinutes = defaultDurationMinutes,
        });
        db.DurationRules.AddRange((durationRules ?? []).Select(r => new DurationRule { MinGuests = r.Min, MaxGuests = r.Max, DurationMinutes = r.Minutes }));
        await db.SaveChangesAsync();

        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var adminEmail = $"admin@{slug}.test";
        var frontDeskEmail = $"frontdesk@{slug}.test";
        await CreateUserAsync(userManager, adminEmail, Roles.TenantAdmin, tenant.Id);
        await CreateUserAsync(userManager, frontDeskEmail, Roles.FrontDesk, tenant.Id);

        return new TestRestaurant(tenant.Id, slug, adminEmail, frontDeskEmail, tableIds, areaIds);
    }

    /// <summary>
    /// The first day from today + <paramref name="daysAhead"/> on which the default hours apply: not a Monday and no
    /// Austrian public holiday.
    /// </summary>
    public static DateOnly NextOpenDay(ApiFactory factory, int daysAhead = 2)
    {
        var holidays = factory.Services.GetRequiredService<IHolidayProvider>();
        var date = TestRestaurant.Today.AddDays(daysAhead);
        while (date.DayOfWeek == DayOfWeek.Monday || holidays.GetHolidays(Locations.Austria, null, date, date).Count > 0)
        {
            date = date.AddDays(1);
        }
        return date;
    }

    /// <summary>Adds a reservation directly, e.g. one in the past, which the API does not accept.</summary>
    public static async Task<Guid> AddReservationAsync(ApiFactory factory, TestRestaurant restaurant, string tableNumber, DateTime startLocal,
        int durationMinutes = 120, ReservationStatus status = ReservationStatus.Confirmed, ReservationSource source = ReservationSource.Staff)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reservation = new Reservation
        {
            TableId = restaurant.Tables[tableNumber],
            StartLocal = startLocal,
            EndLocal = startLocal.AddMinutes(durationMinutes),
            DurationMinutes = durationMinutes,
            PartySize = 2,
            GuestName = "Direct Guest",
            GuestPhone = "+43 660 1234567",
            Status = status,
            Source = source,
            ReferenceCode = $"{Guid.NewGuid():N}"[..6].ToUpperInvariant(),
            Language = "de",
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        };
        db.Reservations.Add(reservation);
        await db.SaveChangesAsync();
        return reservation.Id;
    }

    public static async Task<HttpClient> SignInAsync(ApiFactory factory, string email)
    {
        var client = factory.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }

    private static async Task CreateUserAsync(UserManager<ApplicationUser> userManager, string email, string role, Guid tenantId)
    {
        var user = new ApplicationUser { UserName = email, Email = email, DisplayName = email, TenantId = tenantId };
        var created = await userManager.CreateAsync(user, ApiFactory.Password);
        Assert.True(created.Succeeded, string.Join(" ", created.Errors.Select(e => e.Description)));
        var addedToRole = await userManager.AddToRoleAsync(user, role);
        Assert.True(addedToRole.Succeeded, string.Join(" ", addedToRole.Errors.Select(e => e.Description)));
    }
}
