using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The hold of a table while the guest enters the contact details (POST/DELETE …/holds) and the idempotent online booking. The API's
/// clock starts at 18:10 local time on a Wednesday (<see cref="BookingRulesTests.FixedClockApiFactory.Today"/>) and only moves when
/// a test moves it forward (<see cref="MovableClockApiFactory.Clock"/>); the tests book two days later, so the lead time never matters.
/// </summary>
public class ReservationHoldTests(ReservationHoldTests.MovableClockApiFactory factory) : IClassFixture<ReservationHoldTests.MovableClockApiFactory>
{
    /// <summary>The API with a clock that stands still until <see cref="MovableClock.Advance"/> moves it forward.</summary>
    public class MovableClockApiFactory : ApiFactory
    {
        public class MovableClock(DateTimeOffset start) : TimeProvider
        {
            private long elapsedTicks;

            public void Advance(TimeSpan by) => Interlocked.Add(ref elapsedTicks, by.Ticks);

            public override DateTimeOffset GetUtcNow() => start.AddTicks(Interlocked.Read(ref elapsedTicks));
        }

        public MovableClock Clock { get; } = new(new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(
            BookingRulesTests.FixedClockApiFactory.Today.ToDateTime(BookingRulesTests.FixedClockApiFactory.Now),
            TimeZoneInfo.FindSystemTimeZoneById(Locations.TimeZones[Locations.Austria])), TimeSpan.Zero));

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(Clock));
        }
    }

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    /// <summary>Two days after the API's today, or the next open day after it that is no Austrian public holiday.</summary>
    private static readonly DateOnly Day = OpenDayFrom(BookingRulesTests.FixedClockApiFactory.Today.AddDays(2));

    private static DateOnly OpenDayFrom(DateOnly date)
    {
        var holidays = new HolidayProvider();
        while (date.DayOfWeek == DayOfWeek.Monday || holidays.GetHolidays(Locations.Austria, null, date, date).Count > 0)
        {
            date = date.AddDays(1);
        }
        return date;
    }

    private static string PathOf(TestRestaurant restaurant, string rest = "") => $"/api/public/restaurants/{restaurant.Slug}{rest}";

    private static Task<HttpResponseMessage> HoldAsync(HttpClient client, TestRestaurant restaurant, string time, int guests, Guid? tableId = null) =>
        client.PostAsJsonAsync(PathOf(restaurant, "/holds"), new { date = Day.ToString("yyyy-MM-dd"), time, guests, tableId }, Token);

    private static async Task<HoldResponse> HeldAsync(HttpClient client, TestRestaurant restaurant, string time, int guests, Guid? tableId = null)
    {
        var response = await HoldAsync(client, restaurant, time, guests, tableId);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<HoldResponse>(Token))!;
    }

    private static async Task<HttpResponseMessage> BookAsync(HttpClient client, TestRestaurant restaurant, string time, int guests, Guid? tableId = null,
        string? holdToken = null, string? idempotencyKey = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, PathOf(restaurant, "/reservations"))
        {
            Content = JsonContent.Create(new
            {
                date = Day.ToString("yyyy-MM-dd"), time, guests, tableId, name = "Eva Gast", phone = "+43 660 1234567", language = "de", holdToken,
            }),
        };
        if (idempotencyKey is not null)
        {
            request.Headers.Add(IdempotencyKeyHeader, idempotencyKey);
        }
        return await client.SendAsync(request, Token);
    }

    private static async Task<BookingResponse> BookedAsync(HttpClient client, TestRestaurant restaurant, string time, int guests, Guid? tableId = null,
        string? holdToken = null, string? idempotencyKey = null)
    {
        var response = await BookAsync(client, restaurant, time, guests, tableId, holdToken, idempotencyKey);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookingResponse>(Token))!;
    }

    private static Task<HttpResponseMessage> BookByStaffAsync(HttpClient client, string time, int guests, Guid? tableId = null) =>
        client.PostAsJsonAsync("/api/staff/reservations", new { date = Day.ToString("yyyy-MM-dd"), time, guests, tableId, name = "Telefon Gast" }, Token);

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private static async Task<bool> IsAvailableAsync(HttpClient client, TestRestaurant restaurant, string time, int guests)
    {
        var availability = await client.GetFromJsonAsync<AvailabilityResponse>(PathOf(restaurant, $"/availability?date={Day:yyyy-MM-dd}&guests={guests}"), Token);
        return availability!.Periods.SelectMany(p => p.Times).Single(t => t.Time == time).Available;
    }

    /// <summary>The holds of the restaurant in the database, expired ones too.</summary>
    private async Task<int> StoredHoldsAsync(TestRestaurant restaurant)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().ReservationHolds.CountAsync(Token);
    }

    [Fact]
    public async Task A_hold_blocks_its_table_for_other_online_bookings_and_other_holds()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 2))],
            tableSelectionMode: TableSelectionMode.GuestChooses);
        using var guest = factory.CreateHttpsClient();
        using var other = factory.CreateHttpsClient();

        var hold = await HeldAsync(guest, restaurant, "19:00", 2, restaurant.Tables["1"]);

        Assert.Equal(("1", "Gaststube"), (hold.TableNumber, hold.Area));
        Assert.Equal(factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(5), hold.ExpiresAtUtc);
        Assert.Equal("table_unavailable", await ErrorOf(await HoldAsync(other, restaurant, "19:00", 2, restaurant.Tables["1"]), HttpStatusCode.Conflict));
        Assert.Equal("table_unavailable", await ErrorOf(await BookAsync(other, restaurant, "19:00", 2, restaurant.Tables["1"]), HttpStatusCode.Conflict));
        // For the whole duration of the reservation it holds the table for.
        Assert.Equal("table_unavailable", await ErrorOf(await BookAsync(other, restaurant, "19:45", 2, restaurant.Tables["1"]), HttpStatusCode.Conflict));
        var tables = await other.GetFromJsonAsync<List<PublicArea>>(PathOf(restaurant, $"/tables?date={Day:yyyy-MM-dd}&time=19:00&guests=2"), Token);
        Assert.Equal([("1", false), ("2", true)], tables!.Single().Tables.Select(t => (t.Number, t.Available)));
        // The other table stays free.
        Assert.Equal("2", (await HeldAsync(other, restaurant, "19:00", 2, restaurant.Tables["2"])).TableNumber);
        // Without a table where the guest chooses: refused like the booking.
        Assert.Equal("table_required", await ErrorOf(await HoldAsync(other, restaurant, "18:00", 2), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task A_hold_counts_for_the_online_quota()
    {
        // Half of 8 seats online: one table for 4 at a time.
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 50, ("1", 4), ("2", 4))]);
        using var guest = factory.CreateHttpsClient();
        using var other = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        await HeldAsync(guest, restaurant, "19:00", 3);

        Assert.False(await IsAvailableAsync(other, restaurant, "19:00", 3));
        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(other, restaurant, "19:00", 3), HttpStatusCode.Conflict));
        Assert.Equal("slot_unavailable", await ErrorOf(await HoldAsync(other, restaurant, "19:00", 3), HttpStatusCode.Conflict));
        // The quota does not bind the staff.
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(frontDesk, "19:00", 3)).StatusCode);
    }

    [Fact]
    public async Task A_hold_counts_for_the_pacing()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4), ("3", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var settings = await admin.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Token);
        var saved = await admin.PutAsJsonAsync("/api/admin/reservation-settings",
            settings! with { PacingRules = [new PacingRuleDto(Enum.GetValues<DayOfWeek>(), "18:00", "21:00", 4)] }, Token);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        using var guest = factory.CreateHttpsClient();
        using var other = factory.CreateHttpsClient();

        await HeldAsync(guest, restaurant, "19:00", 4);

        Assert.False(await IsAvailableAsync(other, restaurant, "19:00", 2));
        Assert.True(await IsAvailableAsync(other, restaurant, "19:15", 2));
        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(other, restaurant, "19:00", 2), HttpStatusCode.Conflict));
        // The staff's figures show the reservations only.
        var staff = await admin.GetFromJsonAsync<StaffReservationEndpoints.StaffAvailabilityResponse>($"/api/staff/availability?date={Day:yyyy-MM-dd}&guests=2", Token);
        Assert.Equal(0, staff!.Periods.SelectMany(p => p.Times).Single(t => t.Time == "19:00").Pacing!.Booked);
    }

    [Fact]
    public async Task A_hold_expires_after_five_minutes()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2))]);
        using var guest = factory.CreateHttpsClient();
        using var other = factory.CreateHttpsClient();

        var hold = await HeldAsync(guest, restaurant, "19:00", 2);
        factory.Clock.Advance(TimeSpan.FromMinutes(5) - TimeSpan.FromSeconds(1));

        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(other, restaurant, "19:00", 2), HttpStatusCode.Conflict));
        factory.Clock.Advance(TimeSpan.FromSeconds(1));

        Assert.True(await IsAvailableAsync(other, restaurant, "19:00", 2));
        Assert.Equal("1", (await BookedAsync(other, restaurant, "19:00", 2)).TableNumber);
        // The expired hold is gone with that booking, and can no longer be released.
        Assert.Equal(0, await StoredHoldsAsync(restaurant));
        Assert.Equal(HttpStatusCode.NotFound, (await guest.DeleteAsync(PathOf(restaurant, $"/holds/{hold.HoldToken}"), Token)).StatusCode);
    }

    [Fact]
    public async Task Booking_with_the_hold_books_its_table_and_consumes_the_hold()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 2))],
            tableSelectionMode: TableSelectionMode.GuestChooses);
        using var guest = factory.CreateHttpsClient();

        var hold = await HeldAsync(guest, restaurant, "19:00", 2, restaurant.Tables["2"]);
        // A hold of another time or table is not the guest's for this booking: it stands in the way like any other.
        Assert.Equal("table_unavailable", await ErrorOf(await BookAsync(guest, restaurant, "19:15", 2, restaurant.Tables["2"], hold.HoldToken), HttpStatusCode.Conflict));
        var booking = await BookedAsync(guest, restaurant, "19:00", 2, restaurant.Tables["2"], hold.HoldToken);

        Assert.Equal("2", booking.TableNumber);
        Assert.Equal(0, await StoredHoldsAsync(restaurant));
        Assert.Equal(HttpStatusCode.NotFound, (await guest.DeleteAsync(PathOf(restaurant, $"/holds/{hold.HoldToken}"), Token)).StatusCode);
    }

    [Fact]
    public async Task Where_the_system_assigns_the_booking_gets_the_held_table()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2))]);
        using var guest = factory.CreateHttpsClient();

        var hold = await HeldAsync(guest, restaurant, "19:00", 2);

        // The only table is held: without the hold even the same guest cannot book it, with it they get it.
        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(guest, restaurant, "19:00", 2), HttpStatusCode.Conflict));
        Assert.Equal("1", (await BookedAsync(guest, restaurant, "19:00", 2, holdToken: hold.HoldToken)).TableNumber);
    }

    [Fact]
    public async Task An_expired_hold_books_when_the_table_is_still_free_and_not_when_it_is_taken()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2))]);
        using var guest = factory.CreateHttpsClient();
        using var other = factory.CreateHttpsClient();

        var free = await HeldAsync(guest, restaurant, "19:00", 2);
        var taken = await HeldAsync(guest, restaurant, "12:00", 2);
        factory.Clock.Advance(TimeSpan.FromMinutes(6));
        await BookedAsync(other, restaurant, "12:00", 2);

        Assert.Equal("1", (await BookedAsync(guest, restaurant, "19:00", 2, holdToken: free.HoldToken)).TableNumber);
        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(guest, restaurant, "12:00", 2, holdToken: taken.HoldToken), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Staff_can_book_over_a_hold_and_the_guest_then_gets_table_unavailable()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 2))],
            tableSelectionMode: TableSelectionMode.GuestChooses);
        using var guest = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var hold = await HeldAsync(guest, restaurant, "19:00", 2, restaurant.Tables["1"]);
        var staffAvailability = await frontDesk.GetFromJsonAsync<StaffReservationEndpoints.StaffAvailabilityResponse>(
            $"/api/staff/availability?date={Day:yyyy-MM-dd}&guests=2", Token);

        Assert.Contains("1", staffAvailability!.Periods.SelectMany(p => p.Times).Single(t => t.Time == "19:00").Tables.Select(t => t.Number));
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(frontDesk, "19:00", 2, restaurant.Tables["1"])).StatusCode);
        Assert.Equal("table_unavailable", await ErrorOf(await BookAsync(guest, restaurant, "19:00", 2, restaurant.Tables["1"], hold.HoldToken), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Releasing_a_hold_frees_its_table()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2))]);
        using var guest = factory.CreateHttpsClient();
        using var other = factory.CreateHttpsClient();
        var hold = await HeldAsync(guest, restaurant, "19:00", 2);

        Assert.Equal(HttpStatusCode.NoContent, (await guest.DeleteAsync(PathOf(restaurant, $"/holds/{hold.HoldToken}"), Token)).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await guest.DeleteAsync(PathOf(restaurant, $"/holds/{hold.HoldToken}"), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.DeleteAsync(PathOf(restaurant, "/holds/not-a-token"), Token)).StatusCode);
        Assert.Equal("1", (await BookedAsync(other, restaurant, "19:00", 2)).TableNumber);
    }

    [Fact]
    public async Task A_hold_belongs_to_its_restaurant()
    {
        var restaurantA = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube A", true, 100, ("A1", 2))]);
        var restaurantB = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube B", true, 100, ("B1", 2))]);
        using var guest = factory.CreateHttpsClient();
        using var other = factory.CreateHttpsClient();
        var hold = await HeldAsync(guest, restaurantA, "19:00", 2);

        // Neither released nor booked through another restaurant; there the token is no hold at all.
        Assert.Equal(HttpStatusCode.NotFound, (await guest.DeleteAsync(PathOf(restaurantB, $"/holds/{hold.HoldToken}"), Token)).StatusCode);
        Assert.Equal("B1", (await BookedAsync(guest, restaurantB, "19:00", 2, holdToken: hold.HoldToken)).TableNumber);

        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(other, restaurantA, "19:00", 2), HttpStatusCode.Conflict));
        Assert.Equal(1, await StoredHoldsAsync(restaurantA));
        Assert.Equal(0, await StoredHoldsAsync(restaurantB));
    }

    [Fact]
    public async Task Of_simultaneous_holds_of_the_last_table_exactly_one_succeeds()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        var clients = Enumerable.Range(0, 6).Select(_ => factory.CreateHttpsClient()).ToList();

        var responses = await Task.WhenAll(clients.Select(client => HoldAsync(client, restaurant, "19:00", 2)));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        foreach (var response in responses.Where(r => r.StatusCode != HttpStatusCode.Created))
        {
            Assert.Equal("slot_unavailable", await ErrorOf(response, HttpStatusCode.Conflict));
        }
        clients.ForEach(c => c.Dispose());
    }

    [Fact]
    public async Task A_repeated_booking_with_the_same_key_returns_the_same_reservation_with_a_working_token()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 2))]);
        using var guest = factory.CreateHttpsClient();
        var key = Guid.NewGuid().ToString();

        var first = await BookedAsync(guest, restaurant, "19:00", 2, idempotencyKey: key);
        var repeated = await BookedAsync(guest, restaurant, "19:00", 2, idempotencyKey: key);

        Assert.Equal((first.ReferenceCode, first.Status, first.Date, first.Time, first.Guests, first.TableNumber, first.Area),
            (repeated.ReferenceCode, repeated.Status, repeated.Date, repeated.Time, repeated.Guests, repeated.TableNumber, repeated.Area));
        Assert.Equal(first.TableIds, repeated.TableIds);
        Assert.NotEqual(first.ManageToken, repeated.ManageToken);
        // Only the newest token opens the guest's link.
        Assert.Equal(HttpStatusCode.OK,
            (await guest.GetAsync(PathOf(restaurant, $"/reservations/{repeated.ReferenceCode}?token={Uri.EscapeDataString(repeated.ManageToken)}"), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await guest.GetAsync(PathOf(restaurant, $"/reservations/{first.ReferenceCode}?token={Uri.EscapeDataString(first.ManageToken)}"), Token)).StatusCode);

        // Another key books anew, on the other table.
        var another = await BookedAsync(guest, restaurant, "19:00", 2, idempotencyKey: Guid.NewGuid().ToString());
        Assert.NotEqual(first.ReferenceCode, another.ReferenceCode);
        Assert.Equal("2", another.TableNumber);
        // The same key at another restaurant is another booking.
        var restaurantB = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube B", true, 100, ("B1", 2))]);
        Assert.NotEqual(first.ReferenceCode, (await BookedAsync(guest, restaurantB, "19:00", 2, idempotencyKey: key)).ReferenceCode);
        Assert.Equal("invalid_idempotency_key",
            await ErrorOf(await BookAsync(guest, restaurant, "19:00", 2, idempotencyKey: new string('k', 101)), HttpStatusCode.BadRequest));
    }
}

