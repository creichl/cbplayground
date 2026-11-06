using System.Net.Http.Json;
using Cbplayground.Api.Data;
using static Cbplayground.Api.Endpoints.SuperadminEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The Superadmin's key figures against the API's clock, which stands still at 18:10 local time on a day at least a week from now
/// (<see cref="BookingRulesTests.FixedClockApiFactory"/>), so "upcoming" is counted from the API's now, not the machine's.
/// </summary>
public class SuperadminFixedClockTests(BookingRulesTests.FixedClockApiFactory factory) : IClassFixture<BookingRulesTests.FixedClockApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Upcoming_reservations_are_counted_from_the_time_of_the_api_clock()
    {
        var today = BookingRulesTests.FixedClockApiFactory.Today;
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4), ("2", 4))]);
        // Before the API's now, though after the machine's: not counted.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", today.ToDateTime(new TimeOnly(18, 0)));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", TestRestaurant.Today.AddDays(1).ToDateTime(new TimeOnly(12, 0)));
        // After the API's now: counted, the cancelled one not.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", today.ToDateTime(new TimeOnly(18, 30)));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", today.AddDays(1).ToDateTime(new TimeOnly(12, 0)), status: ReservationStatus.Requested);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", today.AddDays(1).ToDateTime(new TimeOnly(19, 0)), status: ReservationStatus.Cancelled);
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");

        var tenants = await superadmin.GetFromJsonAsync<List<SuperadminTenant>>("/api/superadmin/tenants", Token);

        Assert.Equal(2, tenants!.Single(t => t.Id == restaurant.Id).UpcomingReservationCount);
    }
}
