using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Tests;

public sealed class OpeningCalendarTests : IDisposable
{
    private class FakeTenantContext(Guid? tenantId) : ITenantContext
    {
        public Guid? TenantId { get; } = tenantId;
    }

    // Thursday, 4 June 2026 is Corpus Christi in Bavaria, but not in Berlin.
    private static readonly DateOnly CorpusChristi = new(2026, 6, 4);
    private static readonly DateOnly OrdinaryThursday = new(2026, 6, 11);

    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private readonly DbContextOptions<AppDbContext> options;
    private readonly Guid bavarian = Guid.NewGuid();
    private readonly Guid berliner = Guid.NewGuid();
    private readonly Guid withoutLocation = Guid.NewGuid();

    public OpeningCalendarTests()
    {
        connection.Open();
        options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;

        using (var db = CreateContext(null))
        {
            db.Database.EnsureCreated();
            db.Tenants.AddRange(
                new Tenant { Id = bavarian, Name = "Bavarian", Slug = "bavarian", CountryCode = "DE", RegionCode = "DE-BY", TimeZoneId = "Europe/Berlin" },
                new Tenant { Id = berliner, Name = "Berliner", Slug = "berliner", CountryCode = "DE", RegionCode = "DE-BE", TimeZoneId = "Europe/Berlin" },
                new Tenant { Id = withoutLocation, Name = "Nowhere", Slug = "nowhere" });
            db.SaveChanges();
        }

        foreach (var tenantId in new[] { bavarian, berliner, withoutLocation })
        {
            using var db = CreateContext(tenantId);
            db.OpeningPeriods.AddRange(
                new OpeningPeriod { DayOfWeek = DayOfWeek.Thursday, Start = new TimeOnly(17, 30), End = OpeningPeriod.EndOfDay },
                new OpeningPeriod { DayOfWeek = DayOfWeek.Thursday, Start = new TimeOnly(11, 30), End = new TimeOnly(14, 30) });
            db.SaveChanges();
        }
    }

    public void Dispose() => connection.Dispose();

    private AppDbContext CreateContext(Guid? tenantId) => new(options, new FakeTenantContext(tenantId));

    private async Task<IReadOnlyList<OpenPeriod>> OpenPeriodsAsync(Guid tenantId, DateOnly date)
    {
        using var db = CreateContext(tenantId);
        var calendar = new OpeningCalendar(db, new FakeTenantContext(tenantId), new HolidayProvider());
        return await calendar.GetOpenPeriodsAsync(date, TestContext.Current.CancellationToken);
    }

    private void SetOverride(Guid tenantId, DateOnly date, bool isOpen)
    {
        using var db = CreateContext(tenantId);
        db.HolidayOverrides.Add(new HolidayOverride { Date = date, IsOpen = isOpen });
        db.SaveChanges();
    }

    private void AddSpecialDay(Guid tenantId, DateOnly from, DateOnly to, SpecialDayKind kind, params (TimeOnly Start, TimeOnly End)[] periods)
    {
        using var db = CreateContext(tenantId);
        db.SpecialDays.Add(new SpecialDay
        {
            From = from,
            To = to,
            Kind = kind,
            Periods = periods.Select(p => new SpecialDayPeriod { Start = p.Start, End = p.End }).ToList(),
        });
        db.SaveChanges();
    }

    private static readonly OpenPeriod[] ThursdayHours =
    [
        new(new TimeOnly(11, 30), new TimeOnly(14, 30)),
        new(new TimeOnly(17, 30), OpeningPeriod.EndOfDay),
    ];

    [Fact]
    public async Task An_ordinary_day_has_the_hours_of_its_day_of_the_week_sorted_by_start()
    {
        Assert.Equal(ThursdayHours, await OpenPeriodsAsync(bavarian, OrdinaryThursday));
    }

    [Fact]
    public async Task A_day_without_periods_is_closed()
    {
        Assert.Empty(await OpenPeriodsAsync(bavarian, new DateOnly(2026, 6, 12)));
    }

    [Fact]
    public async Task A_holiday_is_closed_by_default()
    {
        Assert.Empty(await OpenPeriodsAsync(bavarian, CorpusChristi));
    }

    [Fact]
    public async Task A_holiday_opened_by_an_override_has_the_regular_hours()
    {
        SetOverride(bavarian, CorpusChristi, isOpen: true);

        Assert.Equal(ThursdayHours, await OpenPeriodsAsync(bavarian, CorpusChristi));
    }

