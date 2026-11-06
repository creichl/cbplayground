using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The CEO's decisions on the status rules: the undo of accepting and declining a request, the undo of a walk-in's arrival
/// (it is deleted), closed reservations keep their booking, and no undo of a cancellation after the reservation's end.
/// Against the API's clock, which stands still at 18:10 local time on a Wednesday (<see cref="BookingRulesTests.FixedClockApiFactory"/>),
/// so the restaurants with the default hours are open now.
/// </summary>
public class ReservationStatusDecisionTests(BookingRulesTests.FixedClockApiFactory factory) : IClassFixture<BookingRulesTests.FixedClockApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static DateOnly Today => BookingRulesTests.FixedClockApiFactory.Today;

    private static DateTime TodayAt(int hour, int minute = 0) => Today.ToDateTime(new TimeOnly(hour, minute));

    private static Task<HttpResponseMessage> SetStatusAsync(HttpClient client, Guid id, string status) =>
        client.PostAsJsonAsync($"/api/staff/reservations/{id}/status", new { status }, Token);

    private static async Task<ReservationResponse> StatusSetAsync(HttpClient client, Guid id, string status)
    {
        var response = await SetStatusAsync(client, id, status);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private static async Task<ReservationResponse> CreatedByStaffAsync(HttpClient client, string time)
    {
        var response = await client.PostAsJsonAsync("/api/staff/reservations",
            new { date = Today.ToString("yyyy-MM-dd"), time, guests = 2, name = "Telefon Gast" }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    /// <summary>A request booked online today at <paramref name="time"/> (the restaurant is in the request mode).</summary>
    private static async Task<Guid> RequestedOnlineAsync(ApiFactory factory, TestRestaurant restaurant, HttpClient frontDesk, string time)
    {
        using var guest = factory.CreateHttpsClient();
        var booking = await guest.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/reservations",
            new { date = Today.ToString("yyyy-MM-dd"), time, guests = 2, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);
        Assert.Equal(HttpStatusCode.Created, booking.StatusCode);
        var list = await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={Today:yyyy-MM-dd}&to={Today:yyyy-MM-dd}&status=Requested", Token);
        return Assert.Single(list!, r => r.Time == time).Id;
    }

    private static async Task<ReservationResponse> WalkedInAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/staff/walk-ins", new { guests = 2 }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static async Task<List<ReservationResponse>> TodaysReservationsAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={Today:yyyy-MM-dd}&to={Today:yyyy-MM-dd}", Token))!;

    [Fact]
    public async Task Accepting_a_request_can_be_undone()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))], confirmationMode: ConfirmationMode.Request);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var id = await RequestedOnlineAsync(factory, restaurant, frontDesk, "20:00");

        Assert.Equal(ReservationStatus.Confirmed, (await StatusSetAsync(frontDesk, id, "Confirmed")).Status);
        Assert.Equal(ReservationStatus.Requested, (await StatusSetAsync(frontDesk, id, "Requested")).Status);
        // And accepted again, e.g. after the undo of the undo.
        Assert.Equal(ReservationStatus.Confirmed, (await StatusSetAsync(frontDesk, id, "Confirmed")).Status);
    }

    [Fact]
    public async Task A_staff_reservation_cannot_go_back_to_requested()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var reservation = await CreatedByStaffAsync(frontDesk, "20:00");

        Assert.Equal("invalid_status_transition", await ErrorOf(await SetStatusAsync(frontDesk, reservation.Id, "Requested"), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Declining_a_request_can_be_undone_while_its_table_is_free()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))], confirmationMode: ConfirmationMode.Request);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var id = await RequestedOnlineAsync(factory, restaurant, frontDesk, "19:30");

        Assert.Equal(ReservationStatus.Declined, (await StatusSetAsync(frontDesk, id, "Declined")).Status);
        Assert.Equal(ReservationStatus.Requested, (await StatusSetAsync(frontDesk, id, "Requested")).Status);

        // Declined again, and meanwhile the only table is given to a phone guest.
        await StatusSetAsync(frontDesk, id, "Declined");
        Assert.Equal("1", (await CreatedByStaffAsync(frontDesk, "19:30")).TableNumber);

        Assert.Equal("table_unavailable", await ErrorOf(await SetStatusAsync(frontDesk, id, "Requested"), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task An_arrived_walk_in_can_be_deleted_and_frees_its_table()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var walkIn = await WalkedInAsync(frontDesk);

        var deleted = await frontDesk.DeleteAsync($"/api/staff/reservations/{walkIn.Id}", Token);

        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.DoesNotContain(walkIn.Id, (await TodaysReservationsAsync(frontDesk)).Select(r => r.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await frontDesk.DeleteAsync($"/api/staff/reservations/{walkIn.Id}", Token)).StatusCode);
        // The table is free for the next walk-in.
        Assert.Equal("1", (await WalkedInAsync(frontDesk)).TableNumber);
    }

    [Theory]
    [InlineData(ReservationSource.Staff, ReservationStatus.Arrived)]
    [InlineData(ReservationSource.Online, ReservationStatus.Arrived)]
    [InlineData(ReservationSource.Staff, ReservationStatus.Confirmed)]
    [InlineData(ReservationSource.WalkIn, ReservationStatus.Completed)]
    public async Task Other_reservations_cannot_be_deleted(ReservationSource source, ReservationStatus status)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var id = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TodayAt(17, 30), status: status, source: source,
            completedAtLocal: status == ReservationStatus.Completed ? TodayAt(18, 0) : null);

        Assert.Equal("cannot_delete_reservation", await ErrorOf(await frontDesk.DeleteAsync($"/api/staff/reservations/{id}", Token), HttpStatusCode.Conflict));
        Assert.Contains(id, (await TodaysReservationsAsync(frontDesk)).Select(r => r.Id));
    }

    [Fact]
    public async Task A_walk_in_of_another_restaurant_is_not_found()
    {
        var restaurantA = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        var restaurantB = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDeskA = await TestRestaurants.SignInAsync(factory, restaurantA.FrontDeskEmail);
        var walkInOfB = await TestRestaurants.AddReservationAsync(factory, restaurantB, "1", TodayAt(18, 0), status: ReservationStatus.Arrived, source: ReservationSource.WalkIn);

        Assert.Equal(HttpStatusCode.NotFound, (await frontDeskA.DeleteAsync($"/api/staff/reservations/{walkInOfB}", Token)).StatusCode);
    }

    [Fact]
    public async Task The_arrival_of_a_walk_in_cannot_be_undone_to_confirmed()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var walkIn = await WalkedInAsync(frontDesk);
        var phoneGuest = await TestRestaurants.AddReservationAsync(factory, restaurant, "2", TodayAt(18, 0), status: ReservationStatus.Arrived);

        Assert.Equal("invalid_status_transition", await ErrorOf(await SetStatusAsync(frontDesk, walkIn.Id, "Confirmed"), HttpStatusCode.Conflict));
        // A reservation's arrival still can be undone, and a walk-in still leaves.
        Assert.Equal(ReservationStatus.Confirmed, (await StatusSetAsync(frontDesk, phoneGuest, "Confirmed")).Status);
        Assert.Equal(ReservationStatus.Completed, (await StatusSetAsync(frontDesk, walkIn.Id, "Completed")).Status);
    }

    [Theory]
    [InlineData(ReservationStatus.Cancelled)]
    [InlineData(ReservationStatus.Declined)]
    [InlineData(ReservationStatus.NoShow)]
    [InlineData(ReservationStatus.Completed)]
    public async Task A_closed_reservation_takes_contact_details_and_notes_but_keeps_its_booking(ReservationStatus status)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var id = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TodayAt(17, 0), status: status,
            completedAtLocal: status == ReservationStatus.Completed ? TodayAt(18, 0) : null);
        var date = Today.ToString("yyyy-MM-dd");
        var tableId = restaurant.Tables["1"];
        Task<HttpResponseMessage> UpdateAsync(string time, int guests, Guid table, int durationMinutes) =>
            frontDesk.PutAsJsonAsync($"/api/staff/reservations/{id}", new
            {
                date, time, guests, tableId = table, durationMinutes,
                name = "Eva Huber", phone = "+43 660 7654321", email = "eva@example.com", notes = "Rief an", language = "en",
            }, Token);

        var contact = await UpdateAsync("17:00", 2, tableId, 120);

        Assert.Equal(HttpStatusCode.OK, contact.StatusCode);
        var saved = (await contact.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal(("Eva Huber", "+43 660 7654321", "eva@example.com", "Rief an", "en"), (saved.Name, saved.Phone, saved.Email, saved.Notes, saved.Language));
        Assert.Equal(("17:00", 2, "1", 120, status), (saved.Time, saved.Guests, saved.TableNumber, saved.DurationMinutes, saved.Status));

        Assert.Equal("reservation_closed", await ErrorOf(await UpdateAsync("19:00", 2, tableId, 120), HttpStatusCode.Conflict));
        Assert.Equal("reservation_closed", await ErrorOf(await UpdateAsync("17:00", 3, tableId, 120), HttpStatusCode.Conflict));
        Assert.Equal("reservation_closed", await ErrorOf(await UpdateAsync("17:00", 2, restaurant.Tables["2"], 120), HttpStatusCode.Conflict));
        Assert.Equal("reservation_closed", await ErrorOf(await UpdateAsync("17:00", 2, tableId, 90), HttpStatusCode.Conflict));
        var unchanged = Assert.Single(await TodaysReservationsAsync(frontDesk));
        Assert.Equal(("17:00", 2, "1", 120), (unchanged.Time, unchanged.Guests, unchanged.TableNumber, unchanged.DurationMinutes));
    }

    [Fact]
    public async Task A_cancellation_can_be_undone_until_the_end_of_the_reservation()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4), ("3", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        // Now is 18:10: one has ended at 18:00, one ends right now, one ends at 19:30.
        var ended = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TodayAt(16, 0), status: ReservationStatus.Cancelled);
        var endingNow = await TestRestaurants.AddReservationAsync(factory, restaurant, "2", TodayAt(16, 10), status: ReservationStatus.Cancelled);
        var running = await TestRestaurants.AddReservationAsync(factory, restaurant, "3", TodayAt(17, 30), status: ReservationStatus.Cancelled);

        Assert.Equal("status_not_allowed_now", await ErrorOf(await SetStatusAsync(frontDesk, ended, "Confirmed"), HttpStatusCode.Conflict));
        Assert.Equal("status_not_allowed_now", await ErrorOf(await SetStatusAsync(frontDesk, ended, "Late"), HttpStatusCode.Conflict));
        Assert.Equal("status_not_allowed_now", await ErrorOf(await SetStatusAsync(frontDesk, endingNow, "Confirmed"), HttpStatusCode.Conflict));
        Assert.Equal(ReservationStatus.Confirmed, (await StatusSetAsync(frontDesk, running, "Confirmed")).Status);
    }
}
