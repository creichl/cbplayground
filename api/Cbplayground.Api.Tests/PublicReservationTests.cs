using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The guest booking under /api/public/restaurants/{slug}. Every test creates a restaurant of its own.</summary>
public class PublicReservationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly TestArea[] OneRoom = [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6))];

    private static string PathOf(TestRestaurant restaurant, string rest = "") => $"/api/public/restaurants/{restaurant.Slug}{rest}";

    private static Task<HttpResponseMessage> BookAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests,
        Guid? tableId = null, string? phone = "+43 660 1234567", string? email = null, string name = "Eva Gast") =>
        client.PostAsJsonAsync(PathOf(restaurant, "/reservations"),
            new { date = date.ToString("yyyy-MM-dd"), time, guests, tableId, name, phone, email, notes = "Fensterplatz", language = "de" }, Token);

    private static async Task<BookingResponse> BookedAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests, Guid? tableId = null)
    {
        var response = await BookAsync(client, restaurant, date, time, guests, tableId);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookingResponse>(Token))!;
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private static async Task<AvailabilityResponse> AvailabilityAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, int guests) =>
        (await client.GetFromJsonAsync<AvailabilityResponse>(PathOf(restaurant, $"/availability?date={date:yyyy-MM-dd}&guests={guests}"), Token))!;

    private static bool IsAvailable(AvailabilityResponse availability, string time) =>
        availability.Periods.SelectMany(p => p.Times).Single(t => t.Time == time).Available;

    [Fact]
    public async Task Availability_lists_quarter_hours_of_each_opening_window_that_end_by_closing_time()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        var availability = await AvailabilityAsync(anonymous, restaurant, date, 2);

        Assert.Equal(120, availability.DurationMinutes);
        Assert.Equal(2, availability.Periods.Count);
        Assert.Equal(("11:30", "14:30"), (availability.Periods[0].Start, availability.Periods[0].End));
        // 11:30 to 14:30 minus 120 minutes: 11:30, 11:45, 12:00, 12:15, 12:30.
        Assert.Equal(["11:30", "11:45", "12:00", "12:15", "12:30"], availability.Periods[0].Times.Select(t => t.Time));
        Assert.Equal("17:00", availability.Periods[1].Times[0].Time);
        Assert.Equal("20:00", availability.Periods[1].Times[^1].Time);
        Assert.All(availability.Periods.SelectMany(p => p.Times), t => Assert.True(t.Available));
    }

    [Fact]
    public async Task Closing_days_and_public_holidays_have_no_times()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        var monday = TestRestaurant.Today.AddDays(1);
        while (monday.DayOfWeek != DayOfWeek.Monday)
        {
            monday = monday.AddDays(1);
        }
        // Christmas Day is a public holiday in Austria; Monday is the closing day of the test restaurants.
        var christmas = new DateOnly(TestRestaurant.Today.Year, 12, 25);
        if (christmas <= TestRestaurant.Today)
        {
            christmas = christmas.AddYears(1);
        }

        Assert.Empty((await AvailabilityAsync(anonymous, restaurant, monday, 2)).Periods);
        Assert.Empty((await AvailabilityAsync(anonymous, restaurant, christmas, 2)).Periods);
        Assert.Equal("outside_opening_hours", await ErrorOf(await BookAsync(anonymous, restaurant, monday, "18:00", 2), HttpStatusCode.BadRequest));
    }

    [Theory]
    [InlineData("GET", "")]
    [InlineData("GET", "/calendar?month=2026-12&guests=2")]
    [InlineData("GET", "/availability?date=2026-12-01&guests=2")]
    [InlineData("GET", "/tables?date=2026-12-01&time=18:00&guests=2")]
    [InlineData("POST", "/reservations")]
    public async Task An_unknown_slug_is_404(string method, string rest)
    {
        using var anonymous = factory.CreateHttpsClient();
        var request = new HttpRequestMessage(new HttpMethod(method), $"/api/public/restaurants/no-such-restaurant{rest}");
        if (method == "POST")
        {
            request.Content = JsonContent.Create(new { date = "2026-12-01", time = "18:00", guests = 2, name = "X", phone = "+43 660 1234567", language = "de" });
        }

        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.SendAsync(request, Token)).StatusCode);
    }

    [Fact]
    public async Task The_restaurant_tells_the_guest_page_how_to_book()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 4)), new TestArea("Saal", false, 100, ("2", 12))],
            confirmationMode: ConfirmationMode.Request, tableSelectionMode: TableSelectionMode.GuestChooses);
        using var anonymous = factory.CreateHttpsClient();

        var info = await anonymous.GetFromJsonAsync<RestaurantResponse>(PathOf(restaurant), Token);

        Assert.NotNull(info);
        Assert.Equal($"Restaurant {restaurant.Slug}", info.Name);
        Assert.Equal("Europe/Vienna", info.TimeZoneId);
        Assert.Equal(ConfirmationMode.Request, info.ConfirmationMode);
        Assert.Equal(TableSelectionMode.GuestChooses, info.TableSelectionMode);
        // The 12-seat table is in an area closed for online booking.
        Assert.Equal(4, info.MaxOnlinePartySize);
        Assert.Equal(12, info.OpeningHours.Count);
        Assert.Contains(new OpeningHoursEndpoints.PeriodDto(DayOfWeek.Sunday, "17:00", "22:00"), info.OpeningHours);
        Assert.True(info.Bookable);
    }

    [Fact]
    public async Task A_restaurant_without_location_or_online_tables_is_not_bookable()
    {
        var withoutLocation = await TestRestaurants.CreateAsync(factory, OneRoom, withLocation: false);
        var onlyBlocked = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", false, 100, ("1", 4))]);
        var withoutHours = await TestRestaurants.CreateAsync(factory, OneRoom, hours: []);
        using var anonymous = factory.CreateHttpsClient();

        foreach (var restaurant in new[] { withoutLocation, onlyBlocked, withoutHours })
        {
            var info = await anonymous.GetFromJsonAsync<RestaurantResponse>(PathOf(restaurant), Token);
            Assert.False(info!.Bookable);
        }
        Assert.Equal(0, (await anonymous.GetFromJsonAsync<RestaurantResponse>(PathOf(onlyBlocked), Token))!.MaxOnlinePartySize);
    }

    [Fact]
    public async Task An_instant_booking_is_confirmed_on_the_smallest_table_that_fits()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("10", 6), ("2", 4)), new TestArea("Terrasse", true, 100, ("1", 4))]);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        var first = await BookedAsync(anonymous, restaurant, date, "18:00", 3);
        var second = await BookedAsync(anonymous, restaurant, date, "18:00", 3);
        var third = await BookedAsync(anonymous, restaurant, date, "18:00", 3);

        Assert.Equal(ReservationStatus.Confirmed, first.Status);
        Assert.Matches("^[A-HJKMNP-Z2-9]{6}$", first.ReferenceCode);
        Assert.Equal((date, "18:00", 3, 120), (first.Date, first.Time, first.Guests, first.DurationMinutes));
        // Equal size: the order of the areas first, then the table number.
        Assert.Equal(("Gaststube", "2"), (first.Area, first.TableNumber));
        Assert.Equal(("Terrasse", "1"), (second.Area, second.TableNumber));
        Assert.Equal(("Gaststube", "10"), (third.Area, third.TableNumber));
        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:00", 3), HttpStatusCode.Conflict));
        // The tables are free again when the reservations end at 20:00.
        Assert.False(IsAvailable(await AvailabilityAsync(anonymous, restaurant, date, 3), "19:45"));
        Assert.True(IsAvailable(await AvailabilityAsync(anonymous, restaurant, date, 3), "20:00"));
    }

    [Fact]
    public async Task A_request_is_requested_and_blocks_the_table()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))], confirmationMode: ConfirmationMode.Request);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        var booking = await BookedAsync(anonymous, restaurant, date, "18:00", 2);

        Assert.Equal(ReservationStatus.Requested, booking.Status);
        Assert.Equal("1", booking.TableNumber);
        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(anonymous, restaurant, date, "19:00", 2), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task When_the_guest_chooses_the_table_it_is_required_and_must_be_free_and_large_enough()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 4))],
            tableSelectionMode: TableSelectionMode.GuestChooses);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal("table_required", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:00", 3), HttpStatusCode.BadRequest));
        Assert.Equal("table_unavailable", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:00", 3, restaurant.Tables["1"]), HttpStatusCode.Conflict));
        Assert.Equal("table_unavailable", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:00", 3, Guid.NewGuid()), HttpStatusCode.Conflict));

        // The guest may also pick a larger table than the smallest one that fits.
        var booking = await BookedAsync(anonymous, restaurant, date, "18:00", 3, restaurant.Tables["3"]);
        Assert.Equal("3", booking.TableNumber);
        Assert.Equal("table_unavailable", await ErrorOf(await BookAsync(anonymous, restaurant, date, "19:00", 2, restaurant.Tables["3"]), HttpStatusCode.Conflict));

        var areas = await anonymous.GetFromJsonAsync<List<PublicArea>>(PathOf(restaurant, $"/tables?date={date:yyyy-MM-dd}&time=18:30&guests=3"), Token);
        var tables = Assert.Single(areas!).Tables;
        Assert.Equal([("1", false), ("2", true), ("3", false)], tables.Select(t => (t.Number, t.Available)));
    }

    [Fact]
    public async Task The_table_list_is_only_for_restaurants_where_the_guest_chooses()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();

        var response = await anonymous.GetAsync(PathOf(restaurant, $"/tables?date={TestRestaurants.NextOpenDay(factory):yyyy-MM-dd}&time=18:00&guests=2"), Token);

        Assert.Equal("table_selection_disabled", await ErrorOf(response, HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task The_online_quota_limits_online_bookings_but_not_staff()
    {
        // 4 tables with 2 seats: 50 % of 8 seats leaves 4 seats, i.e. two tables, for online bookings at the same time.
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 50, ("1", 2), ("2", 2), ("3", 2), ("4", 2))]);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        await BookedAsync(anonymous, restaurant, date, "18:00", 2);
        await BookedAsync(anonymous, restaurant, date, "19:00", 2);

        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(anonymous, restaurant, date, "19:30", 2), HttpStatusCode.Conflict));
        Assert.False(IsAvailable(await AvailabilityAsync(anonymous, restaurant, date, 2), "19:30"));
        // From 20:00 the first online reservation has ended.
        Assert.True(IsAvailable(await AvailabilityAsync(anonymous, restaurant, date, 2), "20:00"));

        var staffBooking = await frontDesk.PostAsJsonAsync("/api/staff/reservations", new { date = $"{date:yyyy-MM-dd}", time = "19:30", guests = 2, name = "Telefon Gast" }, Token);
        Assert.Equal(HttpStatusCode.Created, staffBooking.StatusCode);
    }

    [Fact]
    public async Task An_area_blocked_for_online_booking_is_never_booked_online()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 4)), new TestArea("Saal", false, 100, ("2", 4), ("3", 4))]);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var booking = await BookedAsync(anonymous, restaurant, date, "18:00", 2);

        Assert.Equal("Gaststube", booking.Area);
        Assert.Equal("slot_unavailable", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:00", 2), HttpStatusCode.Conflict));
        Assert.Equal("invalid_party_size", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:00", 5), HttpStatusCode.BadRequest));

        var staff = await frontDesk.GetFromJsonAsync<StaffAvailabilityResponse>($"/api/staff/availability?date={date:yyyy-MM-dd}&guests=2", Token);
        var at18 = staff!.Periods.SelectMany(p => p.Times).Single(t => t.Time == "18:00");
        Assert.Equal(["2", "3"], at18.Tables.Select(t => t.Number));
    }

    [Fact]
    public async Task The_duration_follows_the_rules_by_party_size()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom, defaultDurationMinutes: 120, durationRules: [(1, 2, 90), (5, 8, 150)]);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal(90, (await BookedAsync(anonymous, restaurant, date, "18:00", 2)).DurationMinutes);
        Assert.Equal(120, (await BookedAsync(anonymous, restaurant, date, "18:00", 3)).DurationMinutes);
        Assert.Equal(150, (await BookedAsync(anonymous, restaurant, date, "18:00", 6)).DurationMinutes);
        Assert.Equal(90, (await AvailabilityAsync(anonymous, restaurant, date, 1)).DurationMinutes);
    }

    [Theory]
    [InlineData(null, null, "contact_required")]
    [InlineData("  ", "", "contact_required")]
    [InlineData(null, "no-email", "invalid_email")]
    [InlineData(null, "eva@localhost", "invalid_email")]
    [InlineData("12", null, "invalid_phone")]
    [InlineData("call me 0660", null, "invalid_phone")]
    public async Task Online_bookings_need_a_valid_phone_number_or_email_address(string? phone, string? email, string error)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();

        var response = await BookAsync(anonymous, restaurant, TestRestaurants.NextOpenDay(factory), "18:00", 2, phone: phone, email: email);

        Assert.Equal(error, await ErrorOf(response, HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task An_email_address_alone_is_enough()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();

        var response = await BookAsync(anonymous, restaurant, TestRestaurants.NextOpenDay(factory), "18:00", 2, phone: null, email: "eva@example.com");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Bookings_in_the_past_too_far_ahead_or_outside_the_opening_hours_are_refused()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);
        var farAhead = TestRestaurants.NextOpenDay(factory, 91);

        Assert.Equal("in_the_past", await ErrorOf(await BookAsync(anonymous, restaurant, TestRestaurant.Today.AddDays(-1), "18:00", 2), HttpStatusCode.BadRequest));
        Assert.Equal("too_far_ahead", await ErrorOf(await BookAsync(anonymous, restaurant, farAhead, "18:00", 2), HttpStatusCode.BadRequest));
        // 12:45 + 120 minutes ends after 14:30; 15:00 is between the windows; 18:10 is not on the quarter-hour grid.
        Assert.Equal("outside_opening_hours", await ErrorOf(await BookAsync(anonymous, restaurant, date, "12:45", 2), HttpStatusCode.BadRequest));
        Assert.Equal("outside_opening_hours", await ErrorOf(await BookAsync(anonymous, restaurant, date, "15:00", 2), HttpStatusCode.BadRequest));
        Assert.Equal("outside_opening_hours", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:10", 2), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_party_size", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:00", 0), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_party_size", await ErrorOf(await BookAsync(anonymous, restaurant, date, "18:00", 7), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_time", await ErrorOf(await BookAsync(anonymous, restaurant, date, "6 pm", 2), HttpStatusCode.BadRequest));

        // Days more than 90 days ahead have no bookable times.
        Assert.All((await AvailabilityAsync(anonymous, restaurant, farAhead, 2)).Periods.SelectMany(p => p.Times), t => Assert.False(t.Available));
    }

    [Fact]
    public async Task The_calendar_shows_closed_full_and_available_days()
    {
        // Only one start time a day (18:00–20:00 with 120 minutes) and one table.
        var hours = Enum.GetValues<DayOfWeek>().Where(d => d != DayOfWeek.Monday).Select(d => (d, new TimeOnly(18, 0), new TimeOnly(20, 0))).ToArray();
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))], hours: hours);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);
        await BookedAsync(anonymous, restaurant, date, "18:00", 2);

        var days = await anonymous.GetFromJsonAsync<List<CalendarDay>>(PathOf(restaurant, $"/calendar?month={date:yyyy-MM}&guests=2"), Token);

        Assert.Equal(DateTime.DaysInMonth(date.Year, date.Month), days!.Count);
        Assert.Equal("full", days.Single(d => d.Date == date).Status);
        Assert.All(days.Where(d => d.Date.DayOfWeek == DayOfWeek.Monday), d => Assert.Equal("closed", d.Status));
        Assert.All(days.Where(d => d.Date < TestRestaurant.Today), d => Assert.Equal("closed", d.Status));
        var nextOpenDay = TestRestaurants.NextOpenDay(factory, date.DayNumber - TestRestaurant.Today.DayNumber + 1);
        if (nextOpenDay.Month == date.Month)
        {
            Assert.Equal("available", days.Single(d => d.Date == nextOpenDay).Status);
        }
        Assert.Equal("invalid_month", await ErrorOf(await anonymous.GetAsync(PathOf(restaurant, "/calendar?month=2026-13&guests=2"), Token), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task Of_simultaneous_bookings_of_the_last_table_exactly_one_succeeds()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        var date = TestRestaurants.NextOpenDay(factory);
        var clients = Enumerable.Range(0, 6).Select(_ => factory.CreateHttpsClient()).ToList();

        var responses = await Task.WhenAll(clients.Select(client => BookAsync(client, restaurant, date, "18:00", 2)));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        foreach (var response in responses.Where(r => r.StatusCode != HttpStatusCode.Created))
        {
            Assert.Equal("slot_unavailable", await ErrorOf(response, HttpStatusCode.Conflict));
        }
        clients.ForEach(c => c.Dispose());
    }

    [Fact]
    public async Task The_public_endpoints_of_a_restaurant_use_that_restaurant_even_for_a_signed_in_admin_of_another()
    {
        var restaurantA = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube A", true, 100, ("A1", 4))]);
        var restaurantB = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube B", true, 100, ("B1", 4))]);
        using var adminA = await TestRestaurants.SignInAsync(factory, restaurantA.AdminEmail);
        using var adminB = await TestRestaurants.SignInAsync(factory, restaurantB.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var info = await adminA.GetFromJsonAsync<RestaurantResponse>(PathOf(restaurantB), Token);
        var booking = await BookedAsync(adminA, restaurantB, date, "18:00", 2);

        Assert.Equal($"Restaurant {restaurantB.Slug}", info!.Name);
        Assert.Equal(("Stube B", "B1"), (booking.Area, booking.TableNumber));
        var reservationsOfB = await adminB.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token);
        Assert.Equal(booking.ReferenceCode, Assert.Single(reservationsOfB!).ReferenceCode);
        Assert.Empty((await adminA.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", Token))!);
        // A table of another restaurant cannot be booked through this one.
        var guestChoosesA = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube", true, 100, ("C1", 4))], tableSelectionMode: TableSelectionMode.GuestChooses);
        Assert.Equal("table_unavailable", await ErrorOf(await BookAsync(adminA, guestChoosesA, date, "18:00", 2, restaurantB.Tables["B1"]), HttpStatusCode.Conflict));
    }
}

/// <summary>The online booking with the real rate limit of 10 bookings per client in 10 minutes.</summary>
public class PublicBookingRateLimitTests(PublicBookingRateLimitTests.RateLimitedApiFactory factory) : IClassFixture<PublicBookingRateLimitTests.RateLimitedApiFactory>
{
    public class RateLimitedApiFactory : ApiFactory
    {
        protected override int PublicBookingLimit => 10;
    }

    [Fact]
    public async Task The_eleventh_booking_within_10_minutes_is_answered_with_429()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var anonymous = factory.CreateHttpsClient();
        // Invalid bookings count as well, so the test does not need ten free tables.
        var body = new { date = "2000-01-01", time = "18:00", guests = 2, name = "Eva Gast", phone = "+43 660 1234567", language = "de" };

        for (var i = 0; i < 10; i++)
        {
            var response = await anonymous.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/reservations", body, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        var limited = await anonymous.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/reservations", body, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }
}
