using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The booking rules of the reservation settings (lead time, booking horizon, buffer, largest online party) and the
/// special days in the guest booking and the staff availability. The API's clock stands still at 18:10 on a Wednesday
/// (<see cref="FixedClockApiFactory.Today"/>), so the lead time can be tested at a known time.
/// </summary>
public class BookingRulesTests(BookingRulesTests.FixedClockApiFactory factory) : IClassFixture<BookingRulesTests.FixedClockApiFactory>
{
    /// <summary>The API with a clock that stands still at 18:10 local time (Europe/Vienna) on <see cref="Today"/>.</summary>
    public class FixedClockApiFactory : ApiFactory
    {
        private class FixedClock(DateTimeOffset utcNow) : TimeProvider
        {
            public override DateTimeOffset GetUtcNow() => utcNow;
        }

        /// <summary>A Wednesday at least a week from now that is no Austrian public holiday.</summary>
        public static readonly DateOnly Today = NextWednesday();

        public static readonly TimeOnly Now = new(18, 10);

        private static DateOnly NextWednesday()
        {
            var holidays = new HolidayProvider();
            var date = TestRestaurant.Today.AddDays(7);
            while (date.DayOfWeek != DayOfWeek.Wednesday || holidays.GetHolidays(Locations.Austria, null, date, date).Count > 0)
            {
                date = date.AddDays(1);
            }
            return date;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            var vienna = TimeZoneInfo.FindSystemTimeZoneById(Locations.TimeZones[Locations.Austria]);
            var utcNow = TimeZoneInfo.ConvertTimeToUtc(Today.ToDateTime(Now), vienna);
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(new FixedClock(new DateTimeOffset(utcNow, TimeSpan.Zero))));
        }
    }

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static DateOnly Today => FixedClockApiFactory.Today;

    private static readonly TestArea[] OneRoom = [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6))];

    /// <summary>Every day 11:00–24:00, so late start times exist.</summary>
    private static readonly (DayOfWeek, TimeOnly, TimeOnly)[] AllDayHours =
        Enum.GetValues<DayOfWeek>().Select(d => (d, new TimeOnly(11, 0), Data.OpeningPeriod.EndOfDay)).ToArray();

    private static string PathOf(TestRestaurant restaurant, string rest = "") => $"/api/public/restaurants/{restaurant.Slug}{rest}";

    /// <summary>The first day from <paramref name="date"/> on that is no Monday and no Austrian public holiday.</summary>
    private static DateOnly OpenDayFrom(DateOnly date)
    {
        var holidays = new HolidayProvider();
        while (date.DayOfWeek == DayOfWeek.Monday || holidays.GetHolidays(Locations.Austria, null, date, date).Count > 0)
        {
            date = date.AddDays(1);
        }
        return date;
    }

    /// <summary>Changes the restaurant's settings through the admin endpoint, keeping the other values.</summary>
    private static async Task SetRulesAsync(HttpClient admin, Func<ReservationSettingsDto, ReservationSettingsDto> change)
    {
        var settings = await admin.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Token);
        var response = await admin.PutAsJsonAsync("/api/admin/reservation-settings", change(settings!), Token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static Task<HttpResponseMessage> BookOnlineAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests) =>
        client.PostAsJsonAsync(PathOf(restaurant, "/reservations"),
            new { date = date.ToString("yyyy-MM-dd"), time, guests, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);

    private static Task<HttpResponseMessage> BookByStaffAsync(HttpClient client, DateOnly date, string time, int guests) =>
        client.PostAsJsonAsync("/api/staff/reservations", new { date = date.ToString("yyyy-MM-dd"), time, guests, name = "Telefon Gast" }, Token);

    private static async Task<AvailabilityResponse> OnlineAvailabilityAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, int guests) =>
        (await client.GetFromJsonAsync<AvailabilityResponse>(PathOf(restaurant, $"/availability?date={date:yyyy-MM-dd}&guests={guests}"), Token))!;

    private static async Task<StaffAvailabilityResponse> StaffAvailabilityAsync(HttpClient client, DateOnly date, int guests) =>
        (await client.GetFromJsonAsync<StaffAvailabilityResponse>($"/api/staff/availability?date={date:yyyy-MM-dd}&guests={guests}", Token))!;

    private static bool IsAvailable(AvailabilityResponse availability, string time) =>
        availability.Periods.SelectMany(p => p.Times).Single(t => t.Time == time).Available;

    /// <summary>The numbers of the tables free at <paramref name="time"/>.</summary>
    private static List<string> FreeTables(StaffAvailabilityResponse availability, string time) =>
        availability.Periods.SelectMany(p => p.Times).Single(t => t.Time == time).Tables.Select(t => t.Number).ToList();

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private static async Task<string> CalendarStatusAsync(HttpClient client, TestRestaurant restaurant, DateOnly date)
    {
        var days = await client.GetFromJsonAsync<List<CalendarDay>>(PathOf(restaurant, $"/calendar?month={date:yyyy-MM}&guests=2"), Token);
        return days!.Single(d => d.Date == date).Status;
    }

    [Fact]
    public async Task With_60_minutes_lead_time_18_30_cannot_be_booked_online_at_18_10_but_by_staff()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        // The default lead time is 60 minutes: the first online time is 19:15 (19:10 is not on the grid).
        var online = await OnlineAvailabilityAsync(anonymous, restaurant, Today, 2);
        Assert.False(IsAvailable(online, "18:30"));
        Assert.False(IsAvailable(online, "19:00"));
        Assert.True(IsAvailable(online, "19:15"));
        Assert.Equal("too_short_notice", await ErrorOf(await BookOnlineAsync(anonymous, restaurant, Today, "18:30", 2), HttpStatusCode.BadRequest));

        Assert.NotEmpty(FreeTables(await StaffAvailabilityAsync(frontDesk, Today, 2), "18:30"));
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(frontDesk, Today, "18:30", 2)).StatusCode);
        // Staff cannot book in the past either.
        Assert.Equal("in_the_past", await ErrorOf(await BookByStaffAsync(frontDesk, Today, "18:00", 2), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task Without_lead_time_every_time_after_now_can_be_booked_online()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        await SetRulesAsync(admin, s => s with { MinLeadTimeMinutes = 0 });

        var online = await OnlineAvailabilityAsync(anonymous, restaurant, Today, 2);

        Assert.False(IsAvailable(online, "18:00"));
        Assert.True(IsAvailable(online, "18:15"));
        Assert.Equal(HttpStatusCode.Created, (await BookOnlineAsync(anonymous, restaurant, Today, "18:30", 2)).StatusCode);
    }

    [Fact]
    public async Task Online_bookings_end_at_the_booking_horizon_staff_bookings_do_not()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        var lastDay = OpenDayFrom(Today.AddDays(5));
        var beyond = OpenDayFrom(lastDay.AddDays(1));
        await SetRulesAsync(admin, s => s with { BookingHorizonDays = lastDay.DayNumber - Today.DayNumber });

        Assert.True(IsAvailable(await OnlineAvailabilityAsync(anonymous, restaurant, lastDay, 2), "18:00"));
        Assert.Equal("available", await CalendarStatusAsync(anonymous, restaurant, lastDay));
        Assert.Equal(HttpStatusCode.Created, (await BookOnlineAsync(anonymous, restaurant, lastDay, "18:00", 2)).StatusCode);

        Assert.False(IsAvailable(await OnlineAvailabilityAsync(anonymous, restaurant, beyond, 2), "18:00"));
        Assert.Equal("closed", await CalendarStatusAsync(anonymous, restaurant, beyond));
        Assert.Equal("too_far_ahead", await ErrorOf(await BookOnlineAsync(anonymous, restaurant, beyond, "18:00", 2), HttpStatusCode.BadRequest));
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(admin, beyond, "18:00", 2)).StatusCode);
    }

    [Fact]
    public async Task A_buffer_of_15_minutes_keeps_the_table_occupied_after_every_reservation_for_every_channel()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube", true, 100, ("1", 4))], hours: AllDayHours);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        var date = OpenDayFrom(Today.AddDays(1));
        await SetRulesAsync(admin, s => s with { BufferMinutes = 15 });
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", date.ToDateTime(new TimeOnly(19, 0)));

        var staff = await StaffAvailabilityAsync(admin, date, 2);
        Assert.Empty(FreeTables(staff, "21:00"));
        Assert.Equal(["1"], FreeTables(staff, "21:15"));
        // The buffer follows the new reservation as well: 17:00–19:00 plus 15 minutes reaches into the reservation at 19:00.
        Assert.Empty(FreeTables(staff, "17:00"));
        Assert.Equal(["1"], FreeTables(staff, "16:45"));

        var online = await OnlineAvailabilityAsync(anonymous, restaurant, date, 2);
        Assert.False(IsAvailable(online, "21:00"));
        Assert.True(IsAvailable(online, "21:15"));

        Assert.Equal("slot_unavailable", await ErrorOf(await BookByStaffAsync(admin, date, "21:00", 2), HttpStatusCode.Conflict));
        Assert.Equal("slot_unavailable", await ErrorOf(await BookOnlineAsync(anonymous, restaurant, date, "21:00", 2), HttpStatusCode.Conflict));
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(admin, date, "21:15", 2)).StatusCode);
    }

    [Fact]
    public async Task Without_a_buffer_reservations_follow_each_other_directly()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Stube", true, 100, ("1", 4))], hours: AllDayHours);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var date = OpenDayFrom(Today.AddDays(1));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", date.ToDateTime(new TimeOnly(19, 0)));

        Assert.Equal(["1"], FreeTables(await StaffAvailabilityAsync(admin, date, 2), "21:00"));
    }

    [Fact]
    public async Task The_largest_online_party_is_the_setting_at_most_the_largest_table_and_does_not_bind_staff()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        var date = OpenDayFrom(Today.AddDays(1));

        Assert.Equal(6, (await anonymous.GetFromJsonAsync<RestaurantResponse>(PathOf(restaurant), Token))!.MaxOnlinePartySize);

        await SetRulesAsync(admin, s => s with { MaxOnlinePartySize = 4 });
        Assert.Equal(4, (await anonymous.GetFromJsonAsync<RestaurantResponse>(PathOf(restaurant), Token))!.MaxOnlinePartySize);
        Assert.Equal("invalid_party_size", await ErrorOf(await BookOnlineAsync(anonymous, restaurant, date, "18:00", 5), HttpStatusCode.BadRequest));
        Assert.All((await OnlineAvailabilityAsync(anonymous, restaurant, date, 5)).Periods.SelectMany(p => p.Times), t => Assert.False(t.Available));
        Assert.Equal(HttpStatusCode.Created, (await BookOnlineAsync(anonymous, restaurant, date, "18:00", 4)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(admin, date, "18:00", 5)).StatusCode);

        await SetRulesAsync(admin, s => s with { MaxOnlinePartySize = 10 });
        Assert.Equal(6, (await anonymous.GetFromJsonAsync<RestaurantResponse>(PathOf(restaurant), Token))!.MaxOnlinePartySize);
    }

    [Fact]
    public async Task A_closing_period_is_closed_in_the_guest_calendar_and_has_no_times_for_staff()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        var date = OpenDayFrom(Today.AddDays(3));
        Assert.Equal("available", await CalendarStatusAsync(anonymous, restaurant, date));

        var created = await admin.PostAsJsonAsync("/api/admin/special-days",
            new { from = date.AddDays(-1).ToString("yyyy-MM-dd"), to = date.AddDays(1).ToString("yyyy-MM-dd"), kind = "Closed", note = "Betriebsurlaub" }, Token);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        Assert.Equal("closed", await CalendarStatusAsync(anonymous, restaurant, date));
        Assert.Empty((await OnlineAvailabilityAsync(anonymous, restaurant, date, 2)).Periods);
        Assert.Empty((await StaffAvailabilityAsync(admin, date, 2)).Periods);
        Assert.Equal("outside_opening_hours", await ErrorOf(await BookByStaffAsync(admin, date, "18:00", 2), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task Special_hours_on_a_closing_day_of_the_week_show_exactly_these_times_online()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        // Monday is the closing day of the test restaurants.
        var monday = Today.AddDays(5);
        Assert.Equal("closed", await CalendarStatusAsync(anonymous, restaurant, monday));

        var created = await admin.PostAsJsonAsync("/api/admin/special-days",
            new { from = monday.ToString("yyyy-MM-dd"), to = monday.ToString("yyyy-MM-dd"), kind = "SpecialHours", periods = new[] { new { start = "12:00", end = "15:00" } } }, Token);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var online = await OnlineAvailabilityAsync(anonymous, restaurant, monday, 2);
        var period = Assert.Single(online.Periods);
        Assert.Equal(("12:00", "15:00"), (period.Start, period.End));
        // 12:00 to 15:00 minus 120 minutes.
        Assert.Equal(["12:00", "12:15", "12:30", "12:45", "13:00"], period.Times.Select(t => t.Time));
        Assert.All(period.Times, t => Assert.True(t.Available));
        Assert.Equal("available", await CalendarStatusAsync(anonymous, restaurant, monday));
        Assert.Equal(HttpStatusCode.Created, (await BookOnlineAsync(anonymous, restaurant, monday, "12:30", 2)).StatusCode);
    }
}
