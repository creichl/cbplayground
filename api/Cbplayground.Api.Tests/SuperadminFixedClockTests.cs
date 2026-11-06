using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
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

    /// <summary>The API's now in UTC.</summary>
    private static DateTime UtcNow => TimeZoneInfo.ConvertTimeToUtc(
        BookingRulesTests.FixedClockApiFactory.Today.ToDateTime(BookingRulesTests.FixedClockApiFactory.Now),
        TimeZoneInfo.FindSystemTimeZoneById(Locations.TimeZones[Locations.Austria]));

    [Fact]
    public async Task The_activity_figures_are_counted_per_restaurant_from_the_api_clock_in_its_time_zone()
    {
        var today = BookingRulesTests.FixedClockApiFactory.Today;
        DateTime At(int days, int hour, int minute = 0) => today.AddDays(days).ToDateTime(new TimeOnly(hour, minute));
        // Vienna: now is 18:10 local time.
        var vienna = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4), ("2", 4))]);
        // Without a location the restaurant's time is UTC, so its now is an hour or two before 18:10.
        var utc = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4), ("2", 4))], withLocation: false);

        // Last 7 days: from 18:10 a week ago up to now.
        await TestRestaurants.AddReservationAsync(factory, vienna, "1", At(-7, 18, 0));
        await TestRestaurants.AddReservationAsync(factory, vienna, "1", At(-7, 18, 30));
        await TestRestaurants.AddReservationAsync(factory, vienna, "1", At(0, 17, 30), status: ReservationStatus.NoShow);
        await TestRestaurants.AddReservationAsync(factory, vienna, "2", At(0, 12, 0), status: ReservationStatus.Cancelled);
        // Next 7 days: from now up to 18:10 in a week; later ones are only upcoming.
        await TestRestaurants.AddReservationAsync(factory, vienna, "1", At(0, 18, 30), status: ReservationStatus.Requested);
        await TestRestaurants.AddReservationAsync(factory, vienna, "1", At(7, 18, 0));
        await TestRestaurants.AddReservationAsync(factory, vienna, "1", At(7, 19, 0));
        await TestRestaurants.AddReservationAsync(factory, vienna, "2", At(30, 19, 0));
        await TestRestaurants.AddReservationAsync(factory, vienna, "1", At(30, 19, 0), status: ReservationStatus.Declined);
        // The newest online booking counts, also when it was cancelled later; staff reservations do not.
        await TestRestaurants.AddReservationAsync(factory, vienna, "2", At(3, 12, 0), source: ReservationSource.Online, createdAtUtc: UtcNow.AddDays(-3));
        await TestRestaurants.AddReservationAsync(factory, vienna, "2", At(4, 12, 0), status: ReservationStatus.Cancelled,
            source: ReservationSource.Online, createdAtUtc: UtcNow.AddHours(-5));
        await TestRestaurants.AddReservationAsync(factory, vienna, "2", At(5, 12, 0), createdAtUtc: UtcNow.AddHours(-1));
        // 17:30 is still to come in UTC, but over in Vienna.
        await TestRestaurants.AddReservationAsync(factory, utc, "1", At(0, 17, 30));
        await TestRestaurants.AddReservationAsync(factory, utc, "1", At(-1, 12, 0));
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");

        var tenants = await superadmin.GetFromJsonAsync<List<SuperadminTenant>>("/api/superadmin/tenants", Token);

        var inVienna = tenants!.Single(t => t.Id == vienna.Id);
        Assert.Equal(2, inVienna.ReservationsLast7Days);
        Assert.Equal(4, inVienna.ReservationsNext7Days);
        Assert.Equal(6, inVienna.UpcomingReservationCount);
        Assert.Equal(UtcNow.AddHours(-5), inVienna.LastOnlineBookingAtUtc);
        Assert.Equal(DateTimeKind.Utc, inVienna.LastOnlineBookingAtUtc!.Value.Kind);
        var inUtc = tenants!.Single(t => t.Id == utc.Id);
        Assert.Equal(1, inUtc.ReservationsLast7Days);
        Assert.Equal(1, inUtc.ReservationsNext7Days);
        Assert.Equal(1, inUtc.UpcomingReservationCount);
        Assert.Null(inUtc.LastOnlineBookingAtUtc);
    }

    [Fact]
    public async Task A_sign_in_sets_the_last_staff_sign_in_of_its_restaurant_only()
    {
        var signedIn = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4))]);
        var other = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4))]);
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");
        Assert.Null((await ListAsync(superadmin)).Single(t => t.Id == signedIn.Id).LastStaffSignInAtUtc);

        using var frontDesk = await TestRestaurants.SignInAsync(factory, signedIn.FrontDeskEmail);
        // A failed sign-in is no sign-in.
        using var failed = factory.CreateHttpsClient();
        var wrongPassword = await failed.PostAsJsonAsync("/api/auth/login", new { email = other.AdminEmail, password = "wrong" }, Token);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);

        var tenants = await ListAsync(superadmin);
        Assert.Equal(UtcNow, tenants.Single(t => t.Id == signedIn.Id).LastStaffSignInAtUtc);
        Assert.Null(tenants.Single(t => t.Id == other.Id).LastStaffSignInAtUtc);
    }

    private static async Task<List<SuperadminTenant>> ListAsync(HttpClient superadmin) =>
        (await superadmin.GetFromJsonAsync<List<SuperadminTenant>>("/api/superadmin/tenants", Token))!;
}