    [Fact]
    public async Task A_holiday_closed_by_an_override_is_closed()
    {
        SetOverride(bavarian, CorpusChristi, isOpen: false);

        Assert.Empty(await OpenPeriodsAsync(bavarian, CorpusChristi));
    }

    [Fact]
    public async Task Holidays_depend_on_the_federal_state()
    {
        Assert.Equal(ThursdayHours, await OpenPeriodsAsync(berliner, CorpusChristi));
    }

    [Fact]
    public async Task Without_a_location_no_holidays_apply()
    {
        Assert.Equal(ThursdayHours, await OpenPeriodsAsync(withoutLocation, CorpusChristi));
    }

    [Fact]
    public async Task Overrides_of_another_tenant_do_not_apply()
    {
        SetOverride(berliner, CorpusChristi, isOpen: true);

        Assert.Empty(await OpenPeriodsAsync(bavarian, CorpusChristi));
    }

    [Fact]
    public async Task Periods_of_another_tenant_do_not_apply()
    {
        using (var db = CreateContext(berliner))
        {
            db.OpeningPeriods.Add(new OpeningPeriod { DayOfWeek = DayOfWeek.Friday, Start = new TimeOnly(10, 0), End = new TimeOnly(12, 0) });
            db.SaveChanges();
        }

        Assert.Empty(await OpenPeriodsAsync(bavarian, new DateOnly(2026, 6, 12)));
        Assert.Single(await OpenPeriodsAsync(berliner, new DateOnly(2026, 6, 12)));
    }

    [Fact]
    public async Task A_closing_period_closes_every_day_in_it_and_no_other()
    {
        AddSpecialDay(bavarian, OrdinaryThursday, OrdinaryThursday.AddDays(7), SpecialDayKind.Closed);

        Assert.Empty(await OpenPeriodsAsync(bavarian, OrdinaryThursday));
        Assert.Empty(await OpenPeriodsAsync(bavarian, OrdinaryThursday.AddDays(7)));
        Assert.Equal(ThursdayHours, await OpenPeriodsAsync(bavarian, OrdinaryThursday.AddDays(14)));
    }

    [Fact]
    public async Task Special_hours_replace_the_regular_hours_also_on_a_day_without_them()
    {
        var friday = new DateOnly(2026, 6, 12);
        AddSpecialDay(bavarian, OrdinaryThursday, friday, SpecialDayKind.SpecialHours,
            (new TimeOnly(18, 0), OpeningPeriod.EndOfDay), (new TimeOnly(10, 0), new TimeOnly(12, 0)));

        OpenPeriod[] specialHours = [new(new TimeOnly(10, 0), new TimeOnly(12, 0)), new(new TimeOnly(18, 0), OpeningPeriod.EndOfDay)];
        Assert.Equal(specialHours, await OpenPeriodsAsync(bavarian, OrdinaryThursday));
        Assert.Equal(specialHours, await OpenPeriodsAsync(bavarian, friday));
    }

    [Fact]
    public async Task Special_hours_take_precedence_over_a_closed_holiday()
    {
        AddSpecialDay(bavarian, CorpusChristi, CorpusChristi, SpecialDayKind.SpecialHours, (new TimeOnly(12, 0), new TimeOnly(15, 0)));

        Assert.Equal([new OpenPeriod(new TimeOnly(12, 0), new TimeOnly(15, 0))], await OpenPeriodsAsync(bavarian, CorpusChristi));
    }

    [Fact]
    public async Task A_closing_day_takes_precedence_over_a_holiday_opened_by_an_override()
    {
        SetOverride(bavarian, CorpusChristi, isOpen: true);
        AddSpecialDay(bavarian, CorpusChristi.AddDays(-3), CorpusChristi.AddDays(3), SpecialDayKind.Closed);

        Assert.Empty(await OpenPeriodsAsync(bavarian, CorpusChristi));
    }

    [Fact]
    public async Task Special_days_of_another_tenant_do_not_apply()
    {
        AddSpecialDay(berliner, OrdinaryThursday, OrdinaryThursday, SpecialDayKind.Closed);

        Assert.Equal(ThursdayHours, await OpenPeriodsAsync(bavarian, OrdinaryThursday));
        Assert.Empty(await OpenPeriodsAsync(berliner, OrdinaryThursday));
    }
}
