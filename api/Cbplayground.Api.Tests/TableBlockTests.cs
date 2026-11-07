using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;
using static Cbplayground.Api.Endpoints.TableBlockEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// Blocked tables: the front desk takes a table out of service for a time, so nobody can book it then, online, by phone or as a
/// walk-in. The API's clock stands still at 18:10 on a Wednesday (<see cref="BookingRulesTests.FixedClockApiFactory"/>), so walk-ins
/// can be seated "now".
/// </summary>
public class TableBlockTests(BookingRulesTests.FixedClockApiFactory factory) : IClassFixture<BookingRulesTests.FixedClockApiFactory>
{
    private const string BlocksPath = "/api/staff/table-blocks";

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static DateOnly Today => BookingRulesTests.FixedClockApiFactory.Today;

    /// <summary>The Friday after the fixed today, or the next open day after it that is no Austrian public holiday.</summary>
    private static readonly DateOnly Day = OpenDayFrom(Today.AddDays(2));

    private static readonly TestArea[] Gaststube = [new TestArea("Gaststube", true, 100, ("7", 4), ("8", 4))];

    private static DateOnly OpenDayFrom(DateOnly date)
    {
        var holidays = new HolidayProvider();
        while (date.DayOfWeek == DayOfWeek.Monday || holidays.GetHolidays(Locations.Austria, null, date, date).Count > 0)
        {
            date = date.AddDays(1);
        }
        return date;
    }

    private Task<TestRestaurant> CreateRestaurantAsync() =>
        TestRestaurants.CreateAsync(factory, Gaststube, tableSelectionMode: TableSelectionMode.GuestChooses);

    private static Task<HttpResponseMessage> BlockAsync(HttpClient client, Guid tableId, DateOnly date, string? start, string? end, string? reason = null) =>
        client.PostAsJsonAsync(BlocksPath, new { tableId, date = date.ToString("yyyy-MM-dd"), start, end, reason }, Token);

