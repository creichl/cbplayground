using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using static Cbplayground.Api.Endpoints.SpecialDayEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>Closing days and special hours under /api/admin/special-days. Every test creates a restaurant of its own.</summary>
public class SpecialDayEndpointsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Path = "/api/admin/special-days";

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly TestArea[] OneRoom = [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6))];

    private static object Closed(DateOnly from, DateOnly to, string? note = null) =>
        new { from = from.ToString("yyyy-MM-dd"), to = to.ToString("yyyy-MM-dd"), kind = "Closed", note, periods = Array.Empty<object>() };

    private static object SpecialHours(DateOnly from, DateOnly to, params (string Start, string End)[] periods) =>
        new { from = from.ToString("yyyy-MM-dd"), to = to.ToString("yyyy-MM-dd"), kind = "SpecialHours", note = (string?)null, periods = periods.Select(p => new { start = p.Start, end = p.End }) };

    private static async Task<SpecialDaySaveResponse> CreatedAsync(HttpClient client, object body)
    {
        var response = await client.PostAsJsonAsync(Path, body, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SpecialDaySaveResponse>(Token))!;
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private static async Task<List<SpecialDayResponse>> ListAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<List<SpecialDayResponse>>(Path, Token))!;

    [Fact]
    public async Task An_admin_creates_changes_lists_and_deletes_entries()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var today = TestRestaurant.Today;

        var holidays = await CreatedAsync(admin, Closed(today.AddDays(20), today.AddDays(33), "  Betriebsurlaub "));
        var newYearsEve = await CreatedAsync(admin, SpecialHours(today.AddDays(10), today.AddDays(10), ("18:00", "24:00")));

        Assert.Equal(("Betriebsurlaub", SpecialDayKind.Closed), (holidays.SpecialDay.Note, holidays.SpecialDay.Kind));
        Assert.Empty(holidays.SpecialDay.Periods);
        Assert.Equal([new SpecialDayPeriodDto("18:00", "24:00")], newYearsEve.SpecialDay.Periods);
        // Sorted by start.
        Assert.Equal([newYearsEve.SpecialDay.Id, holidays.SpecialDay.Id], (await ListAsync(admin)).Select(d => d.Id));

        var changed = await admin.PutAsJsonAsync($"{Path}/{newYearsEve.SpecialDay.Id}",
            SpecialHours(today.AddDays(10), today.AddDays(11), ("12:00", "14:00"), ("18:00", "23:00")), Token);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var listed = (await ListAsync(admin)).Single(d => d.Id == newYearsEve.SpecialDay.Id);
        Assert.Equal(today.AddDays(11), listed.To);
        Assert.Equal([new SpecialDayPeriodDto("12:00", "14:00"), new SpecialDayPeriodDto("18:00", "23:00")], listed.Periods);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"{Path}/{newYearsEve.SpecialDay.Id}", Token)).StatusCode);
        Assert.Equal([holidays.SpecialDay.Id], (await ListAsync(admin)).Select(d => d.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"{Path}/{newYearsEve.SpecialDay.Id}", Token)).StatusCode);
    }

    [Fact]
    public async Task The_list_only_shows_entries_that_have_not_ended()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var today = TestRestaurant.Today;

        await CreatedAsync(admin, Closed(today.AddDays(-10), today.AddDays(-3)));
        var running = await CreatedAsync(admin, Closed(today.AddDays(-2), today));

        Assert.Equal([running.SpecialDay.Id], (await ListAsync(admin)).Select(d => d.Id));
    }

    [Theory]
    [InlineData("""{ "from": null, "to": "2027-01-01", "kind": "Closed" }""", "invalid_date")]
    [InlineData("""{ "from": "2027-01-02", "to": "2027-01-01", "kind": "Closed" }""", "from_after_to")]
    [InlineData("""{ "from": "2027-01-01", "to": "2028-01-02", "kind": "Closed" }""", "range_too_long")]
    [InlineData("""{ "from": "2027-01-01", "to": "2027-01-01", "kind": 7 }""", "invalid_kind")]
    [InlineData("""{ "from": "2027-01-01", "to": "2027-01-01", "kind": "SpecialHours", "periods": [] }""", "periods_required")]
    [InlineData("""{ "from": "2027-01-01", "to": "2027-01-01", "kind": "SpecialHours", "periods": [{ "start": "25:00", "end": "26:00" }] }""", "invalid_time")]
    [InlineData("""{ "from": "2027-01-01", "to": "2027-01-01", "kind": "SpecialHours", "periods": [{ "start": "18:00", "end": "17:00" }] }""", "start_not_before_end")]
    [InlineData("""{ "from": "2027-01-01", "to": "2027-01-01", "kind": "SpecialHours", "periods": [{ "start": "18:00", "end": "22:00" }, { "start": "12:00", "end": "18:30" }] }""", "overlapping_periods")]
    public async Task Invalid_entries_are_rejected(string json, string error)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);

        var response = await admin.PostAsync(Path, new StringContent(json, System.Text.Encoding.UTF8, "application/json"), Token);

        Assert.Equal(error, await ErrorOf(response, HttpStatusCode.BadRequest));
        Assert.Empty(await ListAsync(admin));
    }

    [Fact]
    public async Task The_range_may_cover_366_days_and_the_note_100_characters()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var from = TestRestaurant.Today.AddDays(1);

        await CreatedAsync(admin, Closed(from, from.AddDays(365), new string('x', 100)));

        var tooLong = await admin.PostAsJsonAsync(Path, Closed(from.AddDays(400), from.AddDays(400), new string('x', 101)), Token);
        Assert.Equal("invalid_note", await ErrorOf(tooLong, HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task Overlapping_entries_are_rejected_but_an_entry_does_not_overlap_itself()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var day = TestRestaurant.Today.AddDays(30);
        var existing = await CreatedAsync(admin, Closed(day, day.AddDays(5)));

        var overlapStart = await admin.PostAsJsonAsync(Path, Closed(day.AddDays(-3), day), Token);
        var overlapEnd = await admin.PostAsJsonAsync(Path, SpecialHours(day.AddDays(5), day.AddDays(5), ("18:00", "24:00")), Token);
        var inside = await admin.PostAsJsonAsync(Path, Closed(day.AddDays(1), day.AddDays(2)), Token);

        Assert.Equal("overlapping_special_days", await ErrorOf(overlapStart, HttpStatusCode.Conflict));
        Assert.Equal("overlapping_special_days", await ErrorOf(overlapEnd, HttpStatusCode.Conflict));
        Assert.Equal("overlapping_special_days", await ErrorOf(inside, HttpStatusCode.Conflict));
        // Adjacent entries are fine, and an entry may be moved over its own days.
        await CreatedAsync(admin, Closed(day.AddDays(6), day.AddDays(6)));
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"{Path}/{existing.SpecialDay.Id}", Closed(day.AddDays(-1), day.AddDays(4)), Token)).StatusCode);
        var overlapOther = await admin.PutAsJsonAsync($"{Path}/{existing.SpecialDay.Id}", Closed(day, day.AddDays(6)), Token);
        Assert.Equal("overlapping_special_days", await ErrorOf(overlapOther, HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Saving_lists_the_affected_reservations_and_leaves_them_unchanged()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var lunch = await TestRestaurants.AddReservationAsync(factory, restaurant, "3", date.ToDateTime(new TimeOnly(12, 0)));
        var dinner = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", date.ToDateTime(new TimeOnly(18, 0)));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", date.ToDateTime(new TimeOnly(19, 0)), status: ReservationStatus.Cancelled);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", date.AddDays(1).ToDateTime(new TimeOnly(18, 0)));

        var closed = await CreatedAsync(admin, Closed(date, date));

        // The cancelled reservation does not block its table, the one of the next day is outside the range.
        Assert.Equal(2, closed.AffectedCount);
        Assert.Equal([lunch, dinner], closed.AffectedReservations.Select(r => r.Id));
        var first = closed.AffectedReservations[0];
        Assert.Equal((date, "12:00", 2, "Direct Guest", "3", ReservationStatus.Confirmed), (first.Date, first.Time, first.Guests, first.Name, first.TableNumber, first.Status));

        // With special hours only the reservations outside the windows are affected: 18:00–20:00 fits into 17:00–22:00.
        var changed = await admin.PutAsJsonAsync($"{Path}/{closed.SpecialDay.Id}", SpecialHours(date, date, ("17:00", "22:00")), Token);
        var special = (await changed.Content.ReadFromJsonAsync<SpecialDaySaveResponse>(Token))!;
        Assert.Equal(1, special.AffectedCount);
        Assert.Equal(lunch, Assert.Single(special.AffectedReservations).Id);

        var reservations = await admin.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token);
        Assert.Equal(3, reservations!.Count);
        Assert.Equal([ReservationStatus.Confirmed, ReservationStatus.Confirmed, ReservationStatus.Cancelled], reservations.Select(r => r.Status));
    }

    [Fact]
    public async Task An_admin_only_sees_and_changes_the_entries_of_their_own_restaurant()
    {
        var restaurantA = await TestRestaurants.CreateAsync(factory, OneRoom);
        var restaurantB = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var adminA = await TestRestaurants.SignInAsync(factory, restaurantA.AdminEmail);
        using var adminB = await TestRestaurants.SignInAsync(factory, restaurantB.AdminEmail);
        var day = TestRestaurant.Today.AddDays(40);
        var ofA = await CreatedAsync(adminA, Closed(day, day.AddDays(2)));

        // The same days are free for another restaurant.
        await CreatedAsync(adminB, Closed(day, day));

        Assert.Equal([ofA.SpecialDay.Id], (await ListAsync(adminA)).Select(d => d.Id));
        Assert.DoesNotContain(ofA.SpecialDay.Id, (await ListAsync(adminB)).Select(d => d.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.PutAsJsonAsync($"{Path}/{ofA.SpecialDay.Id}", Closed(day.AddDays(10), day.AddDays(10)), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.DeleteAsync($"{Path}/{ofA.SpecialDay.Id}", Token)).StatusCode);
        Assert.Equal(day.AddDays(2), Assert.Single(await ListAsync(adminA)).To);
    }

    [Theory]
    [InlineData("GET", Path)]
    [InlineData("POST", Path)]
    [InlineData("PUT", Path + "/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", Path + "/00000000-0000-0000-0000-000000000001")]
    public async Task Only_tenant_admins_may_maintain_special_days(string method, string path)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
    }
}
