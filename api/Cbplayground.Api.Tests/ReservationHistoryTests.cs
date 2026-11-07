using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The history of a reservation: who changed what and when. Every test creates a restaurant of its own.</summary>
public class ReservationHistoryTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly TestArea[] OneRoom = [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6))];

    private static readonly (DayOfWeek Day, TimeOnly Start, TimeOnly End)[] AllDay =
        Enum.GetValues<DayOfWeek>().Select(d => (d, new TimeOnly(0, 0), OpeningPeriod.EndOfDay)).ToArray();

    private static object Body(DateOnly date, string time, int guests, Guid? tableId, string name = "Telefon Gast", string? phone = null,
        string? email = null, string? notes = null, int? durationMinutes = null) =>
        new { date = date.ToString("yyyy-MM-dd"), time, guests, tableId, durationMinutes, name, phone, email, notes };

    private static async Task<ReservationResponse> CreatedAsync(HttpClient client, object body)
    {
        var response = await client.PostAsJsonAsync("/api/staff/reservations", body, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static async Task UpdatedAsync(HttpClient client, Guid id, object body) =>
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/staff/reservations/{id}", body, Token)).StatusCode);

    private static async Task StatusSetAsync(HttpClient client, Guid id, string status) =>
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/staff/reservations/{id}/status", new { status }, Token)).StatusCode);

    private static async Task<List<ReservationEventResponse>> HistoryAsync(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<List<ReservationEventResponse>>($"/api/staff/reservations/{id}/history", Token))!;

    private static ReservationChangeResponse Change(ReservationField field, string? from, string? to) => new(field, from, to);

    /// <summary>The events of the reservation as stored, read with the restaurant as tenant.</summary>
    private List<ReservationEvent> StoredEvents(TestRestaurant restaurant, Guid reservationId)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        return scope.ServiceProvider.GetRequiredService<AppDbContext>().ReservationEvents.AsNoTracking().Where(e => e.ReservationId == reservationId).ToList();
    }

    [Fact]
    public async Task A_staff_reservation_starts_its_history_with_the_staff_user_at_the_restaurants_time()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var reservation = await CreatedAsync(frontDesk, Body(TestRestaurants.NextOpenDay(factory), "19:00", 2, null));

        var created = Assert.Single(await HistoryAsync(frontDesk, reservation.Id));
        Assert.Equal((ReservationEventKind.Created, ReservationActor.Staff, restaurant.FrontDeskEmail), (created.Kind, created.Actor, created.UserName));
        Assert.Empty(created.Changes);
        // In the restaurant's time zone (Europe/Vienna), to the minute.
        var at = created.Date.ToDateTime(TimeOnly.ParseExact(created.Time, "HH:mm", CultureInfo.InvariantCulture));
        Assert.InRange(TestRestaurant.Now - at, TimeSpan.Zero, TimeSpan.FromMinutes(2));
    }

    [Fact]
    public async Task A_change_records_only_the_changed_fields_with_who_made_it_newest_first()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var reservation = await CreatedAsync(frontDesk, Body(date, "19:00", 2, restaurant.Tables["2"]));

        await UpdatedAsync(admin, reservation.Id, Body(date, "19:30", 2, restaurant.Tables["3"], phone: "+43 660 7654321", notes: "Fensterplatz"));
        var laterDate = TestRestaurants.NextOpenDay(factory, date.DayNumber - TestRestaurant.Today.DayNumber + 1);
        await UpdatedAsync(frontDesk, reservation.Id, Body(laterDate, "19:30", 5, restaurant.Tables["3"], name: "Neuer Name", phone: "+43 660 7654321",
            email: "gast@example.at", notes: "Fensterplatz", durationMinutes: 90));

        var history = await HistoryAsync(admin, reservation.Id);
        Assert.Equal([ReservationEventKind.Updated, ReservationEventKind.Updated, ReservationEventKind.Created], history.Select(e => e.Kind));
        Assert.Equal((ReservationActor.Staff, restaurant.FrontDeskEmail), (history[0].Actor, history[0].UserName));
        Assert.Equal(
            [
                Change(ReservationField.Date, date.ToString("yyyy-MM-dd"), laterDate.ToString("yyyy-MM-dd")),
                Change(ReservationField.PartySize, "2", "5"),
                Change(ReservationField.Duration, "120", "90"),
                Change(ReservationField.Name, "Telefon Gast", "Neuer Name"),
                Change(ReservationField.Email, null, "gast@example.at"),
            ],
            history[0].Changes);
        Assert.Equal((ReservationActor.Staff, restaurant.AdminEmail), (history[1].Actor, history[1].UserName));
        Assert.Equal(
            [
                Change(ReservationField.Time, "19:00", "19:30"),
                Change(ReservationField.Table, "2", "3"),
                Change(ReservationField.Phone, null, "+43 660 7654321"),
                Change(ReservationField.Notes, null, "Fensterplatz"),
            ],
            history[1].Changes);
    }

    [Fact]
    public async Task A_put_that_changes_nothing_adds_no_entry()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var body = Body(TestRestaurants.NextOpenDay(factory), "18:00", 2, restaurant.Tables["1"], phone: "+43 660 1234567", notes: "Kinderstuhl");
        var reservation = await CreatedAsync(frontDesk, body);

        await UpdatedAsync(frontDesk, reservation.Id, body);

        Assert.Equal(ReservationEventKind.Created, Assert.Single(await HistoryAsync(frontDesk, reservation.Id)).Kind);
    }

    [Fact]
    public async Task A_status_change_records_the_old_and_the_new_status()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var reservation = await CreatedAsync(frontDesk, Body(TestRestaurants.NextOpenDay(factory), "18:00", 2, null));

        await StatusSetAsync(frontDesk, reservation.Id, "Cancelled");
        await StatusSetAsync(admin, reservation.Id, "Confirmed");

        var history = await HistoryAsync(frontDesk, reservation.Id);
        Assert.Equal(
            [
                (ReservationEventKind.StatusChanged, restaurant.AdminEmail),
                (ReservationEventKind.StatusChanged, restaurant.FrontDeskEmail),
                (ReservationEventKind.Created, restaurant.FrontDeskEmail),
            ],
            history.Select(e => (e.Kind, e.UserName!)));
        Assert.Equal([Change(ReservationField.Status, "Cancelled", "Confirmed")], history[0].Changes);
        Assert.Equal([Change(ReservationField.Status, "Confirmed", "Cancelled")], history[1].Changes);
    }

    [Fact]
    public async Task A_walk_in_is_recorded_as_created_by_the_staff()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom, hours: AllDay);
        await TestRestaurants.OpenOnHolidayAsync(factory, restaurant, TestRestaurant.Today);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var response = await frontDesk.PostAsJsonAsync("/api/staff/walk-ins", new { guests = 2 }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var walkIn = (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;

        var created = Assert.Single(await HistoryAsync(frontDesk, walkIn.Id));
        Assert.Equal((ReservationEventKind.Created, ReservationActor.Staff, restaurant.FrontDeskEmail), (created.Kind, created.Actor, created.UserName));
        Assert.Empty(created.Changes);
    }

    [Fact]
    public async Task An_online_booking_and_its_cancellation_through_the_link_are_recorded_as_the_guest()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var guest = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var booking = await guest.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 2, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);
        Assert.Equal(HttpStatusCode.Created, booking.StatusCode);
        var booked = (await booking.Content.ReadFromJsonAsync<BookingResponse>(Token))!;

        Assert.Equal(HttpStatusCode.OK, (await guest.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/reservations/{booked.ReferenceCode}/cancel",
            new { token = booked.ManageToken }, Token)).StatusCode);

        var reservation = Assert.Single((await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token))!);
        var history = await HistoryAsync(frontDesk, reservation.Id);
        Assert.Equal(
            [(ReservationEventKind.CancelledByGuest, ReservationActor.Guest), (ReservationEventKind.Created, ReservationActor.Guest)],
            history.Select(e => (e.Kind, e.Actor)));
        Assert.All(history, e => Assert.Null(e.UserName));
        Assert.Equal([Change(ReservationField.Status, "Confirmed", "Cancelled")], history[0].Changes);
        Assert.Empty(history[1].Changes);
    }

    [Fact]
    public async Task The_history_is_only_shown_to_the_staff_of_the_own_restaurant()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        var other = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var otherAdmin = await TestRestaurants.SignInAsync(factory, other.AdminEmail);
        var reservation = await CreatedAsync(frontDesk, Body(TestRestaurants.NextOpenDay(factory), "18:00", 2, null));

        Assert.Equal(HttpStatusCode.NotFound, (await otherAdmin.GetAsync($"/api/staff/reservations/{reservation.Id}/history", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await frontDesk.GetAsync($"/api/staff/reservations/{Guid.NewGuid()}/history", Token)).StatusCode);
        // The events belong to the reservation's restaurant; the other one does not see them.
        Assert.Single(StoredEvents(restaurant, reservation.Id));
        Assert.Empty(StoredEvents(other, reservation.Id));
    }

    [Fact]
    public async Task The_history_stays_with_its_reservation_when_its_table_is_deleted()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var reservation = await CreatedAsync(admin, Body(TestRestaurants.NextOpenDay(factory), "18:00", 2, restaurant.Tables["1"]));
        // A cancelled reservation no longer blocks the table, so the table can be deleted; it is archived and keeps the reservation.
        await StatusSetAsync(admin, reservation.Id, "Cancelled");
        Assert.Equal(2, StoredEvents(restaurant, reservation.Id).Count);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/tables/{restaurant.Tables["1"]}", Token)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/staff/reservations/{reservation.Id}/history", Token)).StatusCode);
        Assert.Equal(2, StoredEvents(restaurant, reservation.Id).Count);
    }
}
