using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Tests;

public sealed class ReservationDurationPolicyTests : IDisposable
{
    private class FakeTenantContext(Guid? tenantId) : ITenantContext
    {
        public Guid? TenantId { get; } = tenantId;
    }

    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private readonly DbContextOptions<AppDbContext> options;
    private readonly Guid tenantA;
    private readonly Guid tenantB;

    public ReservationDurationPolicyTests()
    {
        connection.Open();
        options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;

        using var db = CreateContext(null);
        db.Database.EnsureCreated();
        var a = new Tenant { Name = "A", Slug = "a", CreatedAt = DateTime.UtcNow };
        var b = new Tenant { Name = "B", Slug = "b", CreatedAt = DateTime.UtcNow };
        db.Tenants.AddRange(a, b);
        db.SaveChanges();
        tenantA = a.Id;
        tenantB = b.Id;
    }

    public void Dispose() => connection.Dispose();

    private AppDbContext CreateContext(Guid? tenantId) => new(options, new FakeTenantContext(tenantId));

    /// <summary>Tenant A: default 105 minutes, 1–2 guests 90 minutes, 3–6 guests 120 minutes, 9–12 guests 180 minutes.</summary>
    private void SeedTenantA()
    {
        using var db = CreateContext(tenantA);
        db.ReservationSettings.Add(new ReservationSettings { DefaultDurationMinutes = 105 });
        db.DurationRules.AddRange(
            new DurationRule { MinGuests = 1, MaxGuests = 2, DurationMinutes = 90 },
            new DurationRule { MinGuests = 3, MaxGuests = 6, DurationMinutes = 120 },
            new DurationRule { MinGuests = 9, MaxGuests = 12, DurationMinutes = 180 });
        db.SaveChanges();
    }

    private async Task<int> GetDurationAsync(Guid tenantId, int guests)
    {
        using var db = CreateContext(tenantId);
        return await new ReservationDurationPolicy(db).GetDurationAsync(guests, TestContext.Current.CancellationToken);
    }

    [Theory]
    [InlineData(1, 90)]
    [InlineData(2, 90)]
    [InlineData(3, 120)]
    [InlineData(6, 120)]
    [InlineData(12, 180)]
    public async Task A_matching_rule_gives_its_duration(int guests, int expected)
    {
        SeedTenantA();

        Assert.Equal(expected, await GetDurationAsync(tenantA, guests));
    }

    [Theory]
    [InlineData(7)]
    [InlineData(8)]
    [InlineData(13)]
    [InlineData(40)]
    public async Task In_a_gap_between_the_rules_the_default_duration_applies(int guests)
    {
        SeedTenantA();

        Assert.Equal(105, await GetDurationAsync(tenantA, guests));
    }

    [Fact]
    public async Task Without_rules_the_default_duration_applies()
    {
        using (var db = CreateContext(tenantB))
        {
            db.ReservationSettings.Add(new ReservationSettings { DefaultDurationMinutes = 150 });
            db.SaveChanges();
        }

        Assert.Equal(150, await GetDurationAsync(tenantB, 4));
    }

    [Fact]
    public async Task Without_stored_settings_the_default_is_120_minutes()
    {
        Assert.Equal(120, await GetDurationAsync(tenantB, 4));
    }

    [Fact]
    public async Task The_rules_and_settings_of_another_tenant_do_not_apply()
    {
        SeedTenantA();

        Assert.Equal(120, await GetDurationAsync(tenantB, 1));
        Assert.Equal(120, await GetDurationAsync(tenantB, 7));
    }

    [Fact]
    public async Task A_party_size_below_one_is_rejected()
    {
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => GetDurationAsync(tenantA, 0));
    }

    [Fact]
    public void New_settings_default_to_instant_confirmation_and_120_minutes()
    {
        var settings = new ReservationSettings();

        Assert.Equal(ConfirmationMode.Instant, settings.ConfirmationMode);
        Assert.Equal(120, settings.DefaultDurationMinutes);
    }
}