/// <summary>The limit of active holds per client IP, across all restaurants, with the real default of 3.</summary>
public class ReservationHoldLimitTests(ReservationHoldLimitTests.HoldLimitedApiFactory factory) : IClassFixture<ReservationHoldLimitTests.HoldLimitedApiFactory>
{
    public class HoldLimitedApiFactory : ApiFactory
    {
        protected override int PublicHoldLimit => PublicRestaurantEndpoints.DefaultHoldLimit;
    }

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private Task<HttpResponseMessage> HoldAsync(HttpClient client, TestRestaurant restaurant, string time) =>
        client.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/holds",
            new { date = TestRestaurants.NextOpenDay(factory).ToString("yyyy-MM-dd"), time, guests = 2 }, Token);

    [Fact]
    public async Task A_client_holds_at_most_three_tables_at_a_time()
    {
        var restaurantA = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube A", true, 100, ("1", 2), ("2", 2), ("3", 2))]);
        var restaurantB = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube B", true, 100, ("1", 2), ("2", 2))]);
        using var client = factory.CreateHttpsClient();

        Assert.Equal(HttpStatusCode.Created, (await HoldAsync(client, restaurantA, "19:00")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await HoldAsync(client, restaurantA, "19:00")).StatusCode);
        var third = await HoldAsync(client, restaurantB, "19:00");
        Assert.Equal(HttpStatusCode.Created, third.StatusCode);

        var fourth = await HoldAsync(client, restaurantB, "19:00");
        Assert.Equal(HttpStatusCode.TooManyRequests, fourth.StatusCode);
        Assert.Equal("too_many_holds", (await fourth.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error);

        // Releasing one makes room for another.
        var token = (await third.Content.ReadFromJsonAsync<HoldResponse>(Token))!.HoldToken;
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/public/restaurants/{restaurantB.Slug}/holds/{token}", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await HoldAsync(client, restaurantB, "19:00")).StatusCode);
    }
}
