using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;
using static Cbplayground.Api.Endpoints.TableCombinationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// What the service screen needs to move a reservation by drag and drop or to seat it at another table: the free tables of a
/// reservation (GET /api/staff/reservations/{id}/free-tables) and the availability without the moved reservation
/// (GET /api/staff/availability?reservationId=…). Every test creates a restaurant of its own.
/// </summary>
public class ReservationMoveTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    /// <summary>Tables 4 and 5 for 4 people each, which are combined, and table 6 for 6.</summary>
    private static readonly TestArea[] Gaststube = [new TestArea("Gaststube", true, 100, ("4", 4), ("5", 4), ("6", 6))];

    private async Task<(TestRestaurant Restaurant, HttpClient FrontDesk)> CreateAsync()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, Gaststube);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var combined = await admin.PostAsJsonAsync($"/api/admin/areas/{restaurant.Areas["Gaststube"]}/combinations",
            new { tableIds = new[] { restaurant.Tables["4"], restaurant.Tables["5"] } }, Token);
        Assert.Equal(HttpStatusCode.Created, combined.StatusCode);
        Assert.NotNull(await combined.Content.ReadFromJsonAsync<CombinationResponse>(Token));
        return (restaurant, await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail));
    }

    private static async Task<ReservationResponse> BookAsync(HttpClient client, DateOnly date, string time, int guests, Guid[] tableIds)
    {
        var response = await client.PostAsJsonAsync("/api/staff/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time, guests, tableIds, name = "Telefon Gast" }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static async Task<List<FreeTable>> FreeTablesAsync(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<List<FreeTable>>($"/api/staff/reservations/{id}/free-tables", Token))!;

    [Fact]
    public async Task The_free_tables_of_a_reservation_are_those_free_for_its_time_and_party_apart_from_itself()
    {
        var (restaurant, frontDesk) = await CreateAsync();
        var date = TestRestaurants.NextOpenDay(factory);
        var reservation = await BookAsync(frontDesk, date, "18:00", 4, [restaurant.Tables["4"]]);
        // Table 6 is taken for part of the time.
        await BookAsync(frontDesk, date, "19:00", 2, [restaurant.Tables["6"]]);

        var free = await FreeTablesAsync(frontDesk, reservation.Id);

        // Its own table counts as free, and so does the combination with it.
        Assert.Equal(["4", "5", "4 + 5"], free.Select(t => t.Label));
        Assert.Equal([FreeTable.TableKind, FreeTable.TableKind, FreeTable.CombinationKind], free.Select(t => t.Kind));

        // A change to one of them is accepted.
        var moved = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{reservation.Id}",
            new { date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 4, durationMinutes = 120, name = "Telefon Gast", tableIds = new[] { restaurant.Tables["5"] } }, Token);
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
    }

    [Fact]
    public async Task The_free_tables_of_a_reservation_that_has_started_are_those_of_its_booked_time()
    {
        var (restaurant, frontDesk) = await CreateAsync();
        var start = TestRestaurant.StartedToday;
        var id = await TestRestaurants.AddReservationAsync(factory, restaurant, "4", start, partySize: 4);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "5", start.AddMinutes(60));

        // Not "in the past" and not outside the opening hours: the start does not change.
        Assert.Equal(["4", "6"], (await FreeTablesAsync(frontDesk, id)).Select(t => t.Label));
    }

    [Fact]
    public async Task The_free_tables_of_an_unknown_reservation_are_404_and_front_desk_users_may_read_them()
    {
        var (_, frontDesk) = await CreateAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await frontDesk.GetAsync($"/api/staff/reservations/{Guid.NewGuid()}/free-tables", Token)).StatusCode);

        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/staff/reservations/{Guid.NewGuid()}/free-tables", Token)).StatusCode);
    }

    [Fact]
    public async Task The_availability_with_a_reservation_leaves_it_out()
    {
        var (restaurant, frontDesk) = await CreateAsync();
        var date = TestRestaurants.NextOpenDay(factory);
        var reservation = await BookAsync(frontDesk, date, "18:00", 4, [restaurant.Tables["4"], restaurant.Tables["5"]]);

        async Task<IEnumerable<string>> FreeAt(string time, string query = "")
        {
            var availability = (await frontDesk.GetFromJsonAsync<StaffAvailabilityResponse>(
                $"/api/staff/availability?date={date:yyyy-MM-dd}&guests=4&durationMinutes=120{query}", Token))!;
            return availability.Periods.SelectMany(p => p.Times).Single(t => t.Time == time).Tables.Select(t => t.Label);
        }

        Assert.Equal(["6"], await FreeAt("18:30"));
        // Moved by half an hour, it does not collide with itself.
        Assert.Equal(["4", "5", "6", "4 + 5"], await FreeAt("18:30", $"&reservationId={reservation.Id}"));
    }
}
