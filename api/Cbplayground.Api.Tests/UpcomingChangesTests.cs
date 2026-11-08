using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The days of the next 14 days that differ from the regular week on the booking page (<c>upcomingChanges</c> of
/// <c>GET /api/public/restaurants/{slug}</c>), against the API's clock, which stands still at 23:30 UTC on Sunday, 13 December
/// 2026 (<see cref="UpcomingClockApiFactory"/>): in Munich it is already Monday, 14 December, so the 14 days run from
/// 14 to 27 December, with Christmas Day (Friday, 25) and the second day of Christmas (Saturday, 26). Every test on a
/// restaurant of its own.
/// </summary>
public class UpcomingChangesTests(UpcomingChangesTests.UpcomingClockApiFactory factory) : IClassFixture<UpcomingChangesTests.UpcomingClockApiFactory>
{
    public class UpcomingClockApiFactory : ApiFactory
    {
        private class FixedClock(DateTimeOffset utcNow) : TimeProvider
        {
            public override DateTimeOffset GetUtcNow() => utcNow;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(new FixedClock(new DateTimeOffset(2026, 12, 13, 23, 30, 0, TimeSpan.Zero))));
        }
    }

    /// <summary>Today in Munich.</summary>
    private static readonly DateOnly Today = new(2026, 12, 14);

    private static readonly DateOnly ChristmasDay = new(2026, 12, 25);

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    /// <summary>Every day 11:30–14:30 and 17:30–22:00.</summary>
    private static readonly (DayOfWeek, TimeOnly, TimeOnly)[] EveryDay =
    [
        .. Enum.GetValues<DayOfWeek>().Select(day => (day, new TimeOnly(17, 30), new TimeOnly(22, 0))),
        .. Enum.GetValues<DayOfWeek>().Select(day => (day, new TimeOnly(11, 30), new TimeOnly(14, 30))),
    ];

    private record Response(List<UpcomingChange> UpcomingChanges);

    /// <summary>A restaurant of its own in Munich (Bavaria) with its weekly hours, written with the tenant set as the public endpoints do.</summary>
    private async Task<string> CreateAsync((DayOfWeek Day, TimeOnly Start, TimeOnly End)[] hours, Action<AppDbContext>? more = null, bool withLocation = true)
    {
        var slug = $"u-{Guid.NewGuid():N}"[..14];
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var tenant = new Tenant
        {
            Name = $"Restaurant {slug}",
            Slug = slug,
            CreatedAt = DateTime.UtcNow,
            CountryCode = withLocation ? Locations.Germany : null,
            RegionCode = withLocation ? "DE-BY" : null,
            TimeZoneId = withLocation ? "Europe/Berlin" : null,
        };
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync(Token);

        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenant.Id;
        db.OpeningPeriods.AddRange(hours.Select(h => new OpeningPeriod { DayOfWeek = h.Day, Start = h.Start, End = h.End }));
        more?.Invoke(db);
        await db.SaveChangesAsync(Token);
        return slug;
    }

    private async Task<List<UpcomingChange>> ChangesAsync(string slug)
    {
        using var client = factory.CreateHttpsClient();
        var response = await client.GetFromJsonAsync<Response>($"/api/public/restaurants/{slug}", Token);
        return response!.UpcomingChanges;
    }

    private static SpecialDay Closed(DateOnly from, DateOnly to, string? note = null) => new() { From = from, To = to, Kind = SpecialDayKind.Closed, Note = note };

    [Fact]
    public async Task A_closing_day_is_listed_as_closed()
    {
        var slug = await CreateAsync(EveryDay, db => db.SpecialDays.Add(Closed(Today.AddDays(2), Today.AddDays(2))));

        var changes = await ChangesAsync(slug);

        var change = Assert.Single(changes, c => c.Date < ChristmasDay);
        Assert.Equal(new DateOnly(2026, 12, 16), change.Date);
        Assert.Equal("closed", change.Kind);
        Assert.Empty(change.Periods);
        Assert.Null(change.HolidayKey);
    }

    [Fact]
    public async Task A_closing_range_is_one_entry_per_day()
    {
        var slug = await CreateAsync(EveryDay, db => db.SpecialDays.Add(Closed(Today.AddDays(3), Today.AddDays(5))));

        var changes = (await ChangesAsync(slug)).Where(c => c.Date < ChristmasDay).ToList();

        Assert.Equal([new DateOnly(2026, 12, 17), new DateOnly(2026, 12, 18), new DateOnly(2026, 12, 19)], changes.Select(c => c.Date));
        Assert.All(changes, c => Assert.Equal("closed", c.Kind));
    }

    [Fact]
    public async Task Special_hours_are_listed_with_their_windows_unless_they_equal_the_regular_hours()
    {
        var slug = await CreateAsync(EveryDay, db => db.SpecialDays.AddRange(
            new SpecialDay
            {
                From = Today.AddDays(1),
                To = Today.AddDays(1),
                Kind = SpecialDayKind.SpecialHours,
                Periods = [new SpecialDayPeriod { Start = new TimeOnly(18, 0), End = OpeningPeriod.EndOfDay }],
            },
            new SpecialDay
            {
                From = Today.AddDays(2),
                To = Today.AddDays(2),
                Kind = SpecialDayKind.SpecialHours,
                Periods =
                [
                    new SpecialDayPeriod { Start = new TimeOnly(17, 30), End = new TimeOnly(22, 0) },
                    new SpecialDayPeriod { Start = new TimeOnly(11, 30), End = new TimeOnly(14, 30) },
                ],
            }));

        var changes = await ChangesAsync(slug);

        var change = Assert.Single(changes, c => c.Date < ChristmasDay);
        Assert.Equal(new DateOnly(2026, 12, 15), change.Date);
        Assert.Equal("specialHours", change.Kind);
        Assert.Equal([new UpcomingPeriod("18:00", "24:00")], change.Periods);
        Assert.Null(change.HolidayKey);
    }

    [Fact]
    public async Task A_public_holiday_on_an_open_weekday_is_closed_with_its_key_and_one_on_a_closed_weekday_is_not_listed()
    {
        // Open every day but Saturday: Christmas Day (Friday) differs, the second day of Christmas (Saturday) does not.
        var slug = await CreateAsync([.. EveryDay.Where(h => h.Item1 != DayOfWeek.Saturday)]);

        var changes = await ChangesAsync(slug);

        var change = Assert.Single(changes);
        Assert.Equal(ChristmasDay, change.Date);
        Assert.Equal("closed", change.Kind);
        Assert.Empty(change.Periods);
        Assert.Equal("christmasDay", change.HolidayKey);
    }

    [Fact]
    public async Task A_public_holiday_the_restaurant_opens_on_is_not_listed()
    {
        var slug = await CreateAsync(EveryDay, db => db.HolidayOverrides.Add(new HolidayOverride { Date = ChristmasDay, IsOpen = true }));

        var changes = await ChangesAsync(slug);

        Assert.Equal([new DateOnly(2026, 12, 26)], changes.Select(c => c.Date));
        Assert.Equal("secondChristmasDay", changes[0].HolidayKey);
    }

    [Fact]
    public async Task A_closing_day_on_a_public_holiday_has_no_holiday_key()
    {
        var slug = await CreateAsync(EveryDay, db => db.SpecialDays.Add(Closed(ChristmasDay, ChristmasDay)));

        var change = Assert.Single(await ChangesAsync(slug), c => c.Date == ChristmasDay);

        Assert.Equal("closed", change.Kind);
        Assert.Null(change.HolidayKey);
    }

    [Fact]
    public async Task Nothing_beyond_the_14_days_is_listed()
    {
        // The last of the 14 days is Sunday, 27 December; the closing range goes on until 3 January.
        var slug = await CreateAsync(EveryDay, db => db.SpecialDays.Add(Closed(new DateOnly(2026, 12, 27), new DateOnly(2027, 1, 3))));

        var changes = await ChangesAsync(slug);

        Assert.Equal([ChristmasDay, new DateOnly(2026, 12, 26), new DateOnly(2026, 12, 27)], changes.Select(c => c.Date));
    }

    [Fact]
    public async Task The_internal_note_of_a_special_day_is_not_in_the_response()
    {
        var slug = await CreateAsync(EveryDay, db => db.SpecialDays.Add(Closed(Today.AddDays(1), Today.AddDays(1), "Betriebsausflug Kegelclub")));
        using var client = factory.CreateHttpsClient();

        var json = await client.GetStringAsync($"/api/public/restaurants/{slug}", Token);

        Assert.Contains("\"upcomingChanges\":[{\"date\":\"2026-12-15\"", json);
        Assert.DoesNotContain("Kegelclub", json);
        Assert.DoesNotContain("\"note\"", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task A_restaurant_without_location_has_no_upcoming_changes()
    {
        var slug = await CreateAsync(EveryDay, db => db.SpecialDays.Add(Closed(Today.AddDays(1), Today.AddDays(1))), withLocation: false);

        Assert.Empty(await ChangesAsync(slug));
    }
}
