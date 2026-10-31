using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Cbplayground.Api.Endpoints;
using static Cbplayground.Api.Endpoints.AreaEndpoints;
using static Cbplayground.Api.Endpoints.TableEndpoints;

namespace Cbplayground.Api.Tests;

public class AreaAndTableTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string AdminA = "admin@zur-linde.test";
    private const string AdminB = "admin@kafana-dunav.test";

    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01];
    private static readonly byte[] WebP = [.. "RIFF"u8, 0x24, 0x00, 0x00, 0x00, .. "WEBPVP8 "u8];
    private static readonly byte[] Gif = [.. "GIF89a"u8, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Ct);
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<AreaResponse> CreateAreaAsync(HttpClient client, string? name = null)
    {
        var response = await client.PostAsJsonAsync("/api/admin/areas", new { name = name ?? $"Area {Guid.NewGuid():N}" }, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AreaResponse>(Ct))!;
    }

    private static async Task<TableResponse> CreateTableAsync(HttpClient client, Guid areaId, string? number = null, int seats = 4)
    {
        var response = await client.PostAsJsonAsync("/api/admin/tables", new { areaId, number = number ?? UniqueNumber(), seats }, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TableResponse>(Ct))!;
    }

    private static string UniqueNumber() => $"T{Guid.NewGuid():N}"[..12];

    private static Task<HttpResponseMessage> UploadAsync(HttpClient client, Guid areaId, byte[] content, string contentType = "image/png")
    {
        var body = new ByteArrayContent(content);
        body.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return client.PutAsync($"/api/admin/areas/{areaId}/floorplan", body, Ct);
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ErrorResponse>(Ct))?.Error;

    private static Task<List<AreaResponse>?> GetAreasAsync(HttpClient client) =>
        client.GetFromJsonAsync<List<AreaResponse>>("/api/admin/areas", Ct);

    private static Task<List<TableResponse>?> GetTablesAsync(HttpClient client) =>
        client.GetFromJsonAsync<List<TableResponse>>("/api/admin/tables", Ct);

    [Theory]
    [InlineData("GET", "/api/admin/areas")]
    [InlineData("POST", "/api/admin/areas")]
    [InlineData("PUT", "/api/admin/areas/order")]
    [InlineData("PUT", "/api/admin/areas/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", "/api/admin/areas/00000000-0000-0000-0000-000000000001")]
    [InlineData("PUT", "/api/admin/areas/00000000-0000-0000-0000-000000000001/floorplan")]
    [InlineData("GET", "/api/admin/tables")]
    [InlineData("POST", "/api/admin/tables")]
    [InlineData("PUT", "/api/admin/tables/positions")]
    [InlineData("PUT", "/api/admin/tables/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", "/api/admin/tables/00000000-0000-0000-0000-000000000001")]
    public async Task Admin_area_and_table_endpoints_are_for_tenant_admins_only(string method, string path)
    {
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await LoginAsync("frontdesk@zur-linde.test");

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.SendAsync(new HttpRequestMessage(new HttpMethod(method), path), Ct)).StatusCode);
    }

    [Fact]
    public async Task A_new_area_is_open_for_online_booking_and_comes_last()
    {
        using var client = await LoginAsync(AdminA);
        var first = await CreateAreaAsync(client);

        var area = await CreateAreaAsync(client, "  Terrasse  ");

        Assert.Equal("Terrasse", area.Name);
        Assert.True(area.OnlineBookingEnabled);
        Assert.Equal(100, area.OnlineCapacityPercent);
        Assert.Null(area.FloorPlanUrl);
        Assert.True(area.SortOrder > first.SortOrder);
        Assert.Equal(area, (await GetAreasAsync(client))!.Last());
    }

    [Fact]
    public async Task An_area_can_be_renamed_and_its_online_quota_changed()
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);

        var response = await client.PutAsJsonAsync($"/api/admin/areas/{area.Id}", new { name = "Gaststube", onlineBookingEnabled = false, onlineCapacityPercent = 60 }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = Assert.Single((await GetAreasAsync(client))!, a => a.Id == area.Id);
        Assert.Equal("Gaststube", saved.Name);
        Assert.False(saved.OnlineBookingEnabled);
        Assert.Equal(60, saved.OnlineCapacityPercent);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    public async Task The_online_quota_must_be_between_0_and_100_percent(int percent)
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);

        var response = await client.PutAsJsonAsync($"/api/admin/areas/{area.Id}", new { name = area.Name, onlineBookingEnabled = true, onlineCapacityPercent = percent }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("online_capacity_percent_invalid", await ErrorOf(response));
        Assert.Equal(100, Assert.Single((await GetAreasAsync(client))!, a => a.Id == area.Id).OnlineCapacityPercent);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(100)]
    public async Task The_online_quota_may_be_0_or_100_percent(int percent)
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);

        var response = await client.PutAsJsonAsync($"/api/admin/areas/{area.Id}", new { name = area.Name, onlineBookingEnabled = true, onlineCapacityPercent = percent }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task An_area_needs_a_name(string? name)
    {
        using var client = await LoginAsync(AdminA);

        var response = await client.PostAsJsonAsync("/api/admin/areas", new { name }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("area_name_invalid", await ErrorOf(response));
    }

    [Fact]
    public async Task The_order_of_the_areas_can_be_changed()
    {
        using var client = await LoginAsync(AdminA);
        await CreateAreaAsync(client);
        await CreateAreaAsync(client);
        var reversed = (await GetAreasAsync(client))!.Select(a => a.Id).Reverse().ToList();

        var response = await client.PutAsJsonAsync("/api/admin/areas/order", new { areaIds = reversed }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(reversed, (await GetAreasAsync(client))!.Select(a => a.Id));
    }

    [Fact]
    public async Task The_new_order_must_contain_every_area_once()
    {
        using var client = await LoginAsync(AdminA);
        await CreateAreaAsync(client);
        await CreateAreaAsync(client);
        var ids = (await GetAreasAsync(client))!.Select(a => a.Id).ToList();

        var missing = await client.PutAsJsonAsync("/api/admin/areas/order", new { areaIds = ids.Skip(1) }, Ct);
        var duplicate = await client.PutAsJsonAsync("/api/admin/areas/order", new { areaIds = ids.Skip(1).Append(ids[1]) }, Ct);

        Assert.Equal("area_order_invalid", await ErrorOf(missing));
        Assert.Equal("area_order_invalid", await ErrorOf(duplicate));
        Assert.Equal(ids, (await GetAreasAsync(client))!.Select(a => a.Id));
    }

    [Fact]
    public async Task A_new_table_is_placed_in_the_middle_of_its_area()
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);

        var table = await CreateTableAsync(client, area.Id, " 12 ", 4);

        Assert.Equal(new TableResponse(table.Id, area.Id, "12", 4, 0.5, 0.5), table);
        Assert.Contains(table, (await GetTablesAsync(client))!);
    }

    [Fact]
    public async Task A_table_can_be_changed_and_deleted()
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);
        var table = await CreateTableAsync(client, area.Id);
        var number = UniqueNumber();

        var update = await client.PutAsJsonAsync($"/api/admin/tables/{table.Id}", new { number, seats = 6 }, Ct);

        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var saved = Assert.Single((await GetTablesAsync(client))!, t => t.Id == table.Id);
        Assert.Equal(number, saved.Number);
        Assert.Equal(6, saved.Seats);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/admin/tables/{table.Id}", Ct)).StatusCode);
        Assert.DoesNotContain((await GetTablesAsync(client))!, t => t.Id == table.Id);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-2)]
    public async Task A_table_needs_at_least_one_seat(int seats)
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);
        var table = await CreateTableAsync(client, area.Id);

        var create = await client.PostAsJsonAsync("/api/admin/tables", new { areaId = area.Id, number = UniqueNumber(), seats }, Ct);
        var update = await client.PutAsJsonAsync($"/api/admin/tables/{table.Id}", new { number = table.Number, seats }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Equal("seats_invalid", await ErrorOf(create));
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
        Assert.Equal("seats_invalid", await ErrorOf(update));
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("123456789012345678901")]
    public async Task A_table_needs_a_number_of_at_most_20_characters(string number)
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);

        var response = await client.PostAsJsonAsync("/api/admin/tables", new { areaId = area.Id, number, seats = 2 }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("table_number_invalid", await ErrorOf(response));
    }

    [Fact]
    public async Task A_table_number_is_unique_within_the_restaurant()
    {
        using var client = await LoginAsync(AdminA);
        var dining = await CreateAreaAsync(client);
        var terrace = await CreateAreaAsync(client);
        var number = UniqueNumber();
        await CreateTableAsync(client, dining.Id, number);
        var other = await CreateTableAsync(client, dining.Id);

        // In another area of the same restaurant, and when renaming another table.
        var create = await client.PostAsJsonAsync("/api/admin/tables", new { areaId = terrace.Id, number, seats = 2 }, Ct);
        var update = await client.PutAsJsonAsync($"/api/admin/tables/{other.Id}", new { number, seats = 2 }, Ct);

        Assert.Equal(HttpStatusCode.Conflict, create.StatusCode);
        Assert.Equal("table_number_taken", await ErrorOf(create));
        Assert.Equal(HttpStatusCode.Conflict, update.StatusCode);
        Assert.Equal("table_number_taken", await ErrorOf(update));

        // Saving a table with its own number is fine.
        var unchanged = await client.PutAsJsonAsync($"/api/admin/tables/{other.Id}", new { number = other.Number, seats = 3 }, Ct);
        Assert.Equal(HttpStatusCode.OK, unchanged.StatusCode);
    }

    [Fact]
    public async Task Another_restaurant_may_use_the_same_table_number()
    {
        using var clientA = await LoginAsync(AdminA);
        using var clientB = await LoginAsync(AdminB);
        var number = UniqueNumber();
        await CreateTableAsync(clientA, (await CreateAreaAsync(clientA)).Id, number);

        await CreateTableAsync(clientB, (await CreateAreaAsync(clientB)).Id, number);
    }

    [Fact]
    public async Task The_positions_of_several_tables_are_saved_at_once()
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);
        var first = await CreateTableAsync(client, area.Id);
        var second = await CreateTableAsync(client, area.Id);

        var response = await client.PutAsJsonAsync("/api/admin/tables/positions", new[]
        {
            new TablePosition(first.Id, 0, 1),
            new TablePosition(second.Id, 0.25, 0.75),
        }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var tables = (await GetTablesAsync(client))!;
        Assert.Equal(first with { PosX = 0, PosY = 1 }, Assert.Single(tables, t => t.Id == first.Id));
        Assert.Equal(second with { PosX = 0.25, PosY = 0.75 }, Assert.Single(tables, t => t.Id == second.Id));
    }

    [Theory]
    [InlineData(-0.01, 0.5)]
    [InlineData(0.5, 1.01)]
    public async Task Positions_must_lie_on_the_floor_plan(double posX, double posY)
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);
        var first = await CreateTableAsync(client, area.Id);
        var second = await CreateTableAsync(client, area.Id);

        var response = await client.PutAsJsonAsync("/api/admin/tables/positions", new[]
        {
            new TablePosition(first.Id, 0.1, 0.1),
            new TablePosition(second.Id, posX, posY),
        }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("position_invalid", await ErrorOf(response));
        Assert.Equal(0.5, Assert.Single((await GetTablesAsync(client))!, t => t.Id == first.Id).PosX);
    }

    [Theory]
    [InlineData("png")]
    [InlineData("jpeg")]
    [InlineData("webp")]
    public async Task A_floor_plan_can_be_uploaded_and_read_without_sign_in(string type)
    {
        var (content, contentType) = type switch
        {
            "png" => (Png, "image/png"),
            "jpeg" => (Jpeg, "image/jpeg"),
            _ => (WebP, "image/webp"),
        };
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);

        var upload = await UploadAsync(client, area.Id, content, contentType);

        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var floorPlanUrl = (await upload.Content.ReadFromJsonAsync<AreaResponse>(Ct))!.FloorPlanUrl;
        Assert.NotNull(floorPlanUrl);
        Assert.StartsWith($"/api/areas/{area.Id}/floorplan", floorPlanUrl);
        Assert.Equal(floorPlanUrl, Assert.Single((await GetAreasAsync(client))!, a => a.Id == area.Id).FloorPlanUrl);

        using var guest = factory.CreateHttpsClient();
        var image = await guest.GetAsync(floorPlanUrl, Ct);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal(contentType, image.Content.Headers.ContentType?.MediaType);
        Assert.Equal(content, await image.Content.ReadAsByteArrayAsync(Ct));
    }

    [Fact]
    public async Task A_new_floor_plan_replaces_the_old_file()
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);
        var first = (await (await UploadAsync(client, area.Id, Png)).Content.ReadFromJsonAsync<AreaResponse>(Ct))!;

        var second = (await (await UploadAsync(client, area.Id, Jpeg, "image/jpeg")).Content.ReadFromJsonAsync<AreaResponse>(Ct))!;

        Assert.NotEqual(first.FloorPlanUrl, second.FloorPlanUrl);
        Assert.False(File.Exists(Path.Combine(factory.UploadsPath, FileNameOf(first.FloorPlanUrl!) + ".png")));
        Assert.True(File.Exists(Path.Combine(factory.UploadsPath, FileNameOf(second.FloorPlanUrl!) + ".jpg")));
        using var guest = factory.CreateHttpsClient();
        Assert.Equal(Jpeg, await guest.GetByteArrayAsync($"/api/areas/{area.Id}/floorplan", Ct));
    }

    private static string FileNameOf(string floorPlanUrl) => floorPlanUrl.Split("?v=")[1];

    [Theory]
    [InlineData("gif")]
    [InlineData("text")]
    [InlineData("empty")]
    public async Task A_floor_plan_upload_checks_the_content_not_the_declared_type(string type)
    {
        byte[] content = type switch
        {
            "gif" => Gif,
            "text" => "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"u8.ToArray(),
            _ => [],
        };
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);

        var response = await UploadAsync(client, area.Id, content, "image/png");

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
        Assert.Equal("floor_plan_type_invalid", await ErrorOf(response));
        Assert.Null(Assert.Single((await GetAreasAsync(client))!, a => a.Id == area.Id).FloorPlanUrl);
    }

    [Fact]
    public async Task A_floor_plan_may_have_at_most_10_MB()
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);
        var exactly10Mb = new byte[MaxFloorPlanBytes];
        Png.CopyTo(exactly10Mb, 0);
        var tooLarge = new byte[MaxFloorPlanBytes + 1];
        Png.CopyTo(tooLarge, 0);

        var rejected = await UploadAsync(client, area.Id, tooLarge);
        var accepted = await UploadAsync(client, area.Id, exactly10Mb);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, rejected.StatusCode);
        Assert.Equal("floor_plan_too_large", await ErrorOf(rejected));
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
    }

    [Fact]
    public async Task An_area_without_floor_plan_has_no_image()
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);
        using var guest = factory.CreateHttpsClient();

        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/areas/{area.Id}/floorplan", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/areas/{Guid.NewGuid()}/floorplan", Ct)).StatusCode);
    }

    [Fact]
    public async Task Deleting_an_area_deletes_its_tables_and_floor_plan()
    {
        using var client = await LoginAsync(AdminA);
        var area = await CreateAreaAsync(client);
        var other = await CreateAreaAsync(client);
        var table = await CreateTableAsync(client, area.Id);
        var otherTable = await CreateTableAsync(client, other.Id);
        var floorPlanUrl = (await (await UploadAsync(client, area.Id, Png)).Content.ReadFromJsonAsync<AreaResponse>(Ct))!.FloorPlanUrl!;

        var response = await client.DeleteAsync($"/api/admin/areas/{area.Id}", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.DoesNotContain((await GetAreasAsync(client))!, a => a.Id == area.Id);
        var tables = (await GetTablesAsync(client))!;
        Assert.DoesNotContain(tables, t => t.Id == table.Id);
        Assert.Contains(tables, t => t.Id == otherTable.Id);
        Assert.False(File.Exists(Path.Combine(factory.UploadsPath, FileNameOf(floorPlanUrl) + ".png")));
        using var guest = factory.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(floorPlanUrl, Ct)).StatusCode);
    }

    [Fact]
    public async Task An_admin_neither_sees_nor_changes_areas_tables_or_floor_plans_of_another_restaurant()
    {
        using var clientA = await LoginAsync(AdminA);
        using var clientB = await LoginAsync(AdminB);
        var area = await CreateAreaAsync(clientA, "Gaststube A");
        var table = await CreateTableAsync(clientA, area.Id);
        await UploadAsync(clientA, area.Id, Png);
        var areaBefore = Assert.Single((await GetAreasAsync(clientA))!, a => a.Id == area.Id);

        Assert.DoesNotContain((await GetAreasAsync(clientB))!, a => a.Id == area.Id);
        Assert.DoesNotContain((await GetTablesAsync(clientB))!, t => t.Id == table.Id);

        Assert.Equal(HttpStatusCode.NotFound, (await clientB.PutAsJsonAsync($"/api/admin/areas/{area.Id}", new { name = "taken by B", onlineBookingEnabled = false, onlineCapacityPercent = 0 }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await UploadAsync(clientB, area.Id, Jpeg, "image/jpeg")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await clientB.DeleteAsync($"/api/admin/areas/{area.Id}", Ct)).StatusCode);
        var areaIdsOfB = (await GetAreasAsync(clientB))!.Select(a => a.Id).Append(area.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await clientB.PutAsJsonAsync("/api/admin/areas/order", new { areaIds = areaIdsOfB }, Ct)).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await clientB.PostAsJsonAsync("/api/admin/tables", new { areaId = area.Id, number = UniqueNumber(), seats = 2 }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await clientB.PutAsJsonAsync($"/api/admin/tables/{table.Id}", new { number = UniqueNumber(), seats = 9 }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await clientB.PutAsJsonAsync("/api/admin/tables/positions", new[] { new TablePosition(table.Id, 0.9, 0.9) }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await clientB.DeleteAsync($"/api/admin/tables/{table.Id}", Ct)).StatusCode);

        Assert.Equal(areaBefore, Assert.Single((await GetAreasAsync(clientA))!, a => a.Id == area.Id));
        Assert.Equal(table, Assert.Single((await GetTablesAsync(clientA))!, t => t.Id == table.Id));
        using var guest = factory.CreateHttpsClient();
        Assert.Equal(Png, await guest.GetByteArrayAsync(areaBefore.FloorPlanUrl, Ct));
    }
}
