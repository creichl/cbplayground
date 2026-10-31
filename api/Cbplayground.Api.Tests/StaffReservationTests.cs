using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The reservations of the front desk under /api/staff. Every test creates a restaurant of its own.</summary>
public class StaffReservationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly TestArea[] OneRoom = [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6))];

    private static Task<HttpResponseMessage> CreateAsync(HttpClient client, DateOnly date, string time, int guests,
        Guid? tableId = null, int? durationMinutes = null, string name = "Telefon Gast", string? phone = null, string? language = null) =>
        client.PostAsJsonAsync("/api/staff/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time, guests, tableId, durationMinutes, name, phone, language }, Token);

    private static async Task<ReservationResponse> CreatedAsync(HttpClient client, DateOnly date, string time, int guests, Guid? tableId = null, int? durationMinutes = null)
    {
        var response = await CreateAsync(client, date, time, guests, tableId, durationMinutes);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static Task<HttpResponseMessage> UpdateAsync(HttpClient client, Guid id, DateOnly date, string time, int guests,
        Guid? tableId = null, int? durationMinutes = null, string? notes = null) =>
        client.PutAsJsonAsync($"/api/staff/reservations/{id}",
            new { date = date.ToString("yyyy-MM-dd"), time, guests, tableId, durationMinutes, name = "Telefon Gast", phone = "+43 660 7654321", notes }, Token);

    private static Task<HttpResponseMessage> SetStatusAsync(HttpClient client, Guid id, string status) =>
        client.PostAsJsonAsync($"/api/staff/reservations/{id}/status", new { status }, Token);

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    [Theory]
    [InlineData("GET", "/api/staff/floor")]
    [InlineData("GET", "/api/staff/reservations")]
    [InlineData("GET", "/api/staff/availability?date=2026-12-01&guests=2")]
    [InlineData("POST", "/api/staff/reservations")]
    [InlineData("PUT", "/api/staff/reservations/00000000-0000-0000-0000-000000000001")]
    [InlineData("POST", "/api/staff/reservations/00000000-0000-0000-0000-000000000001/status")]
    [InlineData("GET", "/api/staff/walk-in-tables?guests=2")]
    [InlineData("POST", "/api/staff/walk-ins")]
    public async Task Staff_endpoints_need_a_sign_in_of_restaurant_staff(string method, string path)
    {
        using var anonymous = factory.CreateHttpsClient();
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await superadmin.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
    }

    [Fact]
    public async Task The_floor_shows_the_areas_and_tables_of_the_own_restaurant_to_the_front_desk()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("10", 4), ("2", 2)), new TestArea("Terrasse", false, 50, ("T1", 6))]);
        await TestRestaurants.CreateAsync(factory, [new TestArea("Fremd", true, 100, ("X", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var floor = await frontDesk.GetFromJsonAsync<List<FloorArea>>("/api/staff/floor", Token);

        Assert.Equal(["Gaststube", "Terrasse"], floor!.Select(a => a.Name));
        Assert.Equal(["2", "10"], floor[0].Tables.Select(t => t.Number));
        Assert.Equal(6, Assert.Single(floor[1].Tables).Seats);
    }

    [Fact]
    public async Task A_phone_reservation_is_confirmed_with_an_assigned_table_and_listed_by_start()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var late = await CreatedAsync(frontDesk, date, "19:00", 3);
        var early = await CreatedAsync(frontDesk, date, "12:00", 2, restaurant.Tables["3"]);

        Assert.Equal((ReservationStatus.Confirmed, ReservationSource.Staff), (late.Status, late.Source));
        Assert.Equal(("2", "Gaststube", "19:00", "21:00", 120), (late.TableNumber, late.AreaName, late.Time, late.EndTime, late.DurationMinutes));
        Assert.Equal("3", early.TableNumber);
        // Without contact details and language: the language of the restaurant's country (Austria).
        Assert.Equal(("Telefon Gast", null, null, "de"), (late.Name, late.Phone, late.Email, late.Language));

        var list = await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token);
        Assert.Equal([early.Id, late.Id], list!.Select(r => r.Id));
        Assert.Empty((await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date.AddDays(1):yyyy-MM-dd}&to={date.AddDays(3):yyyy-MM-dd}", Token))!);
        Assert.Equal("invalid_range", await ErrorOf(await frontDesk.GetAsync($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date.AddDays(-1):yyyy-MM-dd}", Token), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task Staff_can_override_the_duration()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom, durationRules: [(1, 2, 90)]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal(90, (await CreatedAsync(frontDesk, date, "17:00", 2)).DurationMinutes);
        var overridden = await CreatedAsync(frontDesk, date, "17:00", 2, durationMinutes: 240);

        Assert.Equal((240, "21:00"), (overridden.DurationMinutes, overridden.EndTime));
        Assert.Equal("invalid_duration", await ErrorOf(await CreateAsync(frontDesk, date, "17:00", 2, durationMinutes: 100), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_duration", await ErrorOf(await CreateAsync(frontDesk, date, "17:00", 2, durationMinutes: 495), HttpStatusCode.BadRequest));
        // The opening hours apply to staff as well: 17:00 + 315 minutes ends after 22:00.
        Assert.Equal("outside_opening_hours", await ErrorOf(await CreateAsync(frontDesk, date, "17:00", 2, durationMinutes: 315), HttpStatusCode.BadRequest));

        var availability = await frontDesk.GetFromJsonAsync<StaffAvailabilityResponse>($"/api/staff/availability?date={date:yyyy-MM-dd}&guests=2&durationMinutes=60", Token);
        Assert.Equal(60, availability!.DurationMinutes);
        Assert.Equal("21:00", availability.Periods[1].Times[^1].Time);
    }

    [Fact]
    public async Task Staff_book_without_the_90_day_limit_but_not_in_the_past()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        Assert.Equal(HttpStatusCode.Created, (await CreateAsync(frontDesk, TestRestaurants.NextOpenDay(factory, 120), "18:00", 2)).StatusCode);
        Assert.Equal("in_the_past", await ErrorOf(await CreateAsync(frontDesk, TestRestaurant.Today.AddDays(-1), "18:00", 2), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_party_size", await ErrorOf(await CreateAsync(frontDesk, TestRestaurants.NextOpenDay(factory), "18:00", 7), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_name", await ErrorOf(await CreateAsync(frontDesk, TestRestaurants.NextOpenDay(factory), "18:00", 2, name: " "), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_phone", await ErrorOf(await CreateAsync(frontDesk, TestRestaurants.NextOpenDay(factory), "18:00", 2, phone: "abc"), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_language", await ErrorOf(await CreateAsync(frontDesk, TestRestaurants.NextOpenDay(factory), "18:00", 2, language: "fr"), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task A_change_is_checked_like_a_new_reservation_without_colliding_with_itself()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var first = await CreatedAsync(frontDesk, date, "18:00", 2, restaurant.Tables["1"]);
        var second = await CreatedAsync(frontDesk, date, "18:00", 2, restaurant.Tables["2"]);

        // Same table and time, longer and with a note.
        var response = await UpdateAsync(frontDesk, first.Id, date, "18:00", 4, restaurant.Tables["1"], durationMinutes: 180, notes: "Geburtstag");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var changed = (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal((4, 180, "21:00", "Geburtstag", "+43 660 7654321"), (changed.Guests, changed.DurationMinutes, changed.EndTime, changed.Notes, changed.Phone));
        Assert.Equal(first.ReferenceCode, changed.ReferenceCode);

        Assert.Equal("table_unavailable", await ErrorOf(await UpdateAsync(frontDesk, second.Id, date, "20:00", 2, restaurant.Tables["1"]), HttpStatusCode.Conflict));
        // Without a table the system assigns one again; the reservation's own table counts as free.
        var moved = await UpdateAsync(frontDesk, second.Id, date, "20:00", 2);
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        var movedReservation = (await moved.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal(("2", "20:00"), (movedReservation.TableNumber, movedReservation.Time));
        // Moving the first one to 20:00 for 3 guests: table 2 is taken now, table 1 is its own.
        var third = await UpdateAsync(frontDesk, first.Id, date, "20:00", 3);
        Assert.Equal("1", (await third.Content.ReadFromJsonAsync<ReservationResponse>(Token))!.TableNumber);
        Assert.Equal("slot_unavailable", await ErrorOf(await CreateAsync(frontDesk, date, "20:00", 2), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_change_that_keeps_the_start_may_keep_a_start_in_the_past()
    {
        var allDay = Enum.GetValues<DayOfWeek>().Select(d => (d, new TimeOnly(0, 0), OpeningPeriod.EndOfDay)).ToArray();
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom, hours: allDay);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var holidays = factory.Services.GetRequiredService<IHolidayProvider>();
        var pastDay = TestRestaurant.Today.AddDays(-1);
        while (holidays.GetHolidays("AT", null, pastDay, pastDay).Count > 0)
        {
            pastDay = pastDay.AddDays(-1);
        }
        var id = await TestRestaurants.AddReservationAsync(factory, restaurant, "2", pastDay.ToDateTime(new TimeOnly(18, 0)));

        var keep = await UpdateAsync(frontDesk, id, pastDay, "18:00", 2, restaurant.Tables["2"], durationMinutes: 150, notes: "Kam später");
        var move = await UpdateAsync(frontDesk, id, pastDay, "18:15", 2, restaurant.Tables["2"]);

        Assert.Equal(HttpStatusCode.OK, keep.StatusCode);
        Assert.Equal(150, (await keep.Content.ReadFromJsonAsync<ReservationResponse>(Token))!.DurationMinutes);
        Assert.Equal("in_the_past", await ErrorOf(move, HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task Notes_and_contact_can_be_changed_after_the_opening_hours_changed_but_the_time_cannot_be_moved_outside_them()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var reservation = await CreatedAsync(frontDesk, date, "18:00", 2, restaurant.Tables["2"]);
        // From now on open at lunchtime only.
        var lunchOnly = Enum.GetValues<DayOfWeek>().Select(d => new { dayOfWeek = (int)d, start = "11:30", end = "14:30" }).ToArray();
        (await admin.PutAsJsonAsync("/api/admin/opening-hours", new { periods = lunchOnly }, Token)).EnsureSuccessStatusCode();

        var notes = await UpdateAsync(frontDesk, reservation.Id, date, "18:00", 2, restaurant.Tables["2"], notes: "Fensterplatz");
        var moved = await UpdateAsync(frontDesk, reservation.Id, date, "18:30", 2, restaurant.Tables["2"]);

        Assert.Equal(HttpStatusCode.OK, notes.StatusCode);
        var changed = (await notes.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal(("Fensterplatz", "+43 660 7654321", "18:00", "2"), (changed.Notes, changed.Phone, changed.Time, changed.TableNumber));
        Assert.Equal("outside_opening_hours", await ErrorOf(moved, HttpStatusCode.BadRequest));
    }

    [Theory]
    [InlineData(ReservationStatus.Requested, "Confirmed", true)]
    [InlineData(ReservationStatus.Requested, "Declined", true)]
    [InlineData(ReservationStatus.Requested, "Arrived", false)]
    [InlineData(ReservationStatus.Requested, "NoShow", false)]
    [InlineData(ReservationStatus.Confirmed, "Arrived", true)]
    [InlineData(ReservationStatus.Confirmed, "Late", true)]
    [InlineData(ReservationStatus.Confirmed, "NoShow", true)]
    [InlineData(ReservationStatus.Confirmed, "Cancelled", true)]
    [InlineData(ReservationStatus.Confirmed, "Completed", false)]
    [InlineData(ReservationStatus.Confirmed, "Declined", false)]
    [InlineData(ReservationStatus.Confirmed, "Requested", false)]
    [InlineData(ReservationStatus.Late, "Arrived", true)]
    [InlineData(ReservationStatus.Late, "NoShow", true)]
    [InlineData(ReservationStatus.Late, "Cancelled", true)]
    [InlineData(ReservationStatus.Late, "Confirmed", true)]
    [InlineData(ReservationStatus.Arrived, "Confirmed", true)]
    [InlineData(ReservationStatus.Arrived, "Completed", true)]
    [InlineData(ReservationStatus.Arrived, "Cancelled", false)]
    [InlineData(ReservationStatus.Arrived, "NoShow", false)]
    [InlineData(ReservationStatus.Completed, "Arrived", true)]
    [InlineData(ReservationStatus.Completed, "Confirmed", false)]
    [InlineData(ReservationStatus.NoShow, "Confirmed", true)]
    [InlineData(ReservationStatus.NoShow, "Arrived", false)]
    [InlineData(ReservationStatus.Cancelled, "Confirmed", true)]
    [InlineData(ReservationStatus.Cancelled, "Arrived", false)]
    [InlineData(ReservationStatus.Declined, "Requested", false)]
    [InlineData(ReservationStatus.Declined, "Confirmed", false)]
    public async Task Status_changes_follow_the_allowed_transitions(ReservationStatus from, string to, bool allowed)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        // Started today, so the time rules (arrived only on the day, no-show from the start) allow every transition.
        var id = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TestRestaurant.StartedToday, status: from);

        var response = await SetStatusAsync(frontDesk, id, to);

        if (allowed)
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(Enum.Parse<ReservationStatus>(to), (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!.Status);
        }
        else
        {
            Assert.Equal("invalid_status_transition", await ErrorOf(response, HttpStatusCode.Conflict));
        }
    }

    [Fact]
    public async Task An_unknown_status_is_400()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var reservation = await CreatedAsync(frontDesk, TestRestaurants.NextOpenDay(factory), "18:00", 2);

        Assert.Equal("invalid_status", await ErrorOf(await SetStatusAsync(frontDesk, reservation.Id, "Seated"), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_status", await ErrorOf(await SetStatusAsync(frontDesk, reservation.Id, "1"), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task A_cancelled_reservation_frees_its_table()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var reservation = await CreatedAsync(frontDesk, date, "18:00", 2);
        Assert.Equal("slot_unavailable", await ErrorOf(await CreateAsync(frontDesk, date, "18:00", 2), HttpStatusCode.Conflict));

        Assert.Equal(HttpStatusCode.OK, (await SetStatusAsync(frontDesk, reservation.Id, "Cancelled")).StatusCode);

        Assert.Equal(HttpStatusCode.Created, (await CreateAsync(frontDesk, date, "18:00", 2)).StatusCode);
    }

    [Fact]
    public async Task Staff_only_see_and_change_reservations_of_their_own_restaurant()
    {
        var restaurantA = await TestRestaurants.CreateAsync(factory, OneRoom);
        var restaurantB = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var adminA = await TestRestaurants.SignInAsync(factory, restaurantA.AdminEmail);
        using var frontDeskB = await TestRestaurants.SignInAsync(factory, restaurantB.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var ofB = await CreatedAsync(frontDeskB, date, "18:00", 2);

        var listOfA = await adminA.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token);

        Assert.Empty(listOfA!);
        Assert.Equal(HttpStatusCode.NotFound, (await UpdateAsync(adminA, ofB.Id, date, "19:00", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await SetStatusAsync(adminA, ofB.Id, "Arrived")).StatusCode);
        // A's floor and availability only contain A's tables.
        var floor = await adminA.GetFromJsonAsync<List<FloorArea>>("/api/staff/floor", Token);
        Assert.Equal(restaurantA.Tables.Values.Order(), floor!.SelectMany(a => a.Tables).Select(t => t.Id).Order());
        var availability = await adminA.GetFromJsonAsync<StaffAvailabilityResponse>($"/api/staff/availability?date={date:yyyy-MM-dd}&guests=2", Token);
        Assert.All(availability!.Periods.SelectMany(p => p.Times).SelectMany(t => t.Tables), t => Assert.Contains(t.Id, restaurantA.Tables.Values));
        // A table of B is not found for A.
        Assert.Equal("table_unavailable", await ErrorOf(await CreateAsync(adminA, date, "18:00", 2, restaurantB.Tables["1"]), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_table_or_area_with_future_reservations_cannot_be_deleted()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4)), new TestArea("Terrasse", true, 100, ("3", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var reservation = await CreatedAsync(admin, date, "18:00", 2, restaurant.Tables["1"]);
        await CreatedAsync(admin, date, "18:00", 2, restaurant.Tables["3"]);

        Assert.Equal("table_has_reservations", await ErrorOf(await admin.DeleteAsync($"/api/admin/tables/{restaurant.Tables["1"]}", Token), HttpStatusCode.Conflict));
        Assert.Equal("table_has_reservations", await ErrorOf(await admin.DeleteAsync($"/api/admin/areas/{restaurant.Areas["Terrasse"]}", Token), HttpStatusCode.Conflict));

        // A cancelled reservation no longer blocks the deletion.
        Assert.Equal(HttpStatusCode.OK, (await SetStatusAsync(admin, reservation.Id, "Cancelled")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/tables/{restaurant.Tables["1"]}", Token)).StatusCode);
    }

    [Fact]
    public async Task Past_reservations_do_not_prevent_deleting_a_table_or_an_area()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 4)), new TestArea("Terrasse", true, 100, ("2", 4), ("3", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var lastWeek = TestRestaurant.Today.AddDays(-7).ToDateTime(new TimeOnly(18, 0));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", lastWeek, status: ReservationStatus.Arrived);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", lastWeek);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "3", lastWeek, status: ReservationStatus.Cancelled);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/tables/{restaurant.Tables["1"]}", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/areas/{restaurant.Areas["Terrasse"]}", Token)).StatusCode);

        var list = await admin.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={lastWeek:yyyy-MM-dd}&to={lastWeek:yyyy-MM-dd}", Token);
        Assert.Empty(list!);
        Assert.Empty((await admin.GetFromJsonAsync<List<FloorArea>>("/api/staff/floor", Token))!.SelectMany(a => a.Tables));
    }
}
