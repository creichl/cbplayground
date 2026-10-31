using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.Reservations;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The evening at the front desk: no-shows, guests who left, walk-ins, the undo of status changes and the time rules of the
/// status changes. Tests that need the restaurant open now use opening hours around the clock and open it on a public holiday.
/// </summary>
public class ReservationStatusWorkflowTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly (DayOfWeek Day, TimeOnly Start, TimeOnly End)[] AllDay =
        Enum.GetValues<DayOfWeek>().Select(d => (d, new TimeOnly(0, 0), OpeningPeriod.EndOfDay)).ToArray();

    /// <summary>A restaurant that is open now, whatever the time and day.</summary>
    private async Task<TestRestaurant> OpenNowAsync(TestArea[] areas, (DayOfWeek Day, TimeOnly Start, TimeOnly End)[]? hours = null)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, areas, hours: hours ?? AllDay);
        await TestRestaurants.OpenOnHolidayAsync(factory, restaurant, TestRestaurant.Today);
        return restaurant;
    }

    private static Task<HttpResponseMessage> SetStatusAsync(HttpClient client, Guid id, string status) =>
        client.PostAsJsonAsync($"/api/staff/reservations/{id}/status", new { status }, Token);

    private static async Task<ReservationResponse> StatusSetAsync(HttpClient client, Guid id, string status)
    {
        var response = await SetStatusAsync(client, id, status);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static Task<HttpResponseMessage> CreateAsync(HttpClient client, DateOnly date, string time, int guests) =>
        client.PostAsJsonAsync("/api/staff/reservations", new { date = date.ToString("yyyy-MM-dd"), time, guests, name = "Telefon Gast" }, Token);

    private static async Task<ReservationResponse> CreatedAsync(HttpClient client, DateOnly date, string time, int guests)
    {
        var response = await CreateAsync(client, date, time, guests);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static Task<HttpResponseMessage> WalkInAsync(HttpClient client, int guests, Guid? tableId = null, int? durationMinutes = null,
        string? name = null, string? phone = null, string? notes = null) =>
        client.PostAsJsonAsync("/api/staff/walk-ins", new { guests, tableId, durationMinutes, name, phone, notes }, Token);

    private static async Task<ReservationResponse> WalkedInAsync(HttpClient client, int guests, Guid? tableId = null, int? durationMinutes = null,
        string? name = null, string? phone = null, string? notes = null)
    {
        var response = await WalkInAsync(client, guests, tableId, durationMinutes, name, phone, notes);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static async Task<WalkInTablesResponse> WalkInTablesAsync(HttpClient client, int guests) =>
        (await client.GetFromJsonAsync<WalkInTablesResponse>($"/api/staff/walk-in-tables?guests={guests}", Token))!;

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    /// <summary>Minutes since midnight of "HH:mm".</summary>
    private static int Minutes(string time) => int.Parse(time[..2]) * 60 + int.Parse(time[3..]);

    /// <summary>Asserts that "HH:mm" lies between two local times taken before and after the request (to the minute).</summary>
    private static void AssertBetween(DateTime before, string time, DateTime after)
    {
        var minutes = Minutes(time);
        Assert.InRange(minutes, before.Hour * 60 + before.Minute, after.Date > before.Date ? 24 * 60 : after.Hour * 60 + after.Minute);
    }

    [Fact]
    public async Task A_no_show_is_possible_from_the_start_on_and_frees_the_table()
    {
        var restaurant = await OpenNowAsync([new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var started = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TestRestaurant.StartedToday);
        var now = TestRestaurant.Now;
        var soon = await TestRestaurants.AddReservationAsync(factory, restaurant, "2",
            new DateTime(now.Year, now.Month, now.Day, now.Hour, now.Minute, 0).AddMinutes(5));
        var future = await CreatedAsync(frontDesk, TestRestaurants.NextOpenDay(factory), "18:00", 2);
        Assert.Empty((await WalkInTablesAsync(frontDesk, 2)).Tables);

        Assert.Equal("status_not_allowed_now", await ErrorOf(await SetStatusAsync(frontDesk, soon, "NoShow"), HttpStatusCode.Conflict));
        Assert.Equal("status_not_allowed_now", await ErrorOf(await SetStatusAsync(frontDesk, future.Id, "NoShow"), HttpStatusCode.Conflict));
        Assert.Equal(ReservationStatus.NoShow, (await StatusSetAsync(frontDesk, started, "NoShow")).Status);

        Assert.Equal(["1"], (await WalkInTablesAsync(frontDesk, 2)).Tables.Select(t => t.Number));
    }

    [Fact]
    public async Task No_shows_do_not_block_and_guests_who_left_only_until_they_left_online_and_for_staff()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", date.ToDateTime(new TimeOnly(12, 0)), status: ReservationStatus.NoShow);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", date.ToDateTime(new TimeOnly(18, 0)),
            status: ReservationStatus.Completed, completedAtLocal: date.ToDateTime(new TimeOnly(19, 0)));

        var online = await anonymous.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time = "12:00", guests = 2, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);

        Assert.Equal(HttpStatusCode.Created, online.StatusCode);
        Assert.Equal("slot_unavailable", await ErrorOf(await CreateAsync(frontDesk, date, "18:30", 2), HttpStatusCode.Conflict));
        Assert.Equal("19:00", (await CreatedAsync(frontDesk, date, "19:00", 2)).Time);
    }

    [Fact]
    public async Task Arrived_and_late_are_only_possible_on_the_day_of_the_reservation()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var future = await CreatedAsync(frontDesk, TestRestaurants.NextOpenDay(factory), "18:00", 2);
        var today = await TestRestaurants.AddReservationAsync(factory, restaurant, "2", TestRestaurant.StartedToday);

        Assert.Equal("status_not_allowed_now", await ErrorOf(await SetStatusAsync(frontDesk, future.Id, "Arrived"), HttpStatusCode.Conflict));
        Assert.Equal("status_not_allowed_now", await ErrorOf(await SetStatusAsync(frontDesk, future.Id, "Late"), HttpStatusCode.Conflict));
        Assert.Equal(ReservationStatus.Late, (await StatusSetAsync(frontDesk, today, "Late")).Status);
        Assert.Equal(ReservationStatus.Arrived, (await StatusSetAsync(frontDesk, today, "Arrived")).Status);
    }

    [Fact]
    public async Task A_guest_who_left_frees_the_table_from_that_moment_and_the_undo_needs_the_table()
    {
        var restaurant = await OpenNowAsync([new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var id = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TestRestaurant.StartedToday, status: ReservationStatus.Arrived);
        Assert.Empty((await WalkInTablesAsync(frontDesk, 2)).Tables);

        var before = TestRestaurant.Now;
        var left = await StatusSetAsync(frontDesk, id, "Completed");
        var after = TestRestaurant.Now;

        Assert.Equal(ReservationStatus.Completed, left.Status);
        AssertBetween(before, left.CompletedTime!, after);
        Assert.Equal(["1"], (await WalkInTablesAsync(frontDesk, 2)).Tables.Select(t => t.Number));

        // Undo while the table is free; then the guest leaves again and a walk-in takes the table.
        var undone = await StatusSetAsync(frontDesk, id, "Arrived");
        Assert.Equal((ReservationStatus.Arrived, null), (undone.Status, undone.CompletedTime));
        await StatusSetAsync(frontDesk, id, "Completed");
        await WalkedInAsync(frontDesk, 2, restaurant.Tables["1"]);

        Assert.Equal("table_unavailable", await ErrorOf(await SetStatusAsync(frontDesk, id, "Arrived"), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_cancellation_can_be_undone_while_the_table_is_free()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var first = await CreatedAsync(frontDesk, date, "18:00", 2);
        await StatusSetAsync(frontDesk, first.Id, "Cancelled");
        var second = await CreatedAsync(frontDesk, date, "18:00", 2);

        Assert.Equal("table_unavailable", await ErrorOf(await SetStatusAsync(frontDesk, first.Id, "Confirmed"), HttpStatusCode.Conflict));

        await StatusSetAsync(frontDesk, second.Id, "Cancelled");
        Assert.Equal(ReservationStatus.Confirmed, (await StatusSetAsync(frontDesk, first.Id, "Confirmed")).Status);
        Assert.Equal("slot_unavailable", await ErrorOf(await CreateAsync(frontDesk, date, "18:00", 2), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_no_show_can_be_undone_while_the_table_is_free()
    {
        var restaurant = await OpenNowAsync([new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var first = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TestRestaurant.StartedToday);
        var second = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TestRestaurant.StartedToday);
        await StatusSetAsync(frontDesk, first, "NoShow");
        await StatusSetAsync(frontDesk, second, "NoShow");

        Assert.Equal(ReservationStatus.Confirmed, (await StatusSetAsync(frontDesk, first, "Confirmed")).Status);
        Assert.Equal("table_unavailable", await ErrorOf(await SetStatusAsync(frontDesk, second, "Confirmed"), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_walk_in_is_seated_now_as_arrived_at_a_free_table()
    {
        var restaurant = await OpenNowAsync([new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var tables = await WalkInTablesAsync(frontDesk, 3);
        Assert.Equal(["2", "3"], tables.Tables.Select(t => t.Number));
        Assert.Equal(120, tables.DurationMinutes);

        var before = TestRestaurant.Now;
        var walkIn = await WalkedInAsync(frontDesk, 3);
        var after = TestRestaurant.Now;

        Assert.Equal((ReservationStatus.Arrived, ReservationSource.WalkIn, Reservation.WalkInName), (walkIn.Status, walkIn.Source, walkIn.Name));
        Assert.Equal(("2", 3, 120, null, "de"), (walkIn.TableNumber, walkIn.Guests, walkIn.DurationMinutes, walkIn.Phone, walkIn.Language));
        AssertBetween(before, walkIn.Time, after);
        // Started now to the minute, not on the quarter-hour grid; listed with the day's reservations.
        var list = await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={walkIn.Date:yyyy-MM-dd}&to={walkIn.Date:yyyy-MM-dd}", Token);
        Assert.Contains(walkIn.Id, list!.Select(r => r.Id));

        var named = await WalkedInAsync(frontDesk, 2, restaurant.Tables["3"], durationMinutes: 60, name: " Familie Huber ", phone: "+43 660 1234567", notes: "Kinderstuhl");
        Assert.Equal(("3", 60, "Familie Huber", "+43 660 1234567", "Kinderstuhl"), (named.TableNumber, named.DurationMinutes, named.Name, named.Phone, named.Notes));

        Assert.Equal(["1"], (await WalkInTablesAsync(frontDesk, 2)).Tables.Select(t => t.Number));
        Assert.Equal("slot_unavailable", await ErrorOf(await WalkInAsync(frontDesk, 3), HttpStatusCode.Conflict));
        Assert.Equal("table_unavailable", await ErrorOf(await WalkInAsync(frontDesk, 2, restaurant.Tables["2"]), HttpStatusCode.Conflict));
        Assert.Equal("table_unavailable", await ErrorOf(await WalkInAsync(frontDesk, 4, restaurant.Tables["1"]), HttpStatusCode.Conflict));
        Assert.Equal("invalid_party_size", await ErrorOf(await WalkInAsync(frontDesk, 7), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_party_size", await ErrorOf(await WalkInAsync(frontDesk, 0), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_party_size", await ErrorOf(await frontDesk.GetAsync("/api/staff/walk-in-tables?guests=0", Token), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_duration", await ErrorOf(await WalkInAsync(frontDesk, 2, durationMinutes: 100), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_phone", await ErrorOf(await WalkInAsync(frontDesk, 2, phone: "abc"), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task A_walk_in_needs_the_restaurant_open_now_but_may_end_after_closing_and_ignores_the_online_quota()
    {
        var closed = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))], hours: []);
        using var closedFrontDesk = await TestRestaurants.SignInAsync(factory, closed.FrontDeskEmail);
        Assert.Equal("outside_opening_hours", await ErrorOf(await WalkInAsync(closedFrontDesk, 2), HttpStatusCode.BadRequest));
        Assert.Equal("outside_opening_hours", await ErrorOf(await closedFrontDesk.GetAsync("/api/staff/walk-in-tables?guests=2", Token), HttpStatusCode.BadRequest));

        // Open from midnight until the next quarter hour but one, in an area without online booking.
        var now = TestRestaurant.Now;
        var closingMinute = ((now.Hour * 60 + now.Minute) / ReservationRules.SlotMinutes + 2) * ReservationRules.SlotMinutes;
        var closing = closingMinute >= 24 * 60 ? OpeningPeriod.EndOfDay : new TimeOnly(closingMinute / 60, closingMinute % 60);
        var restaurant = await OpenNowAsync([new TestArea("Terrasse", false, 0, ("1", 4))],
            Enum.GetValues<DayOfWeek>().Select(d => (d, new TimeOnly(0, 0), closing)).ToArray());
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var walkIn = await WalkedInAsync(frontDesk, 4, durationMinutes: 180);

        Assert.Equal(("1", 180), (walkIn.TableNumber, walkIn.DurationMinutes));
    }

    [Fact]
    public async Task A_walk_in_can_be_changed_while_its_start_off_the_grid_is_kept()
    {
        var restaurant = await OpenNowAsync([new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var walkIn = await WalkedInAsync(frontDesk, 2);

        var changed = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{walkIn.Id}",
            new { date = walkIn.Date.ToString("yyyy-MM-dd"), time = walkIn.Time, guests = 3, tableId = walkIn.TableId, durationMinutes = 90, name = "Familie Huber" }, Token);

        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var saved = (await changed.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal((walkIn.Time, 3, 90, "Familie Huber", ReservationSource.WalkIn), (saved.Time, saved.Guests, saved.DurationMinutes, saved.Name, saved.Source));
    }

    [Fact]
    public async Task Walk_ins_only_use_tables_of_the_own_restaurant()
    {
        var restaurantA = await OpenNowAsync([new TestArea("Gaststube", true, 100, ("1", 4))]);
        var restaurantB = await OpenNowAsync([new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDeskA = await TestRestaurants.SignInAsync(factory, restaurantA.FrontDeskEmail);

        Assert.Equal("table_unavailable", await ErrorOf(await WalkInAsync(frontDeskA, 2, restaurantB.Tables["1"]), HttpStatusCode.Conflict));
        Assert.Equal([restaurantA.Tables["1"]], (await WalkInTablesAsync(frontDeskA, 2)).Tables.Select(t => t.Id));
    }
}
