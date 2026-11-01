using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using Cbplayground.Api.FloorPlans;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using static Cbplayground.Api.Endpoints.AreaEndpoints;
using static Cbplayground.Api.Endpoints.PublicRestaurantEndpoints;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;
using static Cbplayground.Api.Endpoints.TableEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>The room of an area (style and elements) through the API. Every test creates a restaurant of its own.</summary>
public class RoomTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly TestArea[] OneRoom = [new TestArea("Gaststube", true, 100, ("1", 2), ("2", 4), ("3", 6), ("4", 4), ("5", 2), ("6", 8))];

    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];

    private static object Element(string kind, double posX, double posY, double width, double height, int rotation = 0, string? label = null) =>
        new { kind, posX, posY, width, height, rotation, label };

    /// <summary>A stage across the top, a pillar in the middle and the entrance in the bottom wall.</summary>
    private static readonly object[] StageRoom =
    [
        Element("Stage", 0.5, 0.15, 0.6, 0.3),
        Element("Pillar", 0.5, 0.6, 0.04, 0.06),
        Element("Entrance", 0.5, 0.9775, 0.1, 0.045, label: "  Haupteingang  "),
        Element("Window", 0.2, 0.015, 0.16, 0.03, rotation: 180),
        Element("Label", 0.8, 0.97, 0.24, 0.06, label: "Blick auf den Stephansdom"),
    ];

    private async Task<(TestRestaurant Restaurant, HttpClient Admin, Guid AreaId)> RestaurantAsync(TableSelectionMode tableSelectionMode = TableSelectionMode.SystemAssigns)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom, tableSelectionMode: tableSelectionMode);
        var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        return (restaurant, admin, restaurant.Areas["Gaststube"]);
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Ct))?.Error;
    }

    private static async Task<RoomResponse> PutRoomAsync(HttpClient client, Guid areaId, string roomStyle, object[] elements)
    {
        var response = await client.PutAsJsonAsync($"/api/admin/areas/{areaId}/room", new { roomStyle, elements }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<RoomResponse>(Ct))!;
    }

    private static Task<RoomResponse?> GetRoomAsync(HttpClient client, Guid areaId) =>
        client.GetFromJsonAsync<RoomResponse>($"/api/admin/areas/{areaId}/room", Ct);

    private static List<RoomElement> AsElements(IEnumerable<RoomElementResponse> elements) => elements
        .Select(e => new RoomElement { Kind = e.Kind, PosX = e.PosX, PosY = e.PosY, Width = e.Width, Height = e.Height, Rotation = e.Rotation, Label = e.Label })
        .ToList();

    private static List<Table> AsTables(IEnumerable<TableResponse> tables) => tables
        .Select(t => new Table { Id = t.Id, AreaId = t.AreaId, Number = t.Number, Seats = t.Seats, Shape = t.Shape, Rotation = t.Rotation, PosX = t.PosX, PosY = t.PosY })
        .ToList();

    [Theory]
    [InlineData("GET", "/api/admin/areas/00000000-0000-0000-0000-000000000001/room")]
    [InlineData("PUT", "/api/admin/areas/00000000-0000-0000-0000-000000000001/room")]
    [InlineData("POST", "/api/admin/areas/00000000-0000-0000-0000-000000000001/suggest-room")]
    public async Task The_room_endpoints_are_for_tenant_admins_only(string method, string path)
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, OneRoom);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Ct)).StatusCode);
    }

    [Fact]
    public async Task A_new_area_is_an_indoor_room_without_elements()
    {
        var (_, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;
        var created = await admin.PostAsJsonAsync("/api/admin/areas", new { name = "Terrasse" }, Ct);

        Assert.Equal(RoomStyle.Indoor, (await created.Content.ReadFromJsonAsync<AreaResponse>(Ct))!.RoomStyle);
        var room = (await GetRoomAsync(admin, areaId))!;
        Assert.Equal(RoomStyle.Indoor, room.RoomStyle);
        Assert.Empty(room.Elements);
        Assert.All((await admin.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!, a => Assert.Equal(RoomStyle.Indoor, a.RoomStyle));
    }

    [Fact]
    public async Task The_room_can_be_saved_and_read_again_in_its_order()
    {
        var (_, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;

        var saved = await PutRoomAsync(admin, areaId, "rooftop", StageRoom);

        Assert.Equal(RoomStyle.Rooftop, saved.RoomStyle);
        Assert.Equal(
            [RoomElementKind.Stage, RoomElementKind.Pillar, RoomElementKind.Entrance, RoomElementKind.Window, RoomElementKind.Label],
            saved.Elements.Select(e => e.Kind));
        Assert.Equal((0.5, 0.15, 0.6, 0.3, 0), (saved.Elements[0].PosX, saved.Elements[0].PosY, saved.Elements[0].Width, saved.Elements[0].Height, saved.Elements[0].Rotation));
        Assert.Equal(180, saved.Elements[3].Rotation);
        // Labels are trimmed; an empty label is none.
        Assert.Equal("Haupteingang", saved.Elements[2].Label);
        Assert.Null(saved.Elements[0].Label);
        Assert.Equal("Blick auf den Stephansdom", saved.Elements[4].Label);
        Assert.All(saved.Elements, e => Assert.NotEqual(Guid.Empty, e.Id));
        var read = (await GetRoomAsync(admin, areaId))!;
        Assert.Equal(saved.RoomStyle, read.RoomStyle);
        Assert.Equal(saved.Elements, read.Elements);
        Assert.Equal(RoomStyle.Rooftop, Assert.Single((await admin.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct))!).RoomStyle);
    }

    [Fact]
    public async Task Saving_the_room_replaces_all_elements()
    {
        var (_, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;
        await PutRoomAsync(admin, areaId, "Indoor", StageRoom);

        var saved = await PutRoomAsync(admin, areaId, "Garden", [Element("Plant", 0.025, 0.0375, 0.05, 0.075)]);

        Assert.Equal(RoomStyle.Garden, saved.RoomStyle);
        Assert.Equal(RoomElementKind.Plant, Assert.Single(saved.Elements).Kind);
        Assert.Equal(saved.Elements, (await GetRoomAsync(admin, areaId))!.Elements);
        var empty = await admin.PutAsJsonAsync($"/api/admin/areas/{areaId}/room", new { roomStyle = "Terrace" }, Ct);
        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        Assert.Empty((await GetRoomAsync(admin, areaId))!.Elements);
    }

    public static TheoryData<string, object, string> InvalidRooms() => new()
    {
        { "Basement", Element("Plant", 0.5, 0.5, 0.05, 0.05), "invalid_room_style" },
        { "", Element("Plant", 0.5, 0.5, 0.05, 0.05), "invalid_room_style" },
        { "Indoor", Element("Fountain", 0.5, 0.5, 0.05, 0.05), "invalid_room_element" },
        { "Indoor", new { posX = 0.5, posY = 0.5, width = 0.05, height = 0.05 }, "invalid_room_element" },
        { "Indoor", Element("0", 0.5, 0.5, 0.05, 0.05), "invalid_room_element" },
        { "Indoor", Element("Plant", 1.01, 0.5, 0.05, 0.05), "invalid_room_element_position" },
        { "Indoor", Element("Plant", 0.5, -0.01, 0.05, 0.05), "invalid_room_element_position" },
        { "Indoor", Element("Plant", 0.5, 0.5, 0, 0.05), "invalid_room_element_position" },
        { "Indoor", Element("Plant", 0.5, 0.5, 0.05, 1.01), "invalid_room_element_position" },
        { "Indoor", Element("Plant", 0.5, 0.5, 0.05, 0.05, rotation: 45), "invalid_room_element_position" },
        { "Indoor", Element("Plant", 0.5, 0.5, 0.05, 0.05, rotation: 360), "invalid_room_element_position" },
        { "Indoor", Element("Plant", 0.5, 0.5, 0.05, 0.05, label: new string('x', 41)), "invalid_room_element_label" },
        { "Indoor", Element("Label", 0.5, 0.5, 0.2, 0.05), "invalid_room_element_label" },
        { "Indoor", Element("Label", 0.5, 0.5, 0.2, 0.05, label: "   "), "invalid_room_element_label" },
    };

    [Theory]
    [MemberData(nameof(InvalidRooms))]
    public async Task An_invalid_room_is_not_saved_at_all(string roomStyle, object invalid, string error)
    {
        var (_, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;
        var before = await PutRoomAsync(admin, areaId, "Terrace", StageRoom);

        // The valid elements before the invalid one are not saved either.
        var response = await admin.PutAsJsonAsync($"/api/admin/areas/{areaId}/room", new { roomStyle, elements = new[] { StageRoom[1], invalid } }, Ct);

        Assert.Equal(error, await ErrorOf(response));
        var after = (await GetRoomAsync(admin, areaId))!;
        Assert.Equal(before.RoomStyle, after.RoomStyle);
        Assert.Equal(before.Elements, after.Elements);
    }

    [Fact]
    public async Task A_room_has_at_most_60_elements()
    {
        var (_, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;
        var elements = Enumerable.Range(0, MaxRoomElements).Select(i => Element("Pillar", 0.01 + i * 0.016, 0.5, 0.01, 0.01)).ToArray();

        Assert.Equal(60, (await PutRoomAsync(admin, areaId, "Indoor", elements)).Elements.Count);

        var response = await admin.PutAsJsonAsync($"/api/admin/areas/{areaId}/room", new { roomStyle = "Garden", elements = elements.Append(elements[0]) }, Ct);
        Assert.Equal("too_many_room_elements", await ErrorOf(response));
        var after = (await GetRoomAsync(admin, areaId))!;
        Assert.Equal((RoomStyle.Indoor, 60), (after.RoomStyle, after.Elements.Count));
    }

    [Theory]
    [InlineData("Indoor")]
    [InlineData("Terrace")]
    [InlineData("Garden")]
    [InlineData("Rooftop")]
    public async Task A_suggested_room_replaces_the_elements_and_arranges_the_tables_around_them(string roomStyle)
    {
        var (_, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;
        await PutRoomAsync(admin, areaId, roomStyle, StageRoom);

        var response = await admin.PostAsync($"/api/admin/areas/{areaId}/suggest-room", null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var suggested = (await response.Content.ReadFromJsonAsync<SuggestedRoomResponse>(Ct))!;
        var style = Enum.Parse<RoomStyle>(roomStyle);
        Assert.Equal(style, suggested.RoomStyle);
        Assert.Equal(
            RoomSuggestion.Suggest(style, 6).Select(e => (e.Kind, e.PosX, e.PosY, e.Width, e.Height, e.Rotation)),
            suggested.Elements.Select(e => (e.Kind, e.PosX, e.PosY, e.Width, e.Height, e.Rotation)));
        Assert.Equal(["1", "2", "3", "4", "5", "6"], suggested.Tables.Select(t => t.Number));
        Assert.Equal(suggested.Tables, (await admin.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct))!);
        var room = (await GetRoomAsync(admin, areaId))!;
        Assert.Equal(suggested.Elements, room.Elements);

        var tables = AsTables(suggested.Tables);
        RoomLayoutTests.AssertClearOfElements(tables, AsElements(room.Elements), 100, TableLayout.ChairSpace);
        TableLayoutTests.AssertNoOverlap(tables, 100, TableLayout.ChairSpace);
    }

    [Fact]
    public async Task Arranging_the_tables_keeps_them_away_from_the_elements()
    {
        var (_, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;
        var room = await PutRoomAsync(admin, areaId, "Indoor", StageRoom);

        var response = await admin.PostAsync($"/api/admin/areas/{areaId}/arrange-tables", null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var tables = AsTables((await response.Content.ReadFromJsonAsync<List<TableResponse>>(Ct))!);
        RoomLayoutTests.AssertClearOfElements(tables, AsElements(room.Elements), 100, TableLayout.ChairSpace);
        TableLayoutTests.AssertNoOverlap(tables, 100, TableLayout.ChairSpace);
    }

    [Fact]
    public async Task In_an_area_with_floor_plan_image_the_room_is_stored_but_the_arrangement_ignores_it()
    {
        var (_, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;
        var body = new ByteArrayContent(Png);
        body.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        (await admin.PutAsync($"/api/admin/areas/{areaId}/floorplan", body, Ct)).EnsureSuccessStatusCode();
        await PutRoomAsync(admin, areaId, "Garden", StageRoom);

        var arranged = (await (await admin.PostAsync($"/api/admin/areas/{areaId}/arrange-tables", null, Ct)).Content.ReadFromJsonAsync<List<TableResponse>>(Ct))!;
        var suggested = (await (await admin.PostAsync($"/api/admin/areas/{areaId}/suggest-room", null, Ct)).Content.ReadFromJsonAsync<SuggestedRoomResponse>(Ct))!;

        var expected = AsTables(arranged);
        TableLayout.Arrange(expected, 100);
        Assert.Equal(expected.Select(t => (t.PosX, t.PosY)), arranged.Select(t => (t.PosX, t.PosY)));
        Assert.Equal(arranged, suggested.Tables);
        Assert.Equal(RoomStyle.Garden, suggested.RoomStyle);
        Assert.Equal(suggested.Elements, (await GetRoomAsync(admin, areaId))!.Elements);
    }

    [Fact]
    public async Task A_new_table_does_not_land_on_an_element()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100)]);
        using var admin = await TestRestaurants.SignInAsync(factory, restaurant.AdminEmail);
        var areaId = restaurant.Areas["Saal"];
        // A pillar right in the middle, where the first table would go, and a stage across the top.
        var room = await PutRoomAsync(admin, areaId, "Indoor", [Element("Pillar", 0.5, 0.5, 0.1, 0.15), Element("Stage", 0.5, 0.1, 1, 0.2)]);

        var tables = new List<TableResponse>();
        foreach (var (number, seats) in new[] { ("1", 4), ("2", 8), ("3", 2), ("4", 6), ("5", 4) })
        {
            var response = await admin.PostAsJsonAsync("/api/admin/tables", new { areaId, number = $"{restaurant.Slug}-{number}", seats }, Ct);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            tables.Add((await response.Content.ReadFromJsonAsync<TableResponse>(Ct))!);
        }

        RoomLayoutTests.AssertClearOfElements(AsTables(tables), AsElements(room.Elements), 100);
        TableLayoutTests.AssertNoOverlap(AsTables(tables), 100);
    }

    [Fact]
    public async Task Deleting_an_area_deletes_its_room_elements()
    {
        var (restaurant, admin, areaId) = await RestaurantAsync();
        using var _admin = admin;
        await PutRoomAsync(admin, areaId, "Indoor", StageRoom);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/areas/{areaId}", Ct)).StatusCode);

        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantScope>().TenantId = restaurant.Id;
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<AppDbContext>().RoomElements.ToListAsync(Ct));
    }

    [Fact]
    public async Task An_admin_neither_sees_nor_changes_the_room_of_another_restaurant()
    {
        var (_, adminA, areaId) = await RestaurantAsync();
        using var _adminA = adminA;
        var (_, adminB, _) = await RestaurantAsync();
        using var _adminB = adminB;
        var before = await PutRoomAsync(adminA, areaId, "Terrace", StageRoom);
        var tablesBefore = await adminA.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct);

        Assert.Equal(HttpStatusCode.NotFound, (await adminB.GetAsync($"/api/admin/areas/{areaId}/room", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.PutAsJsonAsync($"/api/admin/areas/{areaId}/room", new { roomStyle = "Garden", elements = Array.Empty<object>() }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminB.PostAsync($"/api/admin/areas/{areaId}/suggest-room", null, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await adminA.GetAsync($"/api/admin/areas/{Guid.NewGuid()}/room", Ct)).StatusCode);

        var after = (await GetRoomAsync(adminA, areaId))!;
        Assert.Equal(before.RoomStyle, after.RoomStyle);
        Assert.Equal(before.Elements, after.Elements);
        Assert.Equal(tablesBefore, await adminA.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct));
        var floorOfB = (await adminB.GetFromJsonAsync<List<FloorArea>>("/api/staff/floor", Ct))!;
        Assert.DoesNotContain(floorOfB.SelectMany(a => a.RoomElements), e => before.Elements.Any(b => b.Id == e.Id));
    }

    [Fact]
    public async Task The_guests_and_the_staff_get_the_room_of_every_area()
    {
        var (restaurant, admin, areaId) = await RestaurantAsync(TableSelectionMode.GuestChooses);
        using var _admin = admin;
        var room = await PutRoomAsync(admin, areaId, "Rooftop", StageRoom);
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await TestRestaurants.SignInAsync(factory, restaurant.FrontDeskEmail);
        var date = TestRestaurants.NextOpenDay(factory);

        var publicArea = Assert.Single((await anonymous.GetFromJsonAsync<List<PublicArea>>($"/api/public/restaurants/{restaurant.Slug}/tables?date={date:yyyy-MM-dd}&time=18:00&guests=2", Ct))!);
        var floorArea = Assert.Single((await frontDesk.GetFromJsonAsync<List<FloorArea>>("/api/staff/floor", Ct))!);

        Assert.Equal(RoomStyle.Rooftop, publicArea.RoomStyle);
        Assert.Equal(room.Elements, publicArea.RoomElements);
        Assert.Equal(RoomStyle.Rooftop, floorArea.RoomStyle);
        Assert.Equal(room.Elements, floorArea.RoomElements);
    }
}

/// <summary>The migration of the rooms on a database from before them.</summary>
public sealed class RoomMigrationTests : IDisposable
{
    private class NoTenant : ITenantContext
    {
        public Guid? TenantId => null;
    }

    private readonly SqliteConnection connection = new("Data Source=:memory:");

    public void Dispose() => connection.Dispose();

    [Fact]
    public void Existing_areas_become_indoor_rooms_without_elements()
    {
        connection.Open();
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options, new NoTenant());
        var migrator = db.GetService<IMigrator>();
        migrator.Migrate("20261101074356_AddTenantBranding");
        Execute("""
            INSERT INTO "Tenants" ("Id", "Name", "Slug", "CreatedAt") VALUES ('7C5A1D0E-0000-0000-0000-000000000001', 'Alt', 'alt', '2026-10-01 00:00:00');
            INSERT INTO "Areas" ("Id", "TenantId", "Name", "SortOrder", "OnlineBookingEnabled", "OnlineCapacityPercent")
            VALUES ('7C5A1D0E-0000-0000-0000-000000000002', '7C5A1D0E-0000-0000-0000-000000000001', 'Gaststube', 0, 1, 100);
            """);

        migrator.Migrate();

        Assert.Equal("Indoor", Execute("""SELECT "RoomStyle" FROM "Areas";"""));
        Assert.Equal(0L, Execute("""SELECT COUNT(*) FROM "RoomElements";"""));
    }

    private object? Execute(string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar();
    }
}
