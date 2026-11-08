using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.TenantEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// "Open today" and today's hours in the list of restaurants (<c>GET /api/tenants</c>), against the API's clock, which stands
/// still at 22:30 UTC on Wednesday, 26 May 2027 (<see cref="OpenTodayClockApiFactory"/>): in Munich, Berlin and Vienna it is
/// already Thursday, 27 May, Corpus Christi (a public holiday in Bavaria and Austria, not in Berlin); in New York it is still
/// Wednesday.
/// </summary>
public class OpenTodayTests(OpenTodayTests.OpenTodayClockApiFactory factory) : IClassFixture<OpenTodayTests.OpenTodayClockApiFactory>
{
    public class OpenTodayClockApiFactory : ApiFactory
    {
        private class FixedClock(DateTimeOffset utcNow) : TimeProvider
        {
            public override DateTimeOffset GetUtcNow() => utcNow;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(new FixedClock(new DateTimeOffset(2027, 5, 26, 22, 30, 0, TimeSpan.Zero))));
        }
    }

    /// <summary>Today in Europe: Thursday, Corpus Christi.</summary>
    private static readonly DateOnly Thursday = new(2027, 5, 27);

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly (DayOfWeek, TimeOnly, TimeOnly)[] ThursdayHours =
    [
        (DayOfWeek.Thursday, new TimeOnly(17, 30), OpeningPeriod.EndOfDay),
        (DayOfWeek.Thursday, new TimeOnly(8, 0), new TimeOnly(14, 0)),
    ];

    private record Location(string? CountryCode, string? RegionCode, string? TimeZoneId);

    private static readonly Location Berlin = new(Locations.Germany, "DE-BE", "Europe/Berlin");
    private static readonly Location Bavaria = new(Locations.Germany, "DE-BY", "Europe/Berlin");
    private static readonly Location Vienna = new(Locations.Austria, null, "Europe/Vienna");
    private static readonly Location NoLocation = new(null, null, null);

    /// <summary>A restaurant of its own with its location and weekly hours, written with the tenant set as the public endpoints do.</summary>
    private async Task<Guid> CreateAsync(Location location, (DayOfWeek Day, TimeOnly Start, TimeOnly End)[] hours, Action<AppDbContext>? more = null)
    {
        var slug = $"o-{Guid.NewGuid():N}"[..14];
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tenant = new Tenant
        {
            Name = $"Restaurant {slug}",
            Slug = slug,
            CreatedAt = DateTime.UtcNow,
            CountryCode = location.CountryCode,
            RegionCode = location.RegionCode,
            TimeZoneId = location.TimeZoneId,
        };
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync(Token);

        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenant.Id;
        db.OpeningPeriods.AddRange(hours.Select(h => new OpeningPeriod { DayOfWeek = h.Day, Start = h.Start, End = h.End }));
        more?.Invoke(db);
        await db.SaveChangesAsync(Token);
        return tenant.Id;
    }

    private async Task<TenantListItem> ListItemAsync(Guid id, HttpClient? client = null)
    {
        using var anonymous = factory.CreateHttpsClient();
        var tenants = await (client ?? anonymous).GetFromJsonAsync<List<TenantListItem>>("/api/tenants", Token);
        return Assert.Single(tenants!, t => t.Id == id);
    }

    [Fact]
    public async Task A_regular_day_is_open_with_its_hours_sorted_by_start()
    {
        var id = await CreateAsync(Berlin, ThursdayHours);

        var item = await ListItemAsync(id);

        Assert.True(item.OpenToday);
        Assert.Equal([new TodayPeriod("08:00", "14:00"), new TodayPeriod("17:30", "24:00")], item.TodayHours);
    }

    [Fact]
    public async Task A_closed_weekday_is_not_open_today()
    {
        var id = await CreateAsync(Berlin, [(DayOfWeek.Friday, new TimeOnly(8, 0), new TimeOnly(17, 0))]);

        var item = await ListItemAsync(id);

        Assert.False(item.OpenToday);
        Assert.Empty(item.TodayHours);
    }

    [Fact]
    public async Task A_public_holiday_is_closed_unless_the_restaurant_opens_on_it()
    {
        var bavarian = await CreateAsync(Bavaria, ThursdayHours);
        var viennese = await CreateAsync(Vienna, ThursdayHours);
        var openOnHoliday = await CreateAsync(Bavaria, ThursdayHours, db => db.HolidayOverrides.Add(new HolidayOverride { Date = Thursday, IsOpen = true }));

        Assert.False((await ListItemAsync(bavarian)).OpenToday);
        Assert.False((await ListItemAsync(viennese)).OpenToday);
        var opened = await ListItemAsync(openOnHoliday);
        Assert.True(opened.OpenToday);
        Assert.Equal(2, opened.TodayHours.Count);
    }

    [Fact]
    public async Task A_closing_day_is_not_open_today()
    {
        var id = await CreateAsync(Berlin, ThursdayHours, db => db.SpecialDays.Add(new SpecialDay
        {
            From = Thursday.AddDays(-1),
            To = Thursday.AddDays(3),
            Kind = SpecialDayKind.Closed,
        }));

        var item = await ListItemAsync(id);

        Assert.False(item.OpenToday);
        Assert.Empty(item.TodayHours);
    }

    [Fact]
    public async Task Special_hours_replace_the_regular_hours_also_on_a_closed_weekday()
    {
        var instead = await CreateAsync(Berlin, ThursdayHours, db => db.SpecialDays.Add(new SpecialDay
        {
            From = Thursday,
            To = Thursday,
            Kind = SpecialDayKind.SpecialHours,
            Periods = [new SpecialDayPeriod { Start = new TimeOnly(12, 0), End = new TimeOnly(15, 0) }],
        }));
        var onAClosedDay = await CreateAsync(Berlin, [], db => db.SpecialDays.Add(new SpecialDay
        {
            From = Thursday,
            To = Thursday,
            Kind = SpecialDayKind.SpecialHours,
            Periods = [new SpecialDayPeriod { Start = new TimeOnly(18, 0), End = new TimeOnly(23, 0) }],
        }));

        var first = await ListItemAsync(instead);
        Assert.True(first.OpenToday);
        Assert.Equal([new TodayPeriod("12:00", "15:00")], first.TodayHours);
        var second = await ListItemAsync(onAClosedDay);
        Assert.True(second.OpenToday);
        Assert.Equal([new TodayPeriod("18:00", "23:00")], second.TodayHours);
    }

    [Fact]
    public async Task Today_is_the_day_in_each_restaurants_own_time_zone()
    {
        (DayOfWeek, TimeOnly, TimeOnly)[] wednesdayOnly = [(DayOfWeek.Wednesday, new TimeOnly(11, 0), new TimeOnly(22, 0))];
        (DayOfWeek, TimeOnly, TimeOnly)[] thursdayOnly = [(DayOfWeek.Thursday, new TimeOnly(11, 0), new TimeOnly(22, 0))];
        // The API only offers countries in Central European time; a restaurant in New York shows that the time zone counts.
        var newYork = new Location(null, null, "America/New_York");
        var wednesdayInNewYork = await CreateAsync(newYork, wednesdayOnly);
        var thursdayInNewYork = await CreateAsync(newYork, thursdayOnly);
        var wednesdayInBerlin = await CreateAsync(Berlin, wednesdayOnly);
        var thursdayInBerlin = await CreateAsync(Berlin, thursdayOnly);

        Assert.True((await ListItemAsync(wednesdayInNewYork)).OpenToday);
        Assert.False((await ListItemAsync(thursdayInNewYork)).OpenToday);
        Assert.False((await ListItemAsync(wednesdayInBerlin)).OpenToday);
        Assert.True((await ListItemAsync(thursdayInBerlin)).OpenToday);
    }

    [Fact]
    public async Task A_restaurant_without_location_is_not_open_today()
    {
        var id = await CreateAsync(NoLocation, Enum.GetValues<DayOfWeek>().Select(d => (d, new TimeOnly(0, 0), OpeningPeriod.EndOfDay)).ToArray());

        var item = await ListItemAsync(id);

        Assert.False(item.OpenToday);
        Assert.Empty(item.TodayHours);
    }

    [Fact]
    public async Task No_restaurants_hours_closing_days_or_holiday_overrides_reach_another()
    {
        // All in one list, evaluated one after another in the same request.
        var withoutHours = await CreateAsync(Berlin, []);
        var open = await CreateAsync(Berlin, ThursdayHours);
        var closingDay = await CreateAsync(Berlin, ThursdayHours, db => db.SpecialDays.Add(new SpecialDay { From = Thursday, To = Thursday, Kind = SpecialDayKind.Closed }));
        var specialHours = await CreateAsync(Berlin, ThursdayHours, db => db.SpecialDays.Add(new SpecialDay
        {
            From = Thursday,
            To = Thursday,
            Kind = SpecialDayKind.SpecialHours,
            Periods = [new SpecialDayPeriod { Start = new TimeOnly(10, 0), End = new TimeOnly(11, 0) }],
        }));
        var holidayOpened = await CreateAsync(Bavaria, ThursdayHours, db => db.HolidayOverrides.Add(new HolidayOverride { Date = Thursday, IsOpen = true }));
        var holidayClosed = await CreateAsync(Bavaria, ThursdayHours);

        Assert.False((await ListItemAsync(withoutHours)).OpenToday);
        Assert.Equal([new TodayPeriod("08:00", "14:00"), new TodayPeriod("17:30", "24:00")], (await ListItemAsync(open)).TodayHours);
        Assert.False((await ListItemAsync(closingDay)).OpenToday);
        Assert.Equal([new TodayPeriod("10:00", "11:00")], (await ListItemAsync(specialHours)).TodayHours);
        Assert.True((await ListItemAsync(holidayOpened)).OpenToday);
        Assert.False((await ListItemAsync(holidayClosed)).OpenToday);
    }

    [Fact]
    public async Task A_signed_in_user_of_one_restaurant_sees_the_hours_of_every_other_one()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4))], hours: []);
        var other = await CreateAsync(Berlin, ThursdayHours);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);

        Assert.False((await ListItemAsync(restaurant.Id, admin)).OpenToday);
        Assert.Equal(2, (await ListItemAsync(other, admin)).TodayHours.Count);
    }
}
