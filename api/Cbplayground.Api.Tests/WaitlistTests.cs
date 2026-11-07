using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;
using static Cbplayground.Api.Endpoints.WaitlistEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The waitlist of walk-ins: parties put on it when no table is free, seated from it as walk-ins or gone. The API's clock stands
/// still at 18:10 on a Wednesday (<see cref="BookingRulesTests.FixedClockApiFactory"/>), within the default hours 17:00–22:00.
/// </summary>
public class WaitlistTests(BookingRulesTests.FixedClockApiFactory factory) : IClassFixture<BookingRulesTests.FixedClockApiFactory>
{
    private const string WaitlistPath = "/api/staff/waitlist";

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static DateOnly Today => BookingRulesTests.FixedClockApiFactory.Today;

    private static DateTime At(int hour, int minute) => Today.ToDateTime(new TimeOnly(hour, minute));

    private static readonly TestArea[] TwoTables = [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4))];

    private static Task<HttpResponseMessage> AddAsync(HttpClient client, string? name, int guests, string? phone = null, int? quotedWaitMinutes = null,
        string? notes = null) =>
        client.PostAsJsonAsync(WaitlistPath, new { name, phone, guests, quotedWaitMinutes, notes }, Token);

    private static async Task<WaitlistEntryResponse> AddedAsync(HttpClient client, string name, int guests, string? phone = null,
        int? quotedWaitMinutes = null, string? notes = null)
    {
        var response = await AddAsync(client, name, guests, phone, quotedWaitMinutes, notes);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WaitlistEntryResponse>(Token))!;
    }

    private static async Task<List<WaitlistEntryResponse>> ListAsync(HttpClient client, string query = "") =>
        (await client.GetFromJsonAsync<List<WaitlistEntryResponse>>($"{WaitlistPath}{query}", Token))!;

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    /// <summary>Adds an entry of another day directly, which the API does not accept.</summary>
    private async Task<Guid> AddEntryOfAsync(TestRestaurant restaurant, DateOnly date, WaitlistStatus status = WaitlistStatus.Waiting)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entry = new WaitlistEntry
        {
            Date = date,
            AddedAtLocal = date.ToDateTime(new TimeOnly(19, 5)),
            Name = "Gestern Gast",
            PartySize = 2,
            Status = status,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        };
        db.WaitlistEntries.Add(entry);
        await db.SaveChangesAsync(Token);
        return entry.Id;
    }

    [Theory]
    [InlineData("GET", WaitlistPath)]
    [InlineData("POST", WaitlistPath)]
    [InlineData("PUT", $"{WaitlistPath}/00000000-0000-0000-0000-000000000001")]
    [InlineData("POST", $"{WaitlistPath}/00000000-0000-0000-0000-000000000001/seat")]
    [InlineData("POST", $"{WaitlistPath}/00000000-0000-0000-0000-000000000001/left")]
    [InlineData("POST", $"{WaitlistPath}/00000000-0000-0000-0000-000000000001/waiting")]
    public async Task The_waitlist_needs_a_sign_in_of_restaurant_staff(string method, string path)
    {
        using var anonymous = factory.CreateHttpsClient();
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await superadmin.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
    }

    [Fact]
    public async Task A_party_is_added_for_today_and_listed_in_the_order_of_arrival()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var first = await AddedAsync(frontDesk, "  Familie Huber ", 4, phone: "+43 660 7654321", quotedWaitMinutes: 30, notes: "Kinderstuhl");
        var second = await AddedAsync(frontDesk, "Paar Berger", 2);

        Assert.Equal(Today, first.Date);
        Assert.Equal("18:10", first.AddedTime);
        Assert.Equal("Familie Huber", first.Name);
        Assert.Equal("+43 660 7654321", first.Phone);
        Assert.Equal(4, first.Guests);
        Assert.Equal(30, first.QuotedWaitMinutes);
        Assert.Equal("Kinderstuhl", first.Notes);
        Assert.Equal(WaitlistStatus.Waiting, first.Status);
        Assert.Null(first.SeatedReservationId);
        Assert.Null(second.QuotedWaitMinutes);
        Assert.Equal([first.Id, second.Id], (await ListAsync(frontDesk)).Select(e => e.Id));
        Assert.Equal([first.Id, second.Id], (await ListAsync(frontDesk, $"?date={Today:yyyy-MM-dd}")).Select(e => e.Id));
        Assert.Empty(await ListAsync(frontDesk, $"?date={Today.AddDays(1):yyyy-MM-dd}"));
    }

    [Theory]
    [InlineData(null, 2, null, null, null, "invalid_name")]
    [InlineData("  ", 2, null, null, null, "invalid_name")]
    [InlineData("Gast", 0, null, null, null, "invalid_party_size")]
    [InlineData("Gast", 2, "abc", null, null, "invalid_phone")]
    [InlineData("Gast", 2, null, 0, null, "invalid_quoted_wait")]
    [InlineData("Gast", 2, null, 241, null, "invalid_quoted_wait")]
    public async Task An_invalid_entry_is_refused(string? name, int guests, string? phone, int? quotedWaitMinutes, string? notes, string error)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        Assert.Equal(error, await ErrorOf(await AddAsync(frontDesk, name, guests, phone, quotedWaitMinutes, notes), HttpStatusCode.BadRequest));
        Assert.Empty(await ListAsync(frontDesk));
    }

    [Fact]
    public async Task Too_long_names_and_notes_are_refused()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        Assert.Equal("invalid_name", await ErrorOf(await AddAsync(frontDesk, new string('a', 101), 2), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_notes", await ErrorOf(await AddAsync(frontDesk, "Gast", 2, notes: new string('a', 501)), HttpStatusCode.BadRequest));
        await AddedAsync(frontDesk, new string('a', 100), 2, notes: new string('a', 500));
    }

    [Fact]
    public async Task A_waiting_entry_is_edited()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var entry = await AddedAsync(frontDesk, "Paar Berger", 2, quotedWaitMinutes: 15);

        var response = await frontDesk.PutAsJsonAsync($"{WaitlistPath}/{entry.Id}",
            new { name = "Familie Berger", phone = "+43 660 1112223", guests = 3, quotedWaitMinutes = 45, notes = "Terrasse" }, Token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var edited = (await response.Content.ReadFromJsonAsync<WaitlistEntryResponse>(Token))!;
        Assert.Equal(("Familie Berger", "+43 660 1112223", 3, 45, "Terrasse"), (edited.Name, edited.Phone, edited.Guests, edited.QuotedWaitMinutes, edited.Notes));
        // The waiting time still counts from when the party was added.
        Assert.Equal(entry.AddedTime, edited.AddedTime);
        Assert.Equal(WaitlistStatus.Waiting, edited.Status);
        Assert.Equal("invalid_party_size", await ErrorOf(
            await frontDesk.PutAsJsonAsync($"{WaitlistPath}/{entry.Id}", new { name = "Familie Berger", guests = 0 }, Token), HttpStatusCode.BadRequest));
        Assert.Equal(3, (await ListAsync(frontDesk)).Single().Guests);
    }

    [Fact]
    public async Task A_party_that_left_waits_again_after_the_undo()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var entry = await AddedAsync(frontDesk, "Paar Berger", 2);

        var left = await frontDesk.PostAsync($"{WaitlistPath}/{entry.Id}/left", null, Token);

        Assert.Equal(HttpStatusCode.OK, left.StatusCode);
        Assert.Equal(WaitlistStatus.Left, (await left.Content.ReadFromJsonAsync<WaitlistEntryResponse>(Token))!.Status);
        Assert.Equal(WaitlistStatus.Left, (await ListAsync(frontDesk)).Single().Status);
        // Gone, it can neither be changed, seated nor leave again.
        Assert.Equal("entry_not_waiting", await ErrorOf(await frontDesk.PostAsync($"{WaitlistPath}/{entry.Id}/left", null, Token), HttpStatusCode.Conflict));
        Assert.Equal("entry_not_waiting", await ErrorOf(
            await frontDesk.PutAsJsonAsync($"{WaitlistPath}/{entry.Id}", new { name = "Paar Berger", guests = 2 }, Token), HttpStatusCode.Conflict));
        Assert.Equal("entry_not_waiting", await ErrorOf(
            await frontDesk.PostAsJsonAsync($"{WaitlistPath}/{entry.Id}/seat", new { }, Token), HttpStatusCode.Conflict));

        var undone = await frontDesk.PostAsync($"{WaitlistPath}/{entry.Id}/waiting", null, Token);

        Assert.Equal(HttpStatusCode.OK, undone.StatusCode);
        var waiting = (await undone.Content.ReadFromJsonAsync<WaitlistEntryResponse>(Token))!;
        Assert.Equal(WaitlistStatus.Waiting, waiting.Status);
        Assert.Equal(entry.AddedTime, waiting.AddedTime);
        Assert.Equal("entry_not_left", await ErrorOf(await frontDesk.PostAsync($"{WaitlistPath}/{entry.Id}/waiting", null, Token), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Seating_creates_the_walk_in_and_links_it()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var entry = await AddedAsync(frontDesk, "Familie Huber", 3, phone: "+43 660 7654321", quotedWaitMinutes: 30, notes: "Kinderstuhl");

        var response = await frontDesk.PostAsJsonAsync($"{WaitlistPath}/{entry.Id}/seat", new { tableId = restaurant.Tables["2"], durationMinutes = 90 }, Token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var seated = (await response.Content.ReadFromJsonAsync<SeatResponse>(Token))!;
        var walkIn = seated.Reservation;
        Assert.Equal(ReservationSource.WalkIn, walkIn.Source);
        Assert.Equal(ReservationStatus.Arrived, walkIn.Status);
        Assert.Equal((Today, "18:10", 90, 3), (walkIn.Date, walkIn.Time, walkIn.DurationMinutes, walkIn.Guests));
        Assert.Equal(restaurant.Tables["2"], walkIn.TableId);
        Assert.Equal(("Familie Huber", "+43 660 7654321", "Kinderstuhl"), (walkIn.Name, walkIn.Phone, walkIn.Notes));
        Assert.Equal(WaitlistStatus.Seated, seated.Entry.Status);
        Assert.Equal(walkIn.Id, seated.Entry.SeatedReservationId);

        var listed = (await ListAsync(frontDesk)).Single();
        Assert.Equal((WaitlistStatus.Seated, walkIn.Id), (listed.Status, listed.SeatedReservationId));
        Assert.Null(listed.NextFreeAt);
        var reservations = (await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={Today:yyyy-MM-dd}", Token))!;
        Assert.Equal(walkIn.Id, reservations.Single().Id);
        Assert.Equal("entry_not_waiting", await ErrorOf(
            await frontDesk.PostAsJsonAsync($"{WaitlistPath}/{entry.Id}/seat", new { }, Token), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Seating_without_a_table_takes_the_suggested_one()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var entry = await AddedAsync(frontDesk, "Paar Berger", 2);

        var response = await frontDesk.PostAsJsonAsync($"{WaitlistPath}/{entry.Id}/seat", new { }, Token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var walkIn = (await response.Content.ReadFromJsonAsync<SeatResponse>(Token))!.Reservation;
        Assert.Equal(restaurant.Tables["1"], walkIn.TableId);
        // The restaurant's duration.
        Assert.Equal(120, walkIn.DurationMinutes);
    }

    [Fact]
    public async Task Seating_at_a_taken_table_is_refused_and_the_party_keeps_waiting()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(17, 30));
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var entry = await AddedAsync(frontDesk, "Paar Berger", 2);

        var response = await frontDesk.PostAsJsonAsync($"{WaitlistPath}/{entry.Id}/seat", new { tableId = restaurant.Tables["1"] }, Token);

        Assert.Equal("table_unavailable", await ErrorOf(response, HttpStatusCode.Conflict));
        var listed = (await ListAsync(frontDesk)).Single();
        Assert.Equal(WaitlistStatus.Waiting, listed.Status);
        Assert.Null(listed.SeatedReservationId);
        var reservations = (await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={Today:yyyy-MM-dd}", Token))!;
        Assert.DoesNotContain(reservations, r => r.Source == ReservationSource.WalkIn);
    }

    [Fact]
    public async Task Deleting_the_guest_s_data_anonymises_the_waitlist_entry_they_were_seated_from()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var entry = await AddedAsync(admin, "Familie Huber", 2, phone: "+43 660 7654321", notes: "Kinderstuhl");
        var other = await AddedAsync(admin, "Paar Berger", 2, phone: "+43 660 1112223", notes: "Terrasse");
        var seated = (await (await admin.PostAsJsonAsync($"{WaitlistPath}/{entry.Id}/seat", new { tableId = restaurant.Tables["2"] }, Token))
            .Content.ReadFromJsonAsync<SeatResponse>(Token))!;
        var guestId = seated.Reservation.GuestId;
        Assert.NotNull(guestId);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/staff/guests/{guestId}", Token)).StatusCode);

        var listed = await ListAsync(admin);
        var anonymised = listed.Single(e => e.Id == entry.Id);
        Assert.Equal((Reservation.DeletedGuestName, null, null, WaitlistStatus.Seated, seated.Reservation.Id),
            (anonymised.Name, anonymised.Phone, anonymised.Notes, anonymised.Status, anonymised.SeatedReservationId));
        // Another party keeps its details.
        var kept = listed.Single(e => e.Id == other.Id);
        Assert.Equal(("Paar Berger", "+43 660 1112223", "Terrasse"), (kept.Name, kept.Phone, kept.Notes));
    }

    [Fact]
    public async Task Removing_the_seated_walk_in_puts_the_party_back_on_the_waitlist()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var entry = await AddedAsync(frontDesk, "Paar Berger", 2);
        var seated = (await (await frontDesk.PostAsJsonAsync($"{WaitlistPath}/{entry.Id}/seat", new { }, Token))
            .Content.ReadFromJsonAsync<SeatResponse>(Token))!;

        Assert.Equal(HttpStatusCode.NoContent, (await frontDesk.DeleteAsync($"/api/staff/reservations/{seated.Reservation.Id}", Token)).StatusCode);

        var listed = (await ListAsync(frontDesk)).Single();
        Assert.Equal(WaitlistStatus.Waiting, listed.Status);
        Assert.Null(listed.SeatedReservationId);
        Assert.Equal(entry.AddedTime, listed.AddedTime);
    }

    [Fact]
    public async Task Next_free_at_is_the_earliest_time_today_a_table_for_the_party_is_free()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        // Table 1 (2 seats) until 19:45, table 2 (4 seats) until 20:00; the duration is 120 minutes, the last start 20:00.
        var onTableOne = await TestRestaurants.AddReservationAsync(factory, restaurant, "1", At(17, 45));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", At(18, 0));
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var couple = await AddedAsync(frontDesk, "Paar Berger", 2);
        var family = await AddedAsync(frontDesk, "Familie Huber", 4);
        var group = await AddedAsync(frontDesk, "Stammtisch", 6);

        Assert.Equal("19:45", couple.NextFreeAt);
        Assert.Equal("20:00", family.NextFreeAt);
        // No table seats six.
        Assert.Null(group.NextFreeAt);
        Assert.Equal(["19:45", "20:00", null], (await ListAsync(frontDesk)).Select(e => e.NextFreeAt));

        // Table 1 is free again now: the couple can be seated right away.
        Assert.Equal(HttpStatusCode.OK, (await frontDesk.PostAsJsonAsync($"/api/staff/reservations/{onTableOne}/status", new { status = "Cancelled" }, Token)).StatusCode);
        Assert.Equal(["18:10", "20:00", null], (await ListAsync(frontDesk)).Select(e => e.NextFreeAt));
    }

    [Fact]
    public async Task Entries_of_past_days_are_read_only()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        var yesterday = Today.AddDays(-1);
        var id = await AddEntryOfAsync(restaurant, yesterday);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var listed = (await ListAsync(frontDesk, $"?date={yesterday:yyyy-MM-dd}")).Single();
        Assert.Equal((id, "19:05", WaitlistStatus.Waiting), (listed.Id, listed.AddedTime, listed.Status));
        Assert.Null(listed.NextFreeAt);
        Assert.Empty(await ListAsync(frontDesk));

        Assert.Equal("entry_not_today", await ErrorOf(
            await frontDesk.PutAsJsonAsync($"{WaitlistPath}/{id}", new { name = "Gast", guests = 2 }, Token), HttpStatusCode.Conflict));
        Assert.Equal("entry_not_today", await ErrorOf(await frontDesk.PostAsJsonAsync($"{WaitlistPath}/{id}/seat", new { }, Token), HttpStatusCode.Conflict));
        Assert.Equal("entry_not_today", await ErrorOf(await frontDesk.PostAsync($"{WaitlistPath}/{id}/left", null, Token), HttpStatusCode.Conflict));
        var left = await AddEntryOfAsync(restaurant, yesterday, WaitlistStatus.Left);
        Assert.Equal("entry_not_today", await ErrorOf(await frontDesk.PostAsync($"{WaitlistPath}/{left}/waiting", null, Token), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Another_restaurant_neither_sees_nor_changes_the_waitlist()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        var other = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var otherAdmin = await TestRestaurants.SignInAsync(factory, other.AdminEmail);
        var entry = await AddedAsync(frontDesk, "Paar Berger", 2);

        Assert.Empty(await ListAsync(otherAdmin));
        Assert.Equal(HttpStatusCode.NotFound, (await otherAdmin.PutAsJsonAsync($"{WaitlistPath}/{entry.Id}", new { name = "Fremd", guests = 2 }, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherAdmin.PostAsJsonAsync($"{WaitlistPath}/{entry.Id}/seat", new { tableId = other.Tables["1"] }, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherAdmin.PostAsync($"{WaitlistPath}/{entry.Id}/left", null, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherAdmin.PostAsync($"{WaitlistPath}/{entry.Id}/waiting", null, Token)).StatusCode);

        var listed = (await ListAsync(frontDesk)).Single();
        Assert.Equal(("Paar Berger", WaitlistStatus.Waiting), (listed.Name, listed.Status));
        Assert.Empty((await otherAdmin.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={Today:yyyy-MM-dd}", Token))!);
    }
}
