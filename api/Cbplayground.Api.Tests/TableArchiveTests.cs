using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.OpeningHours;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.AreaEndpoints;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;
using static Cbplayground.Api.Endpoints.TableEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// Deleting a table or an area with reservations archives it instead, so the reservations keep their table, their area and the
/// guest's link. Every test creates a restaurant of its own.
/// </summary>
public class TableArchiveTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static readonly (DayOfWeek Day, TimeOnly Start, TimeOnly End)[] AllDay =
        Enum.GetValues<DayOfWeek>().Select(d => (d, new TimeOnly(0, 0), OpeningPeriod.EndOfDay)).ToArray();

    private static DateTime LastWeek => TestRestaurant.Today.AddDays(-7).ToDateTime(new TimeOnly(18, 0));

    private static Task<HttpResponseMessage> DeleteTableAsync(HttpClient client, TestRestaurant restaurant, string number) =>
        client.DeleteAsync($"/api/admin/tables/{restaurant.Tables[number]}", Token);

    private static Task<HttpResponseMessage> DeleteAreaAsync(HttpClient client, TestRestaurant restaurant, string name) =>
        client.DeleteAsync($"/api/admin/areas/{restaurant.Areas[name]}", Token);

    private static async Task<List<ReservationResponse>> ReservationsOnAsync(HttpClient client, DateTime day) =>
        (await client.GetFromJsonAsync<List<ReservationResponse>>($"/api/staff/reservations?from={day:yyyy-MM-dd}&to={day:yyyy-MM-dd}", Token))!;

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;
    }

    /// <summary>The stored table, archived or not; null when it was deleted.</summary>
    private async Task<Table?> StoredTableAsync(TestRestaurant restaurant, string number)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Tables.SingleOrDefaultAsync(t => t.Id == restaurant.Tables[number], Token);
    }

    /// <summary>The stored area, archived or not; null when it was deleted.</summary>
    private async Task<Area?> StoredAreaAsync(TestRestaurant restaurant, string name)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Areas.SingleOrDefaultAsync(a => a.Id == restaurant.Areas[name], Token);
    }

    /// <summary>Adds an online reservation with the guest's link directly, so it can lie in the past.</summary>
    private async Task<(string Code, string Token)> AddOnlineAsync(TestRestaurant restaurant, string tableNumber, DateTime startLocal, ReservationStatus status)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var (token, hash) = ManageToken.Create();
        var reservation = new Reservation
        {
            TableId = restaurant.Tables[tableNumber],
            Tables = [new ReservationTable { TableId = restaurant.Tables[tableNumber] }],
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

    [Fact]
    public async Task A_table_with_only_past_or_cancelled_reservations_is_archived_and_its_reservations_and_guest_links_keep_working()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        var (code, guestToken) = await AddOnlineAsync(restaurant, "1", LastWeek, ReservationStatus.Completed);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", LastWeek.AddHours(-3), status: ReservationStatus.Cancelled);
        var nextWeek = TestRestaurants.NextOpenDay(factory, 7).ToDateTime(new TimeOnly(18, 0));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", nextWeek, status: ReservationStatus.Cancelled);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteTableAsync(admin, restaurant, "1")).StatusCode);

        Assert.NotNull((await StoredTableAsync(restaurant, "1"))!.ArchivedAtUtc);
        Assert.Equal(["2"], (await admin.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Token))!.Select(t => t.Number));
        // Deleting it again: it is not found any more.
        Assert.Equal(HttpStatusCode.NotFound, (await DeleteTableAsync(admin, restaurant, "1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await admin.PutAsJsonAsync($"/api/admin/tables/{restaurant.Tables["1"]}", new { number = "1", seats = 4 }, Token)).StatusCode);

        // The reservations keep their table and area, past and future ones.
        var past = await ReservationsOnAsync(admin, LastWeek);
        Assert.Equal(2, past.Count);
        Assert.All(past, r => Assert.Equal(("1", "Gaststube", true), (r.TableNumber, r.AreaName, r.TableArchived)));
        var future = Assert.Single(await ReservationsOnAsync(admin, nextWeek));
        Assert.Equal(("1", true), (future.TableNumber, future.TableArchived));

        var guestView = await anonymous.GetFromJsonAsync<GuestReservationResponse>(
            $"/api/public/restaurants/{restaurant.Slug}/reservations/{code}?token={Uri.EscapeDataString(guestToken)}", Token);
        Assert.Equal(("1", "Gaststube"), (guestView!.TableNumber, guestView.Area));
    }

    [Fact]
    public async Task A_table_without_reservations_is_deleted()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteTableAsync(admin, restaurant, "1")).StatusCode);

        Assert.Null(await StoredTableAsync(restaurant, "1"));
    }

    [Fact]
    public async Task A_table_with_a_future_confirmed_reservation_is_neither_deleted_nor_archived()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", LastWeek, status: ReservationStatus.Completed);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TestRestaurants.NextOpenDay(factory).ToDateTime(new TimeOnly(18, 0)));

        Assert.Equal("table_has_reservations", await ErrorOf(await DeleteTableAsync(admin, restaurant, "1"), HttpStatusCode.Conflict));
        Assert.Equal("table_has_reservations", await ErrorOf(await DeleteAreaAsync(admin, restaurant, "Gaststube"), HttpStatusCode.Conflict));

        Assert.Null((await StoredTableAsync(restaurant, "1"))!.ArchivedAtUtc);
        Assert.Null((await StoredAreaAsync(restaurant, "Gaststube"))!.ArchivedAtUtc);
        Assert.Equal(["1"], (await admin.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Token))!.Select(t => t.Number));
    }

    [Fact]
    public async Task The_number_of_an_archived_table_can_be_given_to_another_table()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", LastWeek, status: ReservationStatus.Completed);
        Assert.Equal(HttpStatusCode.NoContent, (await DeleteTableAsync(admin, restaurant, "1")).StatusCode);

        var renamed = await admin.PutAsJsonAsync($"/api/admin/tables/{restaurant.Tables["2"]}", new { number = "1", seats = 4 }, Token);
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        var created = await admin.PostAsJsonAsync("/api/admin/tables", new { areaId = restaurant.Areas["Gaststube"], number = "2", seats = 2 }, Token);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        // Among the tables in use the number stays unique.
        var taken = await admin.PostAsJsonAsync("/api/admin/tables", new { areaId = restaurant.Areas["Gaststube"], number = "1", seats = 2 }, Token);
        Assert.Equal("table_number_taken", await ErrorOf(taken, HttpStatusCode.Conflict));

        // The old reservation keeps the archived table, not the new table with its number.
        var reservation = Assert.Single(await ReservationsOnAsync(admin, LastWeek));
        Assert.Equal((restaurant.Tables["1"], "1", true), (reservation.TableId, reservation.TableNumber, reservation.TableArchived));
    }

    [Fact]
    public async Task Archived_tables_appear_neither_in_the_availability_nor_on_the_floor_nor_for_guests_nor_for_walk_ins()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 8))], tableSelectionMode: TableSelectionMode.GuestChooses, hours: AllDay);
        await TestRestaurants.OpenOnHolidayAsync(factory, restaurant, TestRestaurant.Today);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", LastWeek, status: ReservationStatus.Completed);
        var date = TestRestaurants.NextOpenDay(factory);
        var cancelled = await TestRestaurants.AddReservationAsync(factory, restaurant, "2", date.ToDateTime(new TimeOnly(18, 0)), status: ReservationStatus.Cancelled);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteTableAsync(admin, restaurant, "2")).StatusCode);

        var floor = await admin.GetFromJsonAsync<List<FloorArea>>("/api/staff/floor", Token);
        Assert.Equal(["1"], floor!.SelectMany(a => a.Tables).Select(t => t.Number));
        var staffAvailability = await admin.GetFromJsonAsync<StaffAvailabilityResponse>($"/api/staff/availability?date={date:yyyy-MM-dd}&guests=2", Token);
        Assert.All(staffAvailability!.Periods.SelectMany(p => p.Times).SelectMany(t => t.Tables), t => Assert.Equal("1", t.Number));
        // The archived table seated 8, the one left 2: a party of 3 no longer fits anywhere.
        Assert.Equal("invalid_party_size", await ErrorOf(
            await admin.PostAsJsonAsync("/api/staff/reservations", new { date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 3, name = "Telefon Gast" }, Token),
            HttpStatusCode.BadRequest));
        Assert.Equal("table_unavailable", await ErrorOf(
            await admin.PostAsJsonAsync("/api/staff/reservations",
                new { date = date.ToString("yyyy-MM-dd"), time = "18:00", guests = 2, tableId = restaurant.Tables["2"], name = "Telefon Gast" }, Token),
            HttpStatusCode.Conflict));
        // A cancelled reservation on the archived table cannot be brought back onto it.
        Assert.Equal("table_unavailable", await ErrorOf(
            await admin.PostAsJsonAsync($"/api/staff/reservations/{cancelled}/status", new { status = "Confirmed" }, Token), HttpStatusCode.Conflict));

        var walkInTables = await admin.GetFromJsonAsync<WalkInTablesResponse>("/api/staff/walk-in-tables?guests=2", Token);
        Assert.Equal(["1"], walkInTables!.Tables.Select(t => t.Number));
        Assert.Equal("table_unavailable", await ErrorOf(
            await admin.PostAsJsonAsync("/api/staff/walk-ins", new { guests = 2, tableId = restaurant.Tables["2"] }, Token), HttpStatusCode.Conflict));

        var publicTables = await anonymous.GetFromJsonAsync<List<PublicArea>>(
            $"/api/public/restaurants/{restaurant.Slug}/tables?date={date:yyyy-MM-dd}&time=18:00&guests=2", Token);
        Assert.Equal(["1"], publicTables!.SelectMany(a => a.Tables).Select(t => t.Number));
        var publicRestaurant = await anonymous.GetFromJsonAsync<RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Token);
        Assert.Equal(2, publicRestaurant!.MaxOnlinePartySize);
    }

    [Fact]
    public async Task Archived_tables_count_neither_for_the_setup_nor_for_the_superadmin()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var superadmin = await TestRestaurants.SignInAsync(factory, "superadmin@test.local");
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", LastWeek, status: ReservationStatus.Completed);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteTableAsync(admin, restaurant, "1")).StatusCode);
        var tenants = await superadmin.GetFromJsonAsync<List<SuperadminEndpoints.SuperadminTenant>>("/api/superadmin/tenants", Token);
        Assert.Equal(1, tenants!.Single(t => t.Id == restaurant.Id).TableCount);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteTableAsync(admin, restaurant, "2")).StatusCode);
        var setup = await admin.GetFromJsonAsync<ProfileEndpoints.SetupStatusResponse>("/api/admin/setup-status", Token);
        Assert.False(setup!.Tables);
        tenants = await superadmin.GetFromJsonAsync<List<SuperadminEndpoints.SuperadminTenant>>("/api/superadmin/tenants", Token);
        Assert.Equal(0, tenants!.Single(t => t.Id == restaurant.Id).TableCount);
    }

    [Fact]
    public async Task An_area_with_tables_that_have_reservations_is_archived_with_them_and_keeps_its_floor_plan_and_photo()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory,
            [new TestArea("Gaststube", true, 100, ("1", 4)), new TestArea("Terrasse", true, 100, ("2", 4), ("3", 4), ("4", 4))],
            tableSelectionMode: TableSelectionMode.GuestChooses);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        using var anonymous = factory.CreateHttpsClient();
        var terrace = restaurant.Areas["Terrasse"];
        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
        foreach (var upload in new[] { "floorplan", "photo" })
        {
            var body = new ByteArrayContent(png);
            body.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsync($"/api/admin/areas/{terrace}/{upload}", body, Token)).StatusCode);
        }
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", LastWeek, status: ReservationStatus.Completed);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "3", LastWeek.AddHours(-3), status: ReservationStatus.Declined);
        // Table 3 was archived on its own before.
        Assert.Equal(HttpStatusCode.NoContent, (await DeleteTableAsync(admin, restaurant, "3")).StatusCode);
        var archivedBefore = (await StoredTableAsync(restaurant, "3"))!.ArchivedAtUtc;

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteAreaAsync(admin, restaurant, "Terrasse")).StatusCode);

        Assert.NotNull((await StoredAreaAsync(restaurant, "Terrasse"))!.ArchivedAtUtc);
        Assert.NotNull((await StoredTableAsync(restaurant, "2"))!.ArchivedAtUtc);
        Assert.Equal(archivedBefore, (await StoredTableAsync(restaurant, "3"))!.ArchivedAtUtc);
        Assert.Null(await StoredTableAsync(restaurant, "4"));
        Assert.Equal(["Gaststube"], (await admin.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Token))!.Select(a => a.Name));
        Assert.Equal(["1"], (await admin.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Token))!.Select(t => t.Number));
        Assert.Equal(["Gaststube"], (await admin.GetFromJsonAsync<List<FloorArea>>("/api/staff/floor", Token))!.Select(a => a.Name));
        var date = TestRestaurants.NextOpenDay(factory);
        var publicTables = await anonymous.GetFromJsonAsync<List<PublicArea>>(
            $"/api/public/restaurants/{restaurant.Slug}/tables?date={date:yyyy-MM-dd}&time=18:00&guests=2", Token);
        Assert.Equal(["Gaststube"], publicTables!.Select(a => a.Name));
        var publicRestaurant = await anonymous.GetFromJsonAsync<RestaurantResponse>($"/api/public/restaurants/{restaurant.Slug}", Token);
        Assert.Equal(["Gaststube"], publicRestaurant!.Areas.Select(a => a.Name));
        // The archived area is not found by the admin, so it can be neither changed nor reordered nor deleted again.
        Assert.Equal(HttpStatusCode.NotFound, (await DeleteAreaAsync(admin, restaurant, "Terrasse")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await admin.PutAsJsonAsync("/api/admin/areas/order", new { areaIds = new[] { restaurant.Areas["Gaststube"] } }, Token)).StatusCode);

        // Its reservations keep their tables and the area, and its floor plan and photo stay.
        var reservations = await ReservationsOnAsync(admin, LastWeek);
        Assert.Equal([("3", "Terrasse"), ("2", "Terrasse")], reservations.Select(r => (r.TableNumber, r.AreaName)));
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/areas/{terrace}/floorplan", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/areas/{terrace}/photo", Token)).StatusCode);
    }

    [Fact]
    public async Task An_area_whose_tables_have_no_reservations_is_deleted()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4), ("2", 4))]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteAreaAsync(admin, restaurant, "Gaststube")).StatusCode);

        Assert.Null(await StoredAreaAsync(restaurant, "Gaststube"));
        Assert.Null(await StoredTableAsync(restaurant, "1"));
        Assert.Null(await StoredTableAsync(restaurant, "2"));
    }

    [Fact]
    public async Task Archiving_stays_within_the_own_restaurant()
    {
        var restaurantA = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        var restaurantB = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var adminA = await TestRestaurants.SignInAsync(factory, restaurantA.AdminEmail);
        using var adminB = await TestRestaurants.SignInAsync(factory, restaurantB.AdminEmail);
        await TestRestaurants.AddReservationAsync(factory, restaurantA, "1", LastWeek, status: ReservationStatus.Completed);
        await TestRestaurants.AddReservationAsync(factory, restaurantB, "1", LastWeek, status: ReservationStatus.Completed);

        // B can neither delete nor archive A's table or area.
        Assert.Equal(HttpStatusCode.NotFound, (await DeleteTableAsync(adminB, restaurantA, "1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await DeleteAreaAsync(adminB, restaurantA, "Gaststube")).StatusCode);
        Assert.Null((await StoredTableAsync(restaurantA, "1"))!.ArchivedAtUtc);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteAreaAsync(adminA, restaurantA, "Gaststube")).StatusCode);

        // B's table and area stay in use, and B sees only its own reservation.
        Assert.Null((await StoredTableAsync(restaurantB, "1"))!.ArchivedAtUtc);
        Assert.Null((await StoredAreaAsync(restaurantB, "Gaststube"))!.ArchivedAtUtc);
        Assert.Equal(["1"], (await adminB.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Token))!.Select(t => t.Number));
        var ofB = Assert.Single(await ReservationsOnAsync(adminB, LastWeek));
        Assert.Equal((restaurantB.Tables["1"], false), (ofB.TableId, ofB.TableArchived));
        var ofA = Assert.Single(await ReservationsOnAsync(adminA, LastWeek));
        Assert.Equal((restaurantA.Tables["1"], true), (ofA.TableId, ofA.TableArchived));
    }
}
