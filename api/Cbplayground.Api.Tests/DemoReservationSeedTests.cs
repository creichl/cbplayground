using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Cbplayground.Api.Tests;

/// <summary>The demo reservations of the Development environment, on a factory of their own (the seed covers every restaurant).</summary>
public class DemoReservationSeedTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private List<Reservation> ReservationsOf(Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = tenantId;
        return scope.ServiceProvider.GetRequiredService<AppDbContext>().Reservations.AsNoTracking().ToList();
    }

    [Fact]
    public async Task Restaurants_with_tables_get_demo_reservations_for_today_and_the_next_7_days_once()
    {
        var instant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 50, ("1", 2), ("2", 2), ("3", 4), ("4", 4), ("5", 6)), new TestArea("Terrasse", true, 100, ("6", 4), ("7", 4))]);
        var request = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 4), ("4", 6), ("5", 8))], confirmationMode: ConfirmationMode.Request);
        var withoutTables = await TestRestaurants.CreateAsync(factory, []);

        await DevelopmentSeed.SeedReservationsAsync(factory.Services);

        var today = TestRestaurant.Today;
        var reservations = ReservationsOf(instant.Id);
        Assert.NotEmpty(reservations);
        Assert.All(reservations, r =>
        {
            var date = DateOnly.FromDateTime(r.StartLocal);
            Assert.InRange(date, today, today.AddDays(7));
            Assert.NotEqual(DayOfWeek.Monday, date.DayOfWeek);
            Assert.True(r.GuestPhone is not null || r.GuestEmail is not null);
            Assert.Equal(r.StartLocal.AddMinutes(r.DurationMinutes), r.EndLocal);
        });
        // No table is booked twice at the same time.
        Assert.All(reservations, r => Assert.DoesNotContain(reservations, o => o.Id != r.Id && o.TableId == r.TableId && o.StartLocal < r.EndLocal && o.EndLocal > r.StartLocal));
        Assert.DoesNotContain(reservations, r => r.Status == ReservationStatus.Requested);
        Assert.Contains(ReservationsOf(request.Id), r => r.Status == ReservationStatus.Requested);
        Assert.Empty(ReservationsOf(withoutTables.Id));

        // A second start adds nothing.
        await DevelopmentSeed.SeedReservationsAsync(factory.Services);
        Assert.Equal(reservations.Count, ReservationsOf(instant.Id).Count);
    }
}
