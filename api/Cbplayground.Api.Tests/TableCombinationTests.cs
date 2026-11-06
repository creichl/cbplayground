using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.Reservations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;
using static Cbplayground.Api.Endpoints.TableCombinationEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// Table combinations: managing them in the area (/api/admin/areas/{id}/combinations), and how the availability, the online
/// booking and the staff booking give them. Every test creates a restaurant of its own.
/// </summary>
public class TableCombinationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    /// <summary>Tables 4 and 5 for 4 people each, which are combined, and table 6 for 6.</summary>
    private static readonly TestArea[] Gaststube = [new TestArea("Gaststube", true, 100, ("4", 4), ("5", 4), ("6", 6))];

    private static string PublicPath(TestRestaurant restaurant, string rest = "") => $"/api/public/restaurants/{restaurant.Slug}{rest}";

    private static string CombinationsPath(TestRestaurant restaurant, string area = "Gaststube") => $"/api/admin/areas/{restaurant.Areas[area]}/combinations";

    private static Task<HttpResponseMessage> CombineAsync(HttpClient admin, TestRestaurant restaurant, Guid[] tableIds, int? seats = null,
        int? minGuests = null, bool? onlineBookable = null, string area = "Gaststube") =>
        admin.PostAsJsonAsync(CombinationsPath(restaurant, area), new { tableIds, seats, minGuests, onlineBookable }, Token);

    /// <summary>Creates a restaurant with <paramref name="areas"/> (default <see cref="Gaststube"/>) and the combination of tables 4 and 5.</summary>
    private async Task<(TestRestaurant Restaurant, CombinationResponse Combination)> CreateWithCombinationAsync(TestArea[]? areas = null,
        int? seats = null, int? minGuests = null, bool? onlineBookable = null, TableSelectionMode tableSelectionMode = TableSelectionMode.SystemAssigns)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, areas ?? Gaststube, tableSelectionMode: tableSelectionMode);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var response = await CombineAsync(admin, restaurant, [restaurant.Tables["4"], restaurant.Tables["5"]], seats, minGuests, onlineBookable);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (restaurant, (await response.Content.ReadFromJsonAsync<CombinationResponse>(Token))!);
    }

    private static Task<HttpResponseMessage> StaffBookAsync(HttpClient client, DateOnly date, string time, int guests, Guid[]? tableIds = null, Guid? tableId = null) =>
        client.PostAsJsonAsync("/api/staff/reservations",
            new { date = date.ToString("yyyy-MM-dd"), time, guests, tableId, tableIds, name = "Telefon Gast" }, Token);

    private static async Task<ReservationResponse> StaffBookedAsync(HttpClient client, DateOnly date, string time, int guests, Guid[]? tableIds = null)
    {
        var response = await StaffBookAsync(client, date, time, guests, tableIds);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
    }

    private static Task<HttpResponseMessage> OnlineBookAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests, Guid? tableId = null) =>
        client.PostAsJsonAsync(PublicPath(restaurant, "/reservations"),
            new { date = date.ToString("yyyy-MM-dd"), time, guests, tableId, name = "Eva Gast", phone = "+43 660 1234567", language = "de" }, Token);

    private static async Task<BookingResponse> OnlineBookedAsync(HttpClient client, TestRestaurant restaurant, DateOnly date, string time, int guests, Guid? tableId = null)
    {
        var response = await OnlineBookAsync(client, restaurant, date, time, guests, tableId);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookingResponse>(Token))!;
    }

    private static async Task<IReadOnlyList<FreeTable>> StaffFreeAsync(HttpClient client, DateOnly date, string time, int guests)
    {
        var availability = (await client.GetFromJsonAsync<StaffAvailabilityResponse>($"/api/staff/availability?date={date:yyyy-MM-dd}&guests={guests}", Token))!;
        return availability.Periods.SelectMany(p => p.Times).Single(t => t.Time == time).Tables;
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    private static async Task PutOkAsync(HttpClient client, string path, object body) =>
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(path, body, Token)).StatusCode);

    private static async Task<int> MaxOnlinePartySizeAsync(HttpClient client, TestRestaurant restaurant) =>
        (await client.GetFromJsonAsync<RestaurantResponse>(PublicPath(restaurant), Token))!.MaxOnlinePartySize;

    [Fact]
    public async Task Only_Tenant_Admins_manage_combinations()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, Gaststube);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(CombinationsPath(restaurant), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.GetAsync(CombinationsPath(restaurant), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await CombineAsync(frontDesk, restaurant, [restaurant.Tables["4"], restaurant.Tables["5"]])).StatusCode);
    }

    [Fact]
    public async Task A_new_combination_gets_the_sum_of_the_seats_is_online_from_the_largest_table_plus_one_and_can_be_changed_and_deleted()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, Gaststube);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);

        var response = await CombineAsync(admin, restaurant, [restaurant.Tables["5"], restaurant.Tables["4"]]);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<CombinationResponse>(Token))!;
        Assert.Equal(new[] { restaurant.Tables["4"], restaurant.Tables["5"] }, created.TableIds);
        Assert.Equal("4 + 5", created.Label);
        Assert.Equal((8, 5, true), (created.Seats, created.MinGuests, created.OnlineBookable));
        Assert.Equal(restaurant.Areas["Gaststube"], created.AreaId);

        var updated = await admin.PutAsJsonAsync($"{CombinationsPath(restaurant)}/{created.Id}", new { seats = 9, minGuests = 6, onlineBookable = false }, Token);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var list = (await admin.GetFromJsonAsync<List<CombinationResponse>>(CombinationsPath(restaurant), Token))!;
        Assert.Equal(created with { Seats = 9, MinGuests = 6, OnlineBookable = false }, Assert.Single(list) with { TableIds = created.TableIds });

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"{CombinationsPath(restaurant)}/{created.Id}", Token)).StatusCode);
        Assert.Empty((await admin.GetFromJsonAsync<List<CombinationResponse>>(CombinationsPath(restaurant), Token))!);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"{CombinationsPath(restaurant)}/{created.Id}", Token)).StatusCode);
    }

    [Fact]
    public async Task Invalid_combinations_are_refused()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("4", 4), ("5", 4), ("6", 6)), new TestArea("Terrasse", true, 100, ("T1", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var (four, five, six) = (restaurant.Tables["4"], restaurant.Tables["5"], restaurant.Tables["6"]);

        Assert.Equal("combination_tables_invalid", await ErrorOf(await CombineAsync(admin, restaurant, [four]), HttpStatusCode.BadRequest));
        Assert.Equal("combination_tables_invalid", await ErrorOf(await CombineAsync(admin, restaurant, [four, four]), HttpStatusCode.BadRequest));
        Assert.Equal("combination_tables_invalid", await ErrorOf(await CombineAsync(admin, restaurant, [four, restaurant.Tables["T1"]]), HttpStatusCode.BadRequest));
        Assert.Equal("combination_tables_invalid", await ErrorOf(await CombineAsync(admin, restaurant, [four, Guid.NewGuid()]), HttpStatusCode.BadRequest));
        // At least the largest table + 1.
        Assert.Equal("combination_seats_invalid", await ErrorOf(await CombineAsync(admin, restaurant, [four, six], seats: 6), HttpStatusCode.BadRequest));
        Assert.Equal("combination_min_guests_invalid", await ErrorOf(await CombineAsync(admin, restaurant, [four, six], minGuests: 11), HttpStatusCode.BadRequest));
        Assert.Equal("combination_min_guests_invalid", await ErrorOf(await CombineAsync(admin, restaurant, [four, six], minGuests: 0), HttpStatusCode.BadRequest));

        var created = (await (await CombineAsync(admin, restaurant, [four, five], seats: 5)).Content.ReadFromJsonAsync<CombinationResponse>(Token))!;
        Assert.Equal((5, 5), (created.Seats, created.MinGuests));
        Assert.Equal("combination_exists", await ErrorOf(await CombineAsync(admin, restaurant, [five, four]), HttpStatusCode.Conflict));
        Assert.Equal("combination_seats_invalid", await ErrorOf(
            await admin.PutAsJsonAsync($"{CombinationsPath(restaurant)}/{created.Id}", new { seats = 4, minGuests = 4, onlineBookable = true }, Token),
            HttpStatusCode.BadRequest));
        Assert.Equal("combination_min_guests_invalid", await ErrorOf(
            await admin.PutAsJsonAsync($"{CombinationsPath(restaurant)}/{created.Id}", new { seats = 8, minGuests = 9, onlineBookable = true }, Token),
            HttpStatusCode.BadRequest));
        // A combination belongs to its area.
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"{CombinationsPath(restaurant, "Terrasse")}/{created.Id}", Token)).StatusCode);
    }

    [Fact]
    public async Task The_system_assigns_a_single_table_first_and_a_combination_only_when_no_table_fits()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        // 6 people: table 6 fits, so it is assigned, although the combination is free and seats them as well.
        var first = await StaffBookedAsync(frontDesk, date, "18:00", 6);
        Assert.Equal("6", first.TableNumber);
        Assert.Equal([restaurant.Tables["6"]], first.TableIds);

        // Table 6 is taken: the combination.
        var second = await StaffBookedAsync(frontDesk, date, "18:00", 6);
        Assert.Equal("4 + 5", second.TableNumber);
        Assert.Equal(["4", "5"], second.TableNumbers);
        Assert.Equal(combination.TableIds, second.TableIds);
        Assert.Equal(restaurant.Tables["4"], second.TableId);

        Assert.Equal("slot_unavailable", await ErrorOf(await StaffBookAsync(frontDesk, date, "18:00", 6), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task A_booked_combination_blocks_each_of_its_tables_and_a_booking_of_one_of_them_blocks_the_combination()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var combined = await StaffBookedAsync(frontDesk, date, "18:00", 8);
        Assert.Equal(combination.TableIds, combined.TableIds);

        var free = await StaffFreeAsync(frontDesk, date, "18:00", 2);
        Assert.Equal([restaurant.Tables["6"]], free.Select(t => t.Id));
        Assert.Equal("table_unavailable", await ErrorOf(await StaffBookAsync(frontDesk, date, "18:00", 2, [restaurant.Tables["5"]]), HttpStatusCode.Conflict));
        // For as long as it lasts: 18:00 + 120 minutes.
        Assert.Equal("table_unavailable", await ErrorOf(await StaffBookAsync(frontDesk, date, "19:45", 2, tableId: restaurant.Tables["4"]), HttpStatusCode.Conflict));

        // On another day, a single booking of table 5 takes the combination away.
        var otherDay = TestRestaurants.NextOpenDay(factory, 3);
        await StaffBookedAsync(frontDesk, otherDay, "18:00", 2, [restaurant.Tables["5"]]);
        var freeForTwo = await StaffFreeAsync(frontDesk, otherDay, "18:00", 2);
        Assert.DoesNotContain(freeForTwo, t => t.Kind == FreeTable.CombinationKind);
        Assert.Equal("slot_unavailable", await ErrorOf(await StaffBookAsync(frontDesk, otherDay, "18:00", 8), HttpStatusCode.Conflict));
        Assert.Equal("table_unavailable", await ErrorOf(await StaffBookAsync(frontDesk, otherDay, "18:00", 8, [.. combination.TableIds]), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task The_staff_availability_lists_the_free_combinations_after_the_free_tables()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var free = await StaffFreeAsync(frontDesk, date, "18:00", 4);

        Assert.Equal(["4", "5", "6", "4 + 5"], free.Select(t => t.Label));
        Assert.Equal([FreeTable.TableKind, FreeTable.TableKind, FreeTable.TableKind, FreeTable.CombinationKind], free.Select(t => t.Kind));
        Assert.Equal([restaurant.Tables["4"]], free[0].TableIds);
        Assert.Equal(new FreeTable(combination.Id, "4 + 5", 8, restaurant.Areas["Gaststube"], "Gaststube", FreeTable.CombinationKind, combination.TableIds),
            free[3] with { TableIds = combination.TableIds });
        Assert.Equal(combination.TableIds, free[3].TableIds);

        // Only the combination seats 8; staff get it also below its smallest online party.
        Assert.Equal(["4 + 5"], (await StaffFreeAsync(frontDesk, date, "18:00", 8)).Select(t => t.Label));
    }

    [Fact]
    public async Task Staff_choose_a_table_or_a_combination_with_tableIds_and_other_sets_of_tables_are_refused()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var (four, five, six) = (restaurant.Tables["4"], restaurant.Tables["5"], restaurant.Tables["6"]);

        Assert.Equal("invalid_tables", await ErrorOf(await StaffBookAsync(frontDesk, date, "18:00", 3, [four, six]), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_tables", await ErrorOf(await StaffBookAsync(frontDesk, date, "18:00", 3, [four, four]), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_tables", await ErrorOf(await StaffBookAsync(frontDesk, date, "18:00", 3, []), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_tables", await ErrorOf(await StaffBookAsync(frontDesk, date, "18:00", 3, [four, five, six]), HttpStatusCode.BadRequest));

        // Staff may give the combination also to a party a single table would seat.
        var reservation = await StaffBookedAsync(frontDesk, date, "18:00", 3, [five, four]);
        Assert.Equal(combination.TableIds, reservation.TableIds);

        // Changed to a single table and back.
        var request = new { date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 3, name = "Telefon Gast" };
        var single = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{reservation.Id}", new { request.date, request.time, request.guests, request.name, tableIds = new[] { six } }, Token);
        Assert.Equal(HttpStatusCode.OK, single.StatusCode);
        var changed = (await single.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal([six], changed.TableIds);
        Assert.Equal(("6", six), (changed.TableNumber, changed.TableId));
        Assert.Equal(["4", "5", "4 + 5"], (await StaffFreeAsync(frontDesk, date, "18:00", 3)).Select(t => t.Label));

        var back = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{reservation.Id}", new { request.date, request.time, request.guests, request.name, tableIds = combination.TableIds }, Token);
        Assert.Equal(HttpStatusCode.OK, back.StatusCode);
        Assert.Equal(combination.TableIds, (await back.Content.ReadFromJsonAsync<ReservationResponse>(Token))!.TableIds);

        // A change of the notes only keeps the tables.
        var notes = await frontDesk.PutAsJsonAsync($"/api/staff/reservations/{reservation.Id}",
            new { request.date, request.time, request.guests, request.name, tableIds = combination.TableIds.Reverse(), notes = "Geburtstag" }, Token);
        Assert.Equal(HttpStatusCode.OK, notes.StatusCode);
        var kept = (await notes.Content.ReadFromJsonAsync<ReservationResponse>(Token))!;
        Assert.Equal(combination.TableIds, kept.TableIds);
        Assert.Equal((four, "Geburtstag"), (kept.TableId, kept.Notes));
        var listed = (await frontDesk.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={date:yyyy-MM-dd}", Token))!;
        Assert.Equal("4 + 5", Assert.Single(listed).TableNumber);
    }

    [Fact]
    public async Task The_undo_of_a_cancelled_combined_reservation_needs_all_its_tables_free()
    {
        var (restaurant, _) = await CreateWithCombinationAsync();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);
        var combined = await StaffBookedAsync(frontDesk, date, "18:00", 8);
        Assert.Equal(HttpStatusCode.OK, (await frontDesk.PostAsJsonAsync($"/api/staff/reservations/{combined.Id}/status", new { status = "Cancelled" }, Token)).StatusCode);

        await StaffBookedAsync(frontDesk, date, "18:00", 2, [restaurant.Tables["5"]]);

        Assert.Equal("table_unavailable", await ErrorOf(
            await frontDesk.PostAsJsonAsync($"/api/staff/reservations/{combined.Id}/status", new { status = "Confirmed" }, Token), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Online_a_combination_is_assigned_to_a_party_from_its_smallest_online_party_and_only_while_bookable_online()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync([new TestArea("Gaststube", true, 100, ("4", 4), ("5", 4))]);
        using var anonymous = factory.CreateHttpsClient();
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var booking = await OnlineBookedAsync(anonymous, restaurant, date, "12:00", 5);
        Assert.Equal("4 + 5", booking.TableNumber);
        Assert.Equal(combination.TableIds, booking.TableIds);
        Assert.Equal(["4", "5"], booking.TableNumbers);

        // From 7 people only: a party of 6 gets nothing online, but still from the staff.
        await PutOkAsync(admin, $"{CombinationsPath(restaurant)}/{combination.Id}", new { seats = 8, minGuests = 7, onlineBookable = true });
        Assert.Equal("slot_unavailable", await ErrorOf(await OnlineBookAsync(anonymous, restaurant, date, "18:00", 6), HttpStatusCode.Conflict));
        Assert.Equal("4 + 5", (await OnlineBookedAsync(anonymous, restaurant, date, "18:00", 7)).TableNumber);
        Assert.Equal("4 + 5", (await StaffBookedAsync(admin, TestRestaurants.NextOpenDay(factory, 3), "12:00", 6)).TableNumber);

        // Not bookable online: the largest online party is the largest table again.
        await PutOkAsync(admin, $"{CombinationsPath(restaurant)}/{combination.Id}", new { seats = 8, minGuests = 5, onlineBookable = false });
        Assert.Equal(4, await MaxOnlinePartySizeAsync(anonymous, restaurant));
        Assert.Equal("invalid_party_size", await ErrorOf(await OnlineBookAsync(anonymous, restaurant, TestRestaurants.NextOpenDay(factory, 3), "18:00", 6), HttpStatusCode.BadRequest));
    }

    [Fact]
    public async Task Online_a_combination_counts_with_its_seats_for_the_quota_of_its_area()
    {
        // 16 seats at 50 %: 8 seats online at the same time.
        var (restaurant, combination) = await CreateWithCombinationAsync(
            [new TestArea("Gaststube", true, 50, ("4", 4), ("5", 4), ("6", 4), ("7", 4))], seats: 8);
        using var anonymous = factory.CreateHttpsClient();
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal(8, await MaxOnlinePartySizeAsync(anonymous, restaurant));
        Assert.Equal("4 + 5", (await OnlineBookedAsync(anonymous, restaurant, date, "18:00", 6)).TableNumber);
        // Its 8 seats fill the quota: tables 6 and 7 are free, but not online.
        Assert.Equal("slot_unavailable", await ErrorOf(await OnlineBookAsync(anonymous, restaurant, date, "18:00", 2), HttpStatusCode.Conflict));

        // With 10 seats it no longer fits into the quota at all.
        await PutOkAsync(admin, $"{CombinationsPath(restaurant)}/{combination.Id}", new { seats = 10, minGuests = 5, onlineBookable = true });
        Assert.Equal(4, await MaxOnlinePartySizeAsync(anonymous, restaurant));
    }

    [Fact]
    public async Task The_largest_online_party_is_the_larger_of_the_largest_online_table_and_combination_within_the_limit()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync(seats: 9);
        using var anonymous = factory.CreateHttpsClient();
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);

        Assert.Equal(9, await MaxOnlinePartySizeAsync(anonymous, restaurant));

        await PutOkAsync(admin, "/api/admin/reservation-settings", new
        {
            confirmationMode = "Instant",
            tableSelectionMode = "SystemAssigns",
            defaultDurationMinutes = 120,
            durationRules = Array.Empty<object>(),
            maxOnlinePartySize = 7,
        });
        Assert.Equal(7, await MaxOnlinePartySizeAsync(anonymous, restaurant));

        await PutOkAsync(admin, "/api/admin/reservation-settings", new
        {
            confirmationMode = "Instant",
            tableSelectionMode = "SystemAssigns",
            defaultDurationMinutes = 120,
            durationRules = Array.Empty<object>(),
        });
        await PutOkAsync(admin, $"{CombinationsPath(restaurant)}/{combination.Id}", new { seats = 5, minGuests = 5, onlineBookable = true });
        Assert.Equal(6, await MaxOnlinePartySizeAsync(anonymous, restaurant));
    }

    [Fact]
    public async Task Where_the_guest_chooses_the_table_a_party_only_a_combination_seats_is_booked_without_a_table()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync(tableSelectionMode: TableSelectionMode.GuestChooses);
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        var availability = (await anonymous.GetFromJsonAsync<AvailabilityResponse>(PublicPath(restaurant, $"/availability?date={date:yyyy-MM-dd}&guests=8"), Token))!;
        var slot = availability.Periods.SelectMany(p => p.Times).Single(t => t.Time == "18:00");
        Assert.True(slot.Available && slot.Combined);
        var forTwo = (await anonymous.GetFromJsonAsync<AvailabilityResponse>(PublicPath(restaurant, $"/availability?date={date:yyyy-MM-dd}&guests=2"), Token))!;
        Assert.DoesNotContain(forTwo.Periods.SelectMany(p => p.Times), t => t.Combined);
        var tables = (await anonymous.GetFromJsonAsync<List<PublicArea>>(PublicPath(restaurant, $"/tables?date={date:yyyy-MM-dd}&time=18:00&guests=8"), Token))!;
        Assert.DoesNotContain(tables.SelectMany(a => a.Tables), t => t.Available);

        var booking = await OnlineBookedAsync(anonymous, restaurant, date, "18:00", 8);
        Assert.Equal("4 + 5", booking.TableNumber);
        Assert.Equal(combination.TableIds, booking.TableIds);

        // A party a single table seats still chooses its table.
        Assert.Equal("table_required", await ErrorOf(await OnlineBookAsync(anonymous, restaurant, date, "12:00", 2), HttpStatusCode.BadRequest));
        Assert.Equal("table_unavailable", await ErrorOf(await OnlineBookAsync(anonymous, restaurant, date, "18:00", 2, restaurant.Tables["4"]), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task The_guest_sees_the_combined_tables_of_the_reservation()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync();
        using var anonymous = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);
        var booking = await OnlineBookedAsync(anonymous, restaurant, date, "18:00", 8);

        var reservation = (await anonymous.GetFromJsonAsync<GuestReservationResponse>(
            PublicPath(restaurant, $"/reservations/{booking.ReferenceCode}?token={Uri.EscapeDataString(booking.ManageToken)}"), Token))!;

        Assert.Equal(("4 + 5", "Gaststube"), (reservation.TableNumber, reservation.Area));
        Assert.Equal(["4", "5"], reservation.TableNumbers);
        Assert.Equal(combination.TableIds, reservation.TableIds);
    }

    [Fact]
    public async Task Of_simultaneous_bookings_of_the_same_combination_exactly_one_succeeds()
    {
        var (restaurant, _) = await CreateWithCombinationAsync();
        var date = TestRestaurants.NextOpenDay(factory);
        var clients = Enumerable.Range(0, 6).Select(_ => factory.CreateHttpsClient()).ToList();

        var responses = await Task.WhenAll(clients.Select(client => OnlineBookAsync(client, restaurant, date, "18:00", 8)));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        foreach (var response in responses.Where(r => r.StatusCode != HttpStatusCode.Created))
        {
            Assert.Equal("slot_unavailable", await ErrorOf(response, HttpStatusCode.Conflict));
        }
        clients.ForEach(c => c.Dispose());
    }

    [Fact]
    public async Task Of_two_simultaneous_staff_bookings_of_the_same_combination_one_gets_409()
    {
        var (restaurant, combination) = await CreateWithCombinationAsync();
        var date = TestRestaurants.NextOpenDay(factory);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        var responses = await Task.WhenAll(
            StaffBookAsync(admin, date, "18:00", 8, [.. combination.TableIds]),
            StaffBookAsync(frontDesk, date, "18:00", 8, [.. combination.TableIds]));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Equal("table_unavailable", await ErrorOf(responses.Single(r => r.StatusCode != HttpStatusCode.Created), HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Combinations_of_another_restaurant_can_neither_be_seen_nor_changed_nor_booked()
    {
        var (restaurantA, combinationA) = await CreateWithCombinationAsync();
        var (restaurantB, combinationB) = await CreateWithCombinationAsync();
        using var adminA = await TestRestaurants.SignInAsync(factory, restaurantA.AdminEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal(HttpStatusCode.NotFound, (await adminA.GetAsync(CombinationsPath(restaurantB), Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await CombineAsync(adminA, restaurantB, [restaurantB.Tables["4"], restaurantB.Tables["6"]])).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminA.PutAsJsonAsync($"{CombinationsPath(restaurantB)}/{combinationB.Id}",
            new { seats = 9, minGuests = 5, onlineBookable = false }, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminA.DeleteAsync($"{CombinationsPath(restaurantB)}/{combinationB.Id}", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminA.DeleteAsync($"{CombinationsPath(restaurantA)}/{combinationB.Id}", Token)).StatusCode);
        // B's tables in A's area.
        Assert.Equal("combination_tables_invalid", await ErrorOf(
            await CombineAsync(adminA, restaurantA, [restaurantA.Tables["4"], restaurantB.Tables["5"]]), HttpStatusCode.BadRequest));
        Assert.Equal("invalid_tables", await ErrorOf(await StaffBookAsync(adminA, date, "18:00", 8, [.. combinationB.TableIds]), HttpStatusCode.BadRequest));

        // A's combination is A's alone.
        Assert.Equal("4 + 5", (await StaffBookedAsync(adminA, date, "18:00", 8)).TableNumber);
        using var adminB = await TestRestaurants.SignInAsync(factory, restaurantB.AdminEmail);
        var freeInB = await StaffFreeAsync(adminB, date, "18:00", 8);
        Assert.Equal([combinationB.Id], freeInB.Select(t => t.Id));
        Assert.Equal(combinationA.Seats, (await adminA.GetFromJsonAsync<List<CombinationResponse>>(CombinationsPath(restaurantA), Token))!.Single().Seats);
    }

    [Fact]
    public async Task Deleting_a_table_deletes_its_combinations_and_deleting_the_area_all_of_them()
    {
        var (restaurant, _) = await CreateWithCombinationAsync();
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        await CombineAsync(admin, restaurant, [restaurant.Tables["4"], restaurant.Tables["6"]]);
        await CombineAsync(admin, restaurant, [restaurant.Tables["5"], restaurant.Tables["6"]]);
        // A past combined reservation goes with the table, as past single ones do.
        var past = await TestRestaurants.AddReservationAsync(factory, restaurant, "4", TestRestaurant.Today.AddDays(-3).ToDateTime(new TimeOnly(18, 0)));
        await AddTableAsync(restaurant, past, "5");

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/tables/{restaurant.Tables["5"]}", Token)).StatusCode);

        var left = (await admin.GetFromJsonAsync<List<CombinationResponse>>(CombinationsPath(restaurant), Token))!;
        Assert.Equal(["4 + 6"], left.Select(c => c.Label));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/areas/{restaurant.Areas["Gaststube"]}", Token)).StatusCode);
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.TableCombinations.ToListAsync(Token));
        Assert.Empty(await db.TableCombinationTables.ToListAsync(Token));
    }

    [Fact]
    public async Task A_table_of_a_combined_reservation_that_has_not_ended_cannot_be_deleted()
    {
        var (restaurant, _) = await CreateWithCombinationAsync();
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        await StaffBookedAsync(admin, TestRestaurants.NextOpenDay(factory), "18:00", 8);

        Assert.Equal("table_has_reservations", await ErrorOf(await admin.DeleteAsync($"/api/admin/tables/{restaurant.Tables["5"]}", Token), HttpStatusCode.Conflict));
        Assert.Single((await admin.GetFromJsonAsync<List<CombinationResponse>>(CombinationsPath(restaurant), Token))!);
    }

    /// <summary>Adds a table to a reservation added directly, as a combined one.</summary>
    private async Task AddTableAsync(TestRestaurant restaurant, Guid reservationId, string tableNumber)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.ReservationTables.Add(new ReservationTable { ReservationId = reservationId, TableId = restaurant.Tables[tableNumber] });
        await db.SaveChangesAsync(Token);
    }
}

/// <summary>The migration of the reservations' tables on a database from before the combinations.</summary>
public sealed class ReservationTablesMigrationTests : IDisposable
{
    private class NoTenant : ITenantContext
    {
        public Guid? TenantId => null;
    }

    private readonly SqliteConnection connection = new("Data Source=:memory:");

    public void Dispose() => connection.Dispose();

    [Fact]
    public void Every_existing_reservation_gets_its_table_as_its_only_table()
    {
        connection.Open();
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options, new NoTenant());
        var migrator = db.GetService<IMigrator>();
        migrator.Migrate("20261105190707_AddTableMinGuests");
        Execute("""
            INSERT INTO "Tenants" ("Id", "Name", "Slug", "CreatedAt", "IsActive") VALUES ('7C5A1D0E-0000-0000-0000-000000000001', 'Alt', 'alt', '2026-10-01 00:00:00', 1);
            INSERT INTO "Areas" ("Id", "TenantId", "Name", "SortOrder", "OnlineBookingEnabled", "OnlineCapacityPercent", "TableScale", "RoomStyle")
            VALUES ('7C5A1D0E-0000-0000-0000-000000000002', '7C5A1D0E-0000-0000-0000-000000000001', 'Gaststube', 0, 1, 100, 100, 'Indoor');
            INSERT INTO "Tables" ("Id", "TenantId", "AreaId", "Number", "Seats", "MinGuests", "PosX", "PosY", "Shape", "Rotation")
            VALUES ('7C5A1D0E-0000-0000-0000-000000000003', '7C5A1D0E-0000-0000-0000-000000000001', '7C5A1D0E-0000-0000-0000-000000000002', '1', 4, 1, 0.5, 0.5, 'Square', 0),
                   ('7C5A1D0E-0000-0000-0000-000000000004', '7C5A1D0E-0000-0000-0000-000000000001', '7C5A1D0E-0000-0000-0000-000000000002', '2', 4, 1, 0.5, 0.5, 'Square', 0);
            INSERT INTO "Reservations" ("Id", "TenantId", "TableId", "StartLocal", "EndLocal", "DurationMinutes", "PartySize", "GuestName", "Status", "Source",
                "ReferenceCode", "Language", "CancelledByGuest", "CreatedAtUtc", "UpdatedAtUtc")
            VALUES ('7C5A1D0E-0000-0000-0000-000000000005', '7C5A1D0E-0000-0000-0000-000000000001', '7C5A1D0E-0000-0000-0000-000000000003',
                    '2026-12-01 18:00:00', '2026-12-01 20:00:00', 120, 2, 'Alt Gast', 'Confirmed', 'Staff', 'ALT001', 'de', 0, '2026-10-01 00:00:00', '2026-10-01 00:00:00'),
                   ('7C5A1D0E-0000-0000-0000-000000000006', '7C5A1D0E-0000-0000-0000-000000000001', '7C5A1D0E-0000-0000-0000-000000000004',
                    '2026-12-01 18:00:00', '2026-12-01 20:00:00', 120, 4, 'Alt Gast', 'Cancelled', 'Online', 'ALT002', 'de', 0, '2026-10-01 00:00:00', '2026-10-01 00:00:00');
            """);

        migrator.Migrate();

        Assert.Equal(2L, Execute("""SELECT COUNT(*) FROM "ReservationTables";"""));
        Assert.Equal(2L, Execute("""
            SELECT COUNT(*) FROM "ReservationTables" rt JOIN "Reservations" r ON r."Id" = rt."ReservationId"
            WHERE rt."TableId" = r."TableId" AND rt."TenantId" = r."TenantId";
            """));
        Assert.Equal(0L, Execute("""SELECT COUNT(*) FROM "TableCombinations";"""));
    }

    private object? Execute(string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar();
    }
}