    private static async Task<TableBlockResponse> BlockedAsync(HttpClient client, Guid tableId, DateOnly date, string start, string end, string? reason = null)
    {
        var response = await BlockAsync(client, tableId, date, start, end, reason);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TableBlockResponse>(Token))!;
    }

    private static async Task<List<TableBlockResponse>> BlocksOfAsync(HttpClient client, DateOnly date) =>
        (await client.GetFromJsonAsync<List<TableBlockResponse>>($"{BlocksPath}?date={date:yyyy-MM-dd}", Token))!;

    private static async Task<List<string>> StaffTablesAsync(HttpClient client, DateOnly date, string time, int guests)
    {
        var availability = await client.GetFromJsonAsync<StaffAvailabilityResponse>($"/api/staff/availability?date={date:yyyy-MM-dd}&guests={guests}", Token);
        return availability!.Periods.SelectMany(p => p.Times).Single(t => t.Time == time).Tables.Select(t => t.Number).ToList();
    }

    /// <summary>The numbers of the tables a guest can choose online at <paramref name="time"/>.</summary>
    private static async Task<List<string>> OnlineTablesAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests)
    {
        var areas = await client.GetFromJsonAsync<List<PublicArea>>(
            $"/api/public/restaurants/{restaurant.Slug}/tables?date={date:yyyy-MM-dd}&time={time}&guests={guests}", Token);
        return areas!.SelectMany(a => a.Tables).Where(t => t.Available).Select(t => t.Number).ToList();
    }

    private static Task<HttpResponseMessage> BookByStaffAsync(HttpClient client, DateOnly date, string time, int guests, params Guid[] tableIds) =>
        client.PostAsJsonAsync("/api/staff/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time, guests, name = "Telefon Gast", tableIds = tableIds.Length == 0 ? null : tableIds }, Token);

    private static Task<HttpResponseMessage> BookOnlineAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests, Guid tableId) =>
        client.PostAsJsonAsync($"/api/public/restaurants/{restaurant.Slug}/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time, guests, tableId, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    [Theory]
    [InlineData("GET", BlocksPath + "?date=2026-12-01")]
    [InlineData("POST", BlocksPath)]
    [InlineData("DELETE", BlocksPath + "/00000000-0000-0000-0000-000000000001")]
    public async Task The_blocks_need_a_sign_in_of_restaurant_staff(string method, string path)
    {
        using var anonymous = factory.CreateHttpsClient();
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await superadmin.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Token)).StatusCode);
    }

    [Fact]
    public async Task The_front_desk_may_block_a_table_and_sees_the_block_of_the_day()
    {
        var restaurant = await CreateRestaurantAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var block = await BlockedAsync(frontDesk, restaurant.Tables["7"], Day, "18:00", "20:00", "  wobbly, being repaired  ");

        Assert.Equal((restaurant.Tables["7"], "7", restaurant.Areas["Gaststube"]), (block.TableId, block.TableNumber, block.AreaId));
        Assert.Equal((Day, "18:00", "20:00"), (block.Date, block.Start, block.End));
        Assert.Equal("wobbly, being repaired", block.Reason);
        Assert.Equal(restaurant.FrontDeskEmail, block.CreatedBy);
        Assert.Equal(block, Assert.Single(await BlocksOfAsync(frontDesk, Day)));
        Assert.Empty(await BlocksOfAsync(frontDesk, Day.AddDays(1)));

        // Until closing at midnight, and without a reason.
        var lateBlock = await BlockedAsync(frontDesk, restaurant.Tables["8"], Day, "22:00", "24:00");
        Assert.Equal(("22:00", "24:00", null), (lateBlock.Start, lateBlock.End, lateBlock.Reason));
        Assert.Equal(["7", "8"], (await BlocksOfAsync(frontDesk, Day)).Select(b => b.TableNumber));
    }

    [Fact]
    public async Task A_blocked_table_is_offered_neither_online_nor_to_staff_nor_to_walk_ins()
    {
        var restaurant = await CreateRestaurantAsync();
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var anonymous = factory.CreateHttpsClient();
        // A buffer after every reservation: the block adds none, so the table is free again right at its end.
        var settings = await admin.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Token);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/admin/reservation-settings", settings! with { BufferMinutes = 15 }, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync($"/api/admin/areas/{restaurant.Areas["Gaststube"]}/combinations",
            new { tableIds = new[] { restaurant.Tables["7"], restaurant.Tables["8"] } }, Token)).StatusCode);

        await BlockedAsync(frontDesk, restaurant.Tables["7"], Day, "18:00", "20:00", "kept for the owner");

        // Online.
        Assert.Equal(["8"], await OnlineTablesAsync(anonymous, restaurant, Day, "19:00", 2));
        Assert.Equal(["8"], await OnlineTablesAsync(anonymous, restaurant, Day, "17:00", 2));
        Assert.Equal(["7", "8"], await OnlineTablesAsync(anonymous, restaurant, Day, "20:00", 2));
        Assert.Equal("table_unavailable", await ErrorOf(await BookOnlineAsync(anonymous, restaurant, Day, "19:00", 2, restaurant.Tables["7"]), HttpStatusCode.Conflict));

        // Staff, by phone; the combination with the table is busy as well.
        Assert.Equal(["8"], await StaffTablesAsync(frontDesk, Day, "19:00", 2));
        Assert.Empty(await StaffTablesAsync(frontDesk, Day, "19:00", 6));
        Assert.Equal(["7 + 8"], await StaffTablesAsync(frontDesk, Day, "20:00", 6));
        Assert.Equal("table_unavailable", await ErrorOf(await BookByStaffAsync(frontDesk, Day, "19:00", 2, restaurant.Tables["7"]), HttpStatusCode.Conflict));
        Assert.Equal("table_unavailable", await ErrorOf(
            await BookByStaffAsync(frontDesk, Day, "19:00", 6, restaurant.Tables["7"], restaurant.Tables["8"]), HttpStatusCode.Conflict));
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(frontDesk, Day, "20:00", 2, restaurant.Tables["7"])).StatusCode);

        // Walk-ins, now (18:10 today).
        await BlockedAsync(frontDesk, restaurant.Tables["7"], Today, "18:00", "19:00");
        var walkInTables = await frontDesk.GetFromJsonAsync<WalkInTablesResponse>("/api/staff/walk-in-tables?guests=2", Token);
        Assert.Equal(["8"], walkInTables!.Tables.Select(t => t.Number));
        Assert.Equal("table_unavailable", await ErrorOf(
            await frontDesk.PostAsJsonAsync("/api/staff/walk-ins", new { guests = 2, tableId = restaurant.Tables["7"] }, Token), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_reservation_that_overlaps_refuses_the_block()
    {
        var restaurant = await CreateRestaurantAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var reservationId = await TestRestaurants.AddReservationAsync(factory, restaurant, "7", Day.ToDateTime(new TimeOnly(19, 0)));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "8", Day.ToDateTime(new TimeOnly(18, 0)), status: ReservationStatus.Cancelled);

        var response = await BlockAsync(frontDesk, restaurant.Tables["7"], Day, "18:00", "19:15");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var conflict = await response.Content.ReadFromJsonAsync<TableHasReservationsResponse>(Token);
        Assert.Equal("table_has_reservations", conflict!.Error);
        Assert.Equal(reservationId, Assert.Single(conflict.Reservations).Id);
        Assert.Empty(await BlocksOfAsync(frontDesk, Day));

        // Right before and right after the reservation (19:00–21:00) there is room; a cancelled reservation does not occupy its table.
        await BlockedAsync(frontDesk, restaurant.Tables["7"], Day, "17:00", "19:00");
        await BlockedAsync(frontDesk, restaurant.Tables["7"], Day, "21:00", "22:00");
        await BlockedAsync(frontDesk, restaurant.Tables["8"], Day, "18:00", "20:00");
    }

    [Fact]
    public async Task A_reservation_on_a_combination_with_the_table_refuses_the_block()
    {
        var restaurant = await CreateRestaurantAsync();
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync($"/api/admin/areas/{restaurant.Areas["Gaststube"]}/combinations",
            new { tableIds = new[] { restaurant.Tables["7"], restaurant.Tables["8"] } }, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(admin, Day, "19:00", 6, restaurant.Tables["7"], restaurant.Tables["8"])).StatusCode);

        Assert.Equal("table_has_reservations", await ErrorOf(await BlockAsync(admin, restaurant.Tables["8"], Day, "20:00", "22:00"), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Deleting_the_block_frees_the_table()
    {
        var restaurant = await CreateRestaurantAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var block = await BlockedAsync(frontDesk, restaurant.Tables["7"], Day, "18:00", "20:00");
        Assert.Equal(["8"], await StaffTablesAsync(frontDesk, Day, "19:00", 2));

        Assert.Equal(HttpStatusCode.NoContent, (await frontDesk.DeleteAsync($"{BlocksPath}/{block.Id}", Token)).StatusCode);

        Assert.Equal(["7", "8"], await StaffTablesAsync(frontDesk, Day, "19:00", 2));
        Assert.Empty(await BlocksOfAsync(frontDesk, Day));
        Assert.Equal(HttpStatusCode.NotFound, (await frontDesk.DeleteAsync($"{BlocksPath}/{block.Id}", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await BookByStaffAsync(frontDesk, Day, "19:00", 2, restaurant.Tables["7"])).StatusCode);
    }

    [Fact]
    public async Task Blocks_stay_within_their_restaurant()
    {
        var restaurant = await CreateRestaurantAsync();
        var other = await CreateRestaurantAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        using var otherFrontDesk = await TestRestaurants.SignInAsync(factory, other.FrontDeskEmail);
        var block = await BlockedAsync(frontDesk, restaurant.Tables["7"], Day, "18:00", "20:00");

        Assert.Empty(await BlocksOfAsync(otherFrontDesk, Day));
        Assert.Equal(["7", "8"], await StaffTablesAsync(otherFrontDesk, Day, "19:00", 2));
        Assert.Equal(HttpStatusCode.NotFound, (await otherFrontDesk.DeleteAsync($"{BlocksPath}/{block.Id}", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await BlockAsync(otherFrontDesk, restaurant.Tables["8"], Day, "18:00", "20:00")).StatusCode);

        Assert.Equal(block, Assert.Single(await BlocksOfAsync(frontDesk, Day)));
        Assert.Equal(["8"], await StaffTablesAsync(frontDesk, Day, "19:00", 2));
    }

    [Fact]
    public async Task Invalid_blocks_are_refused()
    {
        var restaurant = await CreateRestaurantAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var table = restaurant.Tables["7"];

        Assert.Equal("invalid_date", await ErrorOf(
            await frontDesk.PostAsJsonAsync(BlocksPath, new { tableId = table, date = "07.11.2026", start = "18:00", end = "20:00" }, Token), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_date", await ErrorOf(await frontDesk.GetAsync($"{BlocksPath}?date=tomorrow", Token), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_time", await ErrorOf(await BlockAsync(frontDesk, table, Day, "18:10", "20:00"), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_time", await ErrorOf(await BlockAsync(frontDesk, table, Day, "18:00", "25:00"), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_time", await ErrorOf(await BlockAsync(frontDesk, table, Day, "24:00", "24:00"), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_time", await ErrorOf(await BlockAsync(frontDesk, table, Day, null, "20:00"), HttpStatusCode.BadRequest));
        Assert.Equal("start_not_before_end", await ErrorOf(await BlockAsync(frontDesk, table, Day, "20:00", "20:00"), HttpStatusCode.BadRequest));
        Assert.Equal("start_not_before_end", await ErrorOf(await BlockAsync(frontDesk, table, Day, "20:00", "18:00"), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_reason", await ErrorOf(await BlockAsync(frontDesk, table, Day, "18:00", "20:00", new string('x', 101)), HttpStatusCode.BadRequest));
        Assert.Equal(HttpStatusCode.NotFound, (await BlockAsync(frontDesk, Guid.NewGuid(), Day, "18:00", "20:00")).StatusCode);

        Assert.Empty(await BlocksOfAsync(frontDesk, Day));
        Assert.Equal(new string('x', 100), (await BlockedAsync(frontDesk, table, Day, "18:00", "20:00", new string('x', 100))).Reason);
    }
}
