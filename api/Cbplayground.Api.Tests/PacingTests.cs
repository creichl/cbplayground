using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Cbplayground.Api.Reservations;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// Pacing: at most so many guests may start per 15-minute slot in a time range. Online, a slot beyond it is not offered;
/// staff can still book and see the figures. The API's clock stands still at 18:10 on a Wednesday
/// (<see cref="BookingRulesTests.FixedClockApiFactory"/>).
/// </summary>
public class PacingTests(BookingRulesTests.FixedClockApiFactory factory) : IClassFixture<BookingRulesTests.FixedClockApiFactory>
{
    private const string SettingsPath = "/api/admin/reservation-settings";

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    /// <summary>Enough tables that they never limit the tests; only the pacing does.</summary>
    private static readonly TestArea[] OneRoom =
        [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6), ("4", 4), ("5", 4), ("6", 6))];

    /// <summary>The Friday after the fixed today, or the next open day after it that is no Austrian public holiday.</summary>
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

    private static PacingRuleDto Rule(string from, string to, int maxCovers, params DayOfWeek[] days) => new(days, from, to, maxCovers);

    private static async Task<HttpResponseMessage> SetPacingAsync(HttpClient admin, params PacingRuleDto[] rules)
    {
        var settings = await admin.GetFromJsonAsync<ReservationSettingsDto>(SettingsPath, Token);
        return await admin.PutAsJsonAsync(SettingsPath, settings! with { PacingRules = rules }, Token);
    }

    private static Task<HttpResponseMessage> BookOnlineAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests) =>
        client.PostAsJsonAsync(PathOf(restaurant, "/reservations"),
            new { date = date.ToString("yyyy-MM-dd"), time, guests, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);

    private static Task<HttpResponseMessage> BookByStaffAsync(HttpClient client, DateOnly date, string time, int guests) =>
        client.PostAsJsonAsync("/api/staff/reservations", new { date = date.ToString("yyyy-MM-dd"), time, guests, name = "Telefon Gast" }, Token);

    private static async Task<bool> IsAvailableOnlineAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests)
    {
        var availability = await client.GetFromJsonAsync<AvailabilityResponse>(PathOf(restaurant, $"/availability?date={date:yyyy-MM-dd}&guests={guests}"), Token);
        return availability!.Periods.SelectMany(p => p.Times).Single(t => t.Time == time).Available;
    }

    private static async Task<StaffAvailabilityTime> StaffTimeAsync(HttpClient client, DateOnly date, string time, int guests)
    {
        var availability = await client.GetFromJsonAsync<StaffAvailabilityResponse>($"/api/staff/availability?date={date:yyyy-MM-dd}&guests={guests}", Token);
        return availability!.Periods.SelectMany(p => p.Times).Single(t => t.Time == time);
    }

    private static async Task<string> CalendarStatusAsync(HttpClient client, TestRestaurant restaurant, DateOnly date)
    {
        var days = await client.GetFromJsonAsync<List<CalendarDay>>(PathOf(restaurant, $"/calendar?month={date:yyyy-MM}&guests=2"), Token);
        return days!.Single(d => d.Date == date).Status;
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private Task AddReservationAsync(TestRestaurant restaurant, string table, string time, int guests,
        ReservationStatus status = ReservationStatus.Confirmed, ReservationSource source = ReservationSource.Staff) =>
        TestRestaurants.AddReservationAsync(factory, restaurant, table, Day.ToDateTime(TimeOnly.Parse(time)), status: status, source: source, partySize: guests);

    [Fact]
    public async Task A_full_slot_is_not_offered_online_and_the_neighbouring_slots_are()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.OK, (await SetPacingAsync(admin, Rule("18:00", "20:00", 6, Day.DayOfWeek))).StatusCode);
        // 4 guests at 19:00 online, and a walk-in of 2 at 19:07, which starts in the 19:00 slot as well.
        await AddReservationAsync(restaurant, "3", "19:00", 4, source: ReservationSource.Online);
        await AddReservationAsync(restaurant, "1", "19:07", 2, source: ReservationSource.WalkIn);

        Assert.False(await IsAvailableOnlineAsync(anonymous, restaurant, Day, "19:00", 2));
        Assert.True(await IsAvailableOnlineAsync(anonymous, restaurant, Day, "18:45", 2));
        Assert.True(await IsAvailableOnlineAsync(anonymous, restaurant, Day, "19:15", 2));
        Assert.Equal("slot_unavailable", await ErrorOf(await BookOnlineAsync(anonymous, restaurant, Day, "19:00", 2), HttpStatusCode.Conflict));

        // Up to the limit a slot stays bookable: 4 + 2 guests at 19:15 is exactly 6, one guest more is not.
        await AddReservationAsync(restaurant, "2", "19:15", 4);
        Assert.True(await IsAvailableOnlineAsync(anonymous, restaurant, Day, "19:15", 2));
        Assert.False(await IsAvailableOnlineAsync(anonymous, restaurant, Day, "19:15", 3));
        Assert.Equal(HttpStatusCode.Created, (await BookOnlineAsync(anonymous, restaurant, Day, "19:15", 2)).StatusCode);
        Assert.False(await IsAvailableOnlineAsync(anonymous, restaurant, Day, "19:15", 1));
    }

    [Fact]
    public async Task The_calendar_day_turns_full_when_no_slot_is_left()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        var otherDay = OpenDayFrom(Day.AddDays(1));
        Assert.Equal("available", await CalendarStatusAsync(anonymous, restaurant, Day));

        // Every slot of the day takes at most one guest, so no time is left for a party of 2.
        Assert.Equal(HttpStatusCode.OK, (await SetPacingAsync(admin, Rule("00:00", "24:00", 1, Day.DayOfWeek))).StatusCode);

        Assert.Equal("full", await CalendarStatusAsync(anonymous, restaurant, Day));
        Assert.Equal("available", await CalendarStatusAsync(anonymous, restaurant, otherDay));
    }

    [Fact]
    public async Task Staff_can_still_book_above_the_limit_and_get_the_pacing_figures()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        Assert.Equal(HttpStatusCode.OK, (await SetPacingAsync(admin, Rule("17:00", "22:00", 4, Day.DayOfWeek))).StatusCode);
        await AddReservationAsync(restaurant, "2", "19:00", 4);

        var full = await StaffTimeAsync(frontDesk, Day, "19:00", 2);
        Assert.Equal(new SlotPacing(4, 4), full.Pacing);
        Assert.NotEmpty(full.Tables);
        Assert.Equal(new SlotPacing(4, 0), (await StaffTimeAsync(frontDesk, Day, "19:15", 2)).Pacing);
        // Lunch has no rule.
        Assert.Null((await StaffTimeAsync(frontDesk, Day, "12:00", 2)).Pacing);

        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(frontDesk, Day, "19:00", 2)).StatusCode);
        Assert.Equal(new SlotPacing(4, 6), (await StaffTimeAsync(frontDesk, Day, "19:00", 2)).Pacing);
    }

    [Fact]
    public async Task Overlapping_or_invalid_rules_are_refused_and_valid_ones_are_saved()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var friday = Rule("18:00", "20:00", 20, DayOfWeek.Friday, DayOfWeek.Saturday);

        Assert.Equal("overlapping_pacing_rules", await ErrorOf(
            await SetPacingAsync(admin, friday, Rule("19:30", "21:00", 10, DayOfWeek.Saturday)), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_pacing_rule", await ErrorOf(await SetPacingAsync(admin, Rule("18:00", "20:00", 20)), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_pacing_rule", await ErrorOf(
            await SetPacingAsync(admin, Rule("18:00", "20:00", 20, DayOfWeek.Friday, DayOfWeek.Friday)), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_pacing_rule", await ErrorOf(await SetPacingAsync(admin, Rule("20:00", "18:00", 20, DayOfWeek.Friday)), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_pacing_rule", await ErrorOf(await SetPacingAsync(admin, Rule("18:00", "25:00", 20, DayOfWeek.Friday)), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_pacing_rule", await ErrorOf(await SetPacingAsync(admin, Rule("18:00", "20:00", 0, DayOfWeek.Friday)), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_pacing_rule", await ErrorOf(await SetPacingAsync(admin, Rule("18:00", "20:00", 501, DayOfWeek.Friday)), HttpStatusCode.BadRequest));

        // Rules that touch, or lie on other days, do not overlap; the end may be 24:00.
        var saved = await SetPacingAsync(admin, friday, Rule("20:00", "24:00", 500, DayOfWeek.Saturday), Rule("19:00", "21:00", 1, DayOfWeek.Sunday));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var rules = (await admin.GetFromJsonAsync<ReservationSettingsDto>(SettingsPath, Token))!.PacingRules!;
        Assert.Equal(
            [("0", "19:00", "21:00", 1), ("5,6", "18:00", "20:00", 20), ("6", "20:00", "24:00", 500)],
            rules.Select(r => (string.Join(",", r.Days!.Select(d => (int)d)), r.From, r.To, r.MaxCovers)));
    }

    [Fact]
    public async Task Without_a_rule_there_is_no_limit()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        await AddReservationAsync(restaurant, "3", "19:00", 6);
        await AddReservationAsync(restaurant, "6", "19:00", 6);

        Assert.Empty((await admin.GetFromJsonAsync<ReservationSettingsDto>(SettingsPath, Token))!.PacingRules!);
        Assert.True(await IsAvailableOnlineAsync(anonymous, restaurant, Day, "19:00", 4));
        Assert.Null((await StaffTimeAsync(admin, Day, "19:00", 4)).Pacing);
        Assert.Equal(HttpStatusCode.Created, (await BookOnlineAsync(anonymous, restaurant, Day, "19:00", 4)).StatusCode);
    }

    [Fact]
    public async Task Cancelled_reservations_do_not_count()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.OK, (await SetPacingAsync(admin, Rule("17:00", "22:00", 4, Day.DayOfWeek))).StatusCode);
        await AddReservationAsync(restaurant, "3", "19:00", 6, status: ReservationStatus.Cancelled);
        await AddReservationAsync(restaurant, "6", "19:00", 6, status: ReservationStatus.Declined);

        Assert.Equal(new SlotPacing(4, 0), (await StaffTimeAsync(admin, Day, "19:00", 2)).Pacing);
        Assert.True(await IsAvailableOnlineAsync(anonymous, restaurant, Day, "19:00", 4));
        Assert.Equal(HttpStatusCode.Created, (await BookOnlineAsync(anonymous, restaurant, Day, "19:00", 4)).StatusCode);
    }
}
