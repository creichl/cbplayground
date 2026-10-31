using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using static Cbplayground.Api.Endpoints.AreaEndpoints;
using static Cbplayground.Api.Endpoints.ProfileEndpoints;
using static Cbplayground.Api.Endpoints.ReservationSettingsEndpoints;
using static Cbplayground.Api.Endpoints.TableEndpoints;

namespace Cbplayground.Api.Tests;

public class SetupStatusTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Path = "/api/admin/setup-status";

    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Ct);
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<SetupStatusResponse> StatusAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<SetupStatusResponse>(Path, Ct))!;

    [Fact]
    public async Task A_new_restaurant_has_no_step_done()
    {
        // Kafana Dunav is never set up in these tests.
        using var client = await LoginAsync("admin@kafana-dunav.test");

        Assert.Equal(new SetupStatusResponse(false, false, false, false, false, false), await StatusAsync(client));
    }

    [Fact]
    public async Task Each_step_is_done_once_its_data_is_saved_and_open_again_when_it_is_removed()
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        // The profile step needs address and phone; an email alone is not enough.
        (await client.PutAsJsonAsync("/api/admin/profile", new ProfileDto(null, null, null, null, "info@zur-linde.example", null, null), Ct)).EnsureSuccessStatusCode();
        Assert.False((await StatusAsync(client)).Profile);
        (await client.PutAsJsonAsync("/api/admin/profile", new ProfileDto("Lindenstraße 12", "80331", "München", "+49 89 2345678", null, null, null), Ct)).EnsureSuccessStatusCode();
        Assert.True((await StatusAsync(client)).Profile);

        (await client.PutAsJsonAsync("/api/admin/location", new { countryCode = "DE", regionCode = "DE-BY" }, Ct)).EnsureSuccessStatusCode();
        Assert.True((await StatusAsync(client)).Location);

        (await client.PutAsJsonAsync("/api/admin/opening-hours", new { periods = new[] { new { dayOfWeek = 2, start = "11:30", end = "14:30" } } }, Ct)).EnsureSuccessStatusCode();
        Assert.True((await StatusAsync(client)).OpeningHours);

        // An area without a floor plan does not count.
        var areaResponse = await client.PostAsJsonAsync("/api/admin/areas", new { name = "Gaststube" }, Ct);
        var area = (await areaResponse.Content.ReadFromJsonAsync<AreaResponse>(Ct))!;
        Assert.False((await StatusAsync(client)).FloorPlan);
        var image = new ByteArrayContent(Png);
        image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        (await client.PutAsync($"/api/admin/areas/{area.Id}/floorplan", image, Ct)).EnsureSuccessStatusCode();
        Assert.True((await StatusAsync(client)).FloorPlan);

        var tableResponse = await client.PostAsJsonAsync("/api/admin/tables", new { areaId = area.Id, number = "1", seats = 4 }, Ct);
        var table = (await tableResponse.Content.ReadFromJsonAsync<TableResponse>(Ct))!;
        Assert.True((await StatusAsync(client)).Tables);

        Assert.False((await StatusAsync(client)).ReservationSettings);
        (await client.PutAsJsonAsync("/api/admin/reservation-settings", new ReservationSettingsDto(ConfirmationMode.Instant, TableSelectionMode.SystemAssigns, 120, []), Ct)).EnsureSuccessStatusCode();

        Assert.Equal(new SetupStatusResponse(true, true, true, true, true, true), await StatusAsync(client));

        // Removing the data opens the steps again.
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/admin/tables/{table.Id}", Ct)).StatusCode);
        Assert.False((await StatusAsync(client)).Tables);
        (await client.PutAsJsonAsync("/api/admin/opening-hours", new { periods = Array.Empty<object>() }, Ct)).EnsureSuccessStatusCode();
        Assert.False((await StatusAsync(client)).OpeningHours);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/admin/areas/{area.Id}", Ct)).StatusCode);
        Assert.False((await StatusAsync(client)).FloorPlan);

        // The other restaurant is not affected by any of this.
        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        Assert.Equal(new SetupStatusResponse(false, false, false, false, false, false), await StatusAsync(dunav));
    }
}
