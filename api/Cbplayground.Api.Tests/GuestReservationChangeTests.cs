using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Cbplayground.Api.Reservations;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The guest changes the day, time and party size through the link (PUT …/reservations/{code}), and the free days and times
/// without the reservation itself (exclude and token). The API's clock stands still at 18:10 on a Wednesday
/// (<see cref="BookingRulesTests.FixedClockApiFactory"/>). Every test creates a restaurant of its own.
/// </summary>
public class GuestReservationChangeTests(BookingRulesTests.FixedClockApiFactory factory) : IClassFixture<BookingRulesTests.FixedClockApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static DateOnly Today => BookingRulesTests.FixedClockApiFactory.Today;

    /// <summary>The Friday after the fixed today, or the next open day after it that is no Austrian public holiday.</summary>
    private static readonly DateOnly Day = OpenDayFrom(Today.AddDays(2));

    private static readonly TestArea[] TwoTables = [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))];

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

    private static async Task<BookingResponse> BookAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests = 2,
        Guid? tableId = null)
    {
        var response = await client.PostAsJsonAsync(PathOf(restaurant, "/reservations"),
            new { date = date.ToString("yyyy-MM-dd"), time, guests, tableId, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookingResponse>(Token))!;
    }

    private static Task<HttpResponseMessage> ChangeAsync(HttpClient client, TestRestaurant restaurant, string code, string? token, DateOnly date,
        string time, int guests) =>
        client.PutAsJsonAsync(PathOf(restaurant, $"/reservations/{code}"), new { token, date = date.ToString("yyyy-MM-dd"), time, guests }, Token);

    private static async Task<GuestReservationResponse> ChangedAsync(HttpClient client, TestRestaurant restaurant, BookingResponse booking, DateOnly date,
        string time, int guests)
    {
        var response = await ChangeAsync(client, restaurant, booking.ReferenceCode, booking.ManageToken, date, time, guests);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<GuestReservationResponse>(Token))!;
    }

    private static async Task<GuestReservationResponse> ViewAsync(HttpClient client, TestRestaurant restaurant, string code, string token) =>
        (await client.GetFromJsonAsync<GuestReservationResponse>(PathOf(restaurant, $"/reservations/{code}?token={Uri.EscapeDataString(token)}"), Token))!;

    private static async Task<ReservationResponse> StaffViewAsync(HttpClient frontDesk, string code, DateOnly date)
    {
        var list = await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token);
        return Assert.Single(list!, r => r.ReferenceCode == code);
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    /// <summary>Adds an online reservation with a token directly, e.g. one that has already started or is closed.</summary>
    private async Task<(string Code, string Token)> AddWithTokenAsync(TestRestaurant restaurant, DateTime startLocal, ReservationStatus status)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var (token, hash) = ManageToken.Create();
        var reservation = new Reservation
        {
            TableId = restaurant.Tables["1"],
            Tables = [new ReservationTable { TableId = restaurant.Tables["1"] }],
            StartLocal = startLocal,
            EndLocal = startLocal.AddMinutes(120),
            DurationMinutes = 120,
            PartySize = 2,
            GuestName = "Eva Gast",
            GuestPhone = "+43 660 1234567",
            Status = status,
            Source = ReservationSource.Online,
            ReferenceCode = await ReferenceCode.GenerateUniqueAsync(db, Token),
            Language = "de",
            ManageTokenHash = hash,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow,
        };
        db.Reservations.Add(reservation);
        await db.SaveChangesAsync(Token);
        return (reservation.ReferenceCode, token);
    }

    private static async Task SetSettingsAsync(HttpClient admin, Func<ReservationSettingsDto, ReservationSettingsDto> change)
    {
        var settings = await admin.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Token);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/admin/reservation-settings", change(settings!), Token)).StatusCode);
    }

    [Fact]
    public async Task In_instant_mode_the_guest_changes_time_and_party_size_and_it_stays_confirmed_on_its_table()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables, durationRules: [(3, 4, 150)]);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");

        var changed = await ChangedAsync(anonymous, restaurant, booking, Day.AddDays(1), "19:30", 3);

        // The duration follows the new party size.
        Assert.Equal(
            (ReservationStatus.Confirmed, Day.AddDays(1), "19:30", "22:00", 3, 150, booking.TableNumber, true, true),
            (changed.Status, changed.Date, changed.Time, changed.EndTime, changed.Guests, changed.DurationMinutes, changed.TableNumber, changed.CanChange,
                changed.CanCancel));
        var staffView = await StaffViewAsync(frontDesk, booking.ReferenceCode, Day.AddDays(1));
        Assert.Equal((ReservationStatus.Confirmed, "19:30", 3, booking.TableIds[0]), (staffView.Status, staffView.Time, staffView.Guests, staffView.TableId));
        // The old time is free again, the new one taken by it.
        var view = await ViewAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken);
        Assert.Equal(("19:30", 3), (view.Time, view.Guests));
    }

    [Fact]
    public async Task A_change_of_only_the_time_keeps_the_duration_the_staff_set()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");
        var staffView = await StaffViewAsync(frontDesk, booking.ReferenceCode, Day);
        Assert.Equal(HttpStatusCode.OK, (await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{staffView.Id}",
            new { date = $"{Day:yyyy-MM-dd}", time = "18:00", guests = 2, durationMinutes = 90, tableIds = booking.TableIds, name = "Eva Gast", phone = "+43 660 1234567" },
            Token)).StatusCode);

        var changed = await ChangedAsync(anonymous, restaurant, booking, Day, "19:00", 2);

        Assert.Equal(("19:00", 90), (changed.Time, changed.DurationMinutes));
    }

    [Theory]
    [InlineData(TableSelectionMode.SystemAssigns)]
    [InlineData(TableSelectionMode.GuestChooses)]
    public async Task When_its_table_is_taken_at_the_new_time_the_system_assigns_a_free_one(TableSelectionMode mode)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables, tableSelectionMode: mode);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, Day, "12:00", tableId: restaurant.Tables["1"]);
        Assert.Equal("1", booking.TableNumber);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", Day.ToDateTime(new TimeOnly(19, 0)));

        var changed = await ChangedAsync(anonymous, restaurant, booking, Day, "19:00", 2);

        Assert.Equal(("19:00", "2", ReservationStatus.Confirmed), (changed.Time, changed.TableNumber, changed.Status));
    }

    [Fact]
    public async Task When_no_table_is_free_at_the_new_time_the_change_is_refused_and_nothing_changes()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, Day, "12:00");
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", Day.ToDateTime(new TimeOnly(19, 0)));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", Day.ToDateTime(new TimeOnly(19, 0)));

        var response = await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Day, "19:00", 2);

        Assert.Equal("slot_unavailable", await ErrorOf(response, HttpStatusCode.Conflict));
        var view = await ViewAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken);
        Assert.Equal(("12:00", 2, "1"), (view.Time, view.Guests, view.TableNumber));
    }

    [Fact]
    public async Task In_request_mode_a_changed_reservation_is_a_request_again()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables, confirmationMode: ConfirmationMode.Request);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");
        var accepted = await frontDesk.PostAsJsonAsync($"/api/staff/reservations/{(await StaffViewAsync(frontDesk, booking.ReferenceCode, Day)).Id}/status",
            new { status = "Confirmed" }, Token);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);

        var changed = await ChangedAsync(anonymous, restaurant, booking, Day, "20:00", 2);

        Assert.Equal((ReservationStatus.Requested, "20:00", true), (changed.Status, changed.Time, changed.CanChange));
        // Among the open requests of the front desk again.
        Assert.Equal(ReservationStatus.Requested, (await StaffViewAsync(frontDesk, booking.ReferenceCode, Day)).Status);
    }

    [Theory]
    [InlineData(ReservationStatus.Requested, true)]
    [InlineData(ReservationStatus.Confirmed, true)]
    [InlineData(ReservationStatus.Late, false)]
    [InlineData(ReservationStatus.Arrived, false)]
    [InlineData(ReservationStatus.Completed, false)]
    [InlineData(ReservationStatus.NoShow, false)]
    [InlineData(ReservationStatus.Cancelled, false)]
    [InlineData(ReservationStatus.Declined, false)]
    public async Task Only_requests_and_confirmed_reservations_can_be_changed(ReservationStatus status, bool changeable)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var anonymous = factory.CreateHttpsClient();
        var (code, token) = await AddWithTokenAsync(restaurant, Day.ToDateTime(new TimeOnly(18, 0)), status);

        var view = await ViewAsync(anonymous, restaurant, code, token);
        var response = await ChangeAsync(anonymous, restaurant, code, token, Day, "19:00", 2);

        Assert.Equal(changeable, view.CanChange);
        if (changeable)
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        else
        {
            Assert.Equal("change_not_possible", await ErrorOf(response, HttpStatusCode.Conflict));
            var after = await ViewAsync(anonymous, restaurant, code, token);
            Assert.Equal((status, "18:00"), (after.Status, after.Time));
        }
    }

    [Fact]
    public async Task From_the_start_on_the_guest_can_no_longer_change()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var anonymous = factory.CreateHttpsClient();
        // The clock stands at 18:10.
        var (code, token) = await AddWithTokenAsync(restaurant, Today.ToDateTime(new TimeOnly(18, 0)), ReservationStatus.Confirmed);

        var view = await ViewAsync(anonymous, restaurant, code, token);
        var response = await ChangeAsync(anonymous, restaurant, code, token, Day, "19:00", 2);

        Assert.False(view.CanChange);
        Assert.Equal("change_not_possible", await ErrorOf(response, HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task The_online_lead_time_horizon_and_largest_party_apply()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");

        // The clock stands at 18:10, the lead time is 60 minutes.
        Assert.Equal("too_short_notice", await ErrorOf(
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Today, "18:45", 2), HttpStatusCode.BadRequest));
        Assert.Equal("in_the_past", await ErrorOf(
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Today, "18:00", 2), HttpStatusCode.BadRequest));
        Assert.Equal("too_far_ahead", await ErrorOf(
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Today.AddDays(91), "18:00", 2), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_party_size", await ErrorOf(
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Day, "18:00", 5), HttpStatusCode.BadRequest));
        Assert.Equal("outside_opening_hours", await ErrorOf(
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Day, "16:00", 2), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_time", await ErrorOf(
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Day, "7pm", 2), HttpStatusCode.BadRequest));
        var view = await ViewAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken);
        Assert.Equal((Day, "18:00", 2), (view.Date, view.Time, view.Guests));
    }

    [Fact]
    public async Task The_pacing_applies_without_the_reservation_counting_against_itself()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4), ("3", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        await SetSettingsAsync(admin, s => s with { PacingRules = [new PacingRuleDto([Day.DayOfWeek], "19:00", "20:00", 5)] });
        var booking = await BookAsync(anonymous, restaurant, Day, "19:00");
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", Day.ToDateTime(new TimeOnly(19, 15)), partySize: 3);

        // At 19:00 only its own 2 guests start: 3 fit into the limit of 5.
        var larger = await ChangedAsync(anonymous, restaurant, booking, Day, "19:00", 3);
        Assert.Equal(3, larger.Guests);
        // At 19:15 3 guests start already: 3 more would be 6.
        Assert.Equal("slot_unavailable", await ErrorOf(
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Day, "19:15", 3), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task The_online_quota_of_the_area_applies()
    {
        // Half of the 8 seats can be booked online at the same time: one table of 4.
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 50, ("1", 4), ("2", 4))]);
        using var anonymous = factory.CreateHttpsClient();
        await BookAsync(anonymous, restaurant, Day, "19:00");
        var booking = await BookAsync(anonymous, restaurant, Day, "12:00");

        var response = await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Day, "19:00", 2);

        Assert.Equal("slot_unavailable", await ErrorOf(response, HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Another_guests_hold_of_the_last_table_counts()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, Day, "12:00");
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", Day.ToDateTime(new TimeOnly(19, 0)));
        var hold = await anonymous.PostAsJsonAsync(PathOf(restaurant, "/holds"), new { date = $"{Day:yyyy-MM-dd}", time = "19:00", guests = 2 }, Token);
        Assert.Equal(HttpStatusCode.Created, hold.StatusCode);

        var response = await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken, Day, "19:00", 2);

        Assert.Equal("slot_unavailable", await ErrorOf(response, HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_wrong_token_or_code_is_404_and_changes_nothing()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");

        var responses = new[]
        {
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, ManageToken.Create().Token, Day, "19:00", 2),
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, null, Day, "19:00", 2),
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken[..^1], Day, "19:00", 2),
            await ChangeAsync(anonymous, restaurant, "ZZZZZZ", booking.ManageToken, Day, "19:00", 2),
            // Also with an invalid body: the link is checked first.
            await ChangeAsync(anonymous, restaurant, booking.ReferenceCode, ManageToken.Create().Token, Day, "7pm", 0),
        };

        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("", await response.Content.ReadAsStringAsync(Token));
        }
        Assert.Equal("18:00", (await ViewAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken)).Time);
    }

    [Fact]
    public async Task The_history_records_the_change_by_the_guest_with_the_changed_fields()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables, durationRules: [(3, 4, 150)]);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", Day.ToDateTime(new TimeOnly(19, 0)));

        await ChangedAsync(anonymous, restaurant, booking, Day, "19:00", 3);

        var id = (await StaffViewAsync(frontDesk, booking.ReferenceCode, Day)).Id;
        var history = (await frontDesk.GetFromJsonAsync<List<ReservationEventResponse>>($"/api/staff/reservations/{id}/history", Token))!;
        Assert.Equal([ReservationEventKind.Updated, ReservationEventKind.Created], history.Select(e => e.Kind));
        var change = history[0];
        Assert.Equal((ReservationActor.Guest, (string?)null), (change.Actor, change.UserName));
        Assert.Equal(
            [
                new ReservationChangeResponse(ReservationField.Time, "18:00", "19:00"),
                new ReservationChangeResponse(ReservationField.PartySize, "2", "3"),
                new ReservationChangeResponse(ReservationField.Table, "1", "2"),
                new ReservationChangeResponse(ReservationField.Duration, "120", "150"),
            ],
            change.Changes);
    }

    [Fact]
    public async Task The_same_day_time_and_party_size_change_nothing_and_leave_no_history()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables, confirmationMode: ConfirmationMode.Request);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");

        var changed = await ChangedAsync(anonymous, restaurant, booking, Day, "18:00", 2);

        Assert.Equal(("18:00", 2), (changed.Time, changed.Guests));
        var id = (await StaffViewAsync(frontDesk, booking.ReferenceCode, Day)).Id;
        var history = (await frontDesk.GetFromJsonAsync<List<ReservationEventResponse>>($"/api/staff/reservations/{id}/history", Token))!;
        Assert.Equal([ReservationEventKind.Created], history.Select(e => e.Kind));
    }

    [Fact]
    public async Task The_right_code_and_token_under_another_restaurants_slug_is_404()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, TwoTables);
        var other = await TestRestaurants.CreateAsync(factory, TwoTables);
        using var anonymous = factory.CreateHttpsClient();
        using var otherAdmin = await TestRestaurants.SignInAsync(factory, other.AdminEmail);
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");

        Assert.Equal(HttpStatusCode.NotFound, (await ChangeAsync(anonymous, other, booking.ReferenceCode, booking.ManageToken, Day, "19:00", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ChangeAsync(otherAdmin, other, booking.ReferenceCode, booking.ManageToken, Day, "19:00", 2)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(
            PathOf(other, $"/availability?date={Day:yyyy-MM-dd}&guests=2&exclude={booking.ReferenceCode}&token={booking.ManageToken}"), Token)).StatusCode);

        Assert.Equal("18:00", (await ViewAsync(anonymous, restaurant, booking.ReferenceCode, booking.ManageToken)).Time);
    }

    [Fact]
    public async Task The_free_times_and_days_can_leave_out_the_guests_own_reservation()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var anonymous = factory.CreateHttpsClient();
        var booking = await BookAsync(anonymous, restaurant, Day, "18:00");
        var availability = PathOf(restaurant, $"/availability?date={Day:yyyy-MM-dd}&guests=2");
        var calendar = PathOf(restaurant, $"/calendar?month={Day:yyyy-MM}&guests=2");
        var exclude = $"&exclude={booking.ReferenceCode}&token={booking.ManageToken}";

        async Task<bool> AvailableAsync(string path) =>
            (await anonymous.GetFromJsonAsync<AvailabilityResponse>(path, Token))!.Periods.SelectMany(p => p.Times).Single(t => t.Time == "18:00").Available;

        Assert.False(await AvailableAsync(availability));
        Assert.True(await AvailableAsync(availability + exclude));
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(calendar + exclude, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{availability}&exclude={booking.ReferenceCode}&token={ManageToken.Create().Token}", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{calendar}&exclude={booking.ReferenceCode}&token=x", Token)).StatusCode);
    }
}

/// <summary>The change through the guest's link shares the rate limit of the link: 10 requests per client in 10 minutes.</summary>
public class GuestReservationChangeRateLimitTests(PublicBookingRateLimitTests.RateLimitedApiFactory factory) : IClassFixture<PublicBookingRateLimitTests.RateLimitedApiFactory>
{
    [Fact]
    public async Task Views_changes_and_cancellations_share_the_limit_and_the_eleventh_is_answered_with_429()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var anonymous = factory.CreateHttpsClient();
        var path = $"/api/public/restaurants/{restaurant.Slug}/reservations/ZZZZZZ";
        var change = new { token = "x", date = "2030-01-01", time = "18:00", guests = 2 };
        var ct = TestContext.Current.CancellationToken;

        for (var i = 0; i < 4; i++)
        {
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.PutAsJsonAsync(path, change, ct)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"{path}?token=x", ct)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.PostAsJsonAsync($"{path}/cancel", new { token = "x" }, ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.PutAsJsonAsync(path, change, ct)).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await anonymous.PutAsJsonAsync(path, change, ct)).StatusCode);
    }
}
