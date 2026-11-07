using System.Net;
using System.Net.Http.Json;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The "remaining" of the public availability: how many more parties of the size could still get a table at a time, at
/// most 3, with the online quota, the tables' smallest party, combinations and pacing as for "available". Every test
/// creates a restaurant of its own.
/// </summary>
public class AvailabilityRemainingTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static string PathOf(TestRestaurant restaurant, string rest = "") => $"/api/public/restaurants/{restaurant.Slug}{rest}";

    private static async Task<AvailabilityTime> TimeAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests)
    {
        var availability = await client.GetFromJsonAsync<AvailabilityResponse>(PathOf(restaurant, $"/availability?date={date:yyyy-MM-dd}&guests={guests}"), Token);
        return availability!.Periods.SelectMany(p => p.Times).Single(t => t.Time == time);
    }

    private static async Task BookByStaffAsync(HttpClient client, DateOnly date, string time, int guests)
    {
        var response = await client.PostAsJsonAsync("/api/staff/reservations", new { date = date.ToString("yyyy-MM-dd"), time, guests, name = "Telefon Gast" }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task BookOnlineAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests)
    {
        var response = await client.PostAsJsonAsync(PathOf(restaurant, "/reservations"),
            new { date = date.ToString("yyyy-MM-dd"), time, guests, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Remaining_counts_the_free_tables_down_and_stops_at_3()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 2), ("3", 2), ("4", 2), ("5", 2))]);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        // Five free tables: capped at 3.
        Assert.Equal(new AvailabilityTime("19:00", true, false, 3), await TimeAsync(anonymous, restaurant, date, "19:00", 2));

        await BookByStaffAsync(frontDesk, date, "19:00", 2);
        await BookByStaffAsync(frontDesk, date, "19:00", 2);
        Assert.Equal(3, (await TimeAsync(anonymous, restaurant, date, "19:00", 2)).Remaining);
        await BookByStaffAsync(frontDesk, date, "19:00", 2);
        Assert.Equal(2, (await TimeAsync(anonymous, restaurant, date, "19:00", 2)).Remaining);
        await BookByStaffAsync(frontDesk, date, "19:00", 2);
        Assert.Equal(1, (await TimeAsync(anonymous, restaurant, date, "19:00", 2)).Remaining);
        await BookByStaffAsync(frontDesk, date, "19:00", 2);
        Assert.Equal(new AvailabilityTime("19:00", false, false, 0), await TimeAsync(anonymous, restaurant, date, "19:00", 2));
        // A reservation from 17:00 ends when they begin.
        Assert.Equal(3, (await TimeAsync(anonymous, restaurant, date, "17:00", 2)).Remaining);
    }

    [Fact]
    public async Task Remaining_respects_the_online_quota()
    {
        // 50 % of 8 seats: two tables of 2 can be booked online at the same time, although four are free.
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 50, ("1", 2), ("2", 2), ("3", 2), ("4", 2))]);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal(2, (await TimeAsync(anonymous, restaurant, date, "19:00", 2)).Remaining);

        await BookOnlineAsync(anonymous, restaurant, date, "19:00", 2);
        Assert.Equal(1, (await TimeAsync(anonymous, restaurant, date, "19:00", 2)).Remaining);

        await BookOnlineAsync(anonymous, restaurant, date, "19:00", 2);
        Assert.Equal(new AvailabilityTime("19:00", false, false, 0), await TimeAsync(anonymous, restaurant, date, "19:00", 2));
    }

    [Fact]
    public async Task Remaining_leaves_out_tables_whose_smallest_party_the_party_does_not_reach()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("2", 2), ("8", 8))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        (await admin.PutAsJsonAsync($"/api/admin/tables/{restaurant.Tables["8"]}", new { number = "8", seats = 8, minGuests = 5 }, Token)).EnsureSuccessStatusCode();
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal(1, (await TimeAsync(anonymous, restaurant, date, "19:00", 2)).Remaining);
        Assert.Equal(1, (await TimeAsync(anonymous, restaurant, date, "19:00", 6)).Remaining);
    }

    [Fact]
    public async Task Remaining_counts_combinations_that_share_a_table_once()
    {
        // Three tables of 4, combined as 4 + 5 and 5 + 6: both combinations need table 5, so only one party of 8 fits.
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("4", 4), ("5", 4), ("6", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var combinations = $"/api/admin/areas/{restaurant.Areas["Gaststube"]}/combinations";
        foreach (var pair in new[] { new[] { "4", "5" }, ["5", "6"] })
        {
            var response = await admin.PostAsJsonAsync(combinations, new { tableIds = pair.Select(n => restaurant.Tables[n]).ToArray() }, Token);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal(new AvailabilityTime("19:00", true, true, 1), await TimeAsync(anonymous, restaurant, date, "19:00", 8));
        // Parties of 4 get the single tables first: three of them.
        Assert.Equal(3, (await TimeAsync(anonymous, restaurant, date, "19:00", 4)).Remaining);
    }

    [Fact]
    public async Task Remaining_stays_within_the_pacing_limit()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 2), ("3", 2), ("4", 2), ("5", 2))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);
        var settings = await admin.GetFromJsonAsync<ReservationSettingsDto>("/api/admin/reservation-settings", Token);
        var rules = new[] { new PacingRuleDto([date.DayOfWeek], "19:00", "20:00", 4) };
        (await admin.PutAsJsonAsync("/api/admin/reservation-settings", settings! with { PacingRules = rules }, Token)).EnsureSuccessStatusCode();

        // Five free tables, but only 4 guests may start at 19:00: two parties of 2.
        Assert.Equal(2, (await TimeAsync(anonymous, restaurant, date, "19:00", 2)).Remaining);
        await BookOnlineAsync(anonymous, restaurant, date, "19:00", 2);
        Assert.Equal(1, (await TimeAsync(anonymous, restaurant, date, "19:00", 2)).Remaining);
        // Outside the rule's range the tables count.
        Assert.Equal(3, (await TimeAsync(anonymous, restaurant, date, "18:45", 2)).Remaining);
    }
}
