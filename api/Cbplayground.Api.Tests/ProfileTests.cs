using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Endpoints;
using static Cbplayground.Api.Endpoints.ProfileEndpoints;

namespace Cbplayground.Api.Tests;

public class ProfileTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Path = "/api/admin/profile";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = factory.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.Password }, Ct);
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static ProfileDto Profile(
        string? street = "Lindenstraße 12",
        string? postalCode = "80331",
        string? city = "München",
        string? phone = "+49 89 2345678",
        string? email = "info@zur-linde.example",
        string? website = "https://www.zur-linde.example",
        string? description = "Bayerisches Wirtshaus.") =>
        new(street, postalCode, city, phone, email, website, description);

    private static async Task<string?> ErrorOf(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ErrorResponse>(Ct))?.Error;

    [Fact]
    public async Task A_saved_profile_is_returned_on_the_next_read()
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var put = await client.PutAsJsonAsync(Path, Profile(), Ct);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(Profile(), await put.Content.ReadFromJsonAsync<ProfileDto>(Ct));

        Assert.Equal(Profile(), await client.GetFromJsonAsync<ProfileDto>(Path, Ct));
    }

    [Fact]
    public async Task Fields_are_trimmed_and_empty_fields_are_stored_as_null()
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var put = await client.PutAsJsonAsync(Path, new ProfileDto("  Hauptstraße 1 ", "", "   ", null, " info@zur-linde.example ", "", null), Ct);

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(new ProfileDto("Hauptstraße 1", null, null, null, "info@zur-linde.example", null, null), await client.GetFromJsonAsync<ProfileDto>(Path, Ct));
    }

    [Theory]
    [InlineData("info")]
    [InlineData("info@")]
    [InlineData("@zur-linde.example")]
    [InlineData("info@zur-linde")]
    [InlineData("in fo@zur-linde.example")]
    [InlineData("info@@zur-linde.example")]
    public async Task An_invalid_email_is_rejected(string email)
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Profile(email: email), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_email", await ErrorOf(response));
    }

    [Theory]
    [InlineData("www.zur-linde.example")]
    [InlineData("zur-linde")]
    [InlineData("ftp://zur-linde.example")]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://")]
    public async Task An_invalid_website_is_rejected(string website)
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Profile(website: website), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_website", await ErrorOf(response));
    }

    [Theory]
    [InlineData("http://zur-linde.example")]
    [InlineData("https://www.zur-linde.example/speisekarte?lang=de")]
    public async Task Http_and_https_websites_are_allowed(string website)
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var response = await client.PutAsJsonAsync(Path, Profile(website: website), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("street", 200, "invalid_street")]
    [InlineData("postalCode", 10, "invalid_postal_code")]
    [InlineData("city", 100, "invalid_city")]
    [InlineData("phone", 30, "invalid_phone")]
    [InlineData("description", 500, "invalid_description")]
    public async Task A_field_longer_than_its_maximum_is_rejected(string field, int maxLength, string error)
    {
        using var client = await LoginAsync("admin@zur-linde.test");
        ProfileDto WithLength(int length)
        {
            var value = new string('a', length);
            return field switch
            {
                "street" => Profile(street: value),
                "postalCode" => Profile(postalCode: value),
                "city" => Profile(city: value),
                "phone" => Profile(phone: value),
                _ => Profile(description: value),
            };
        }

        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(Path, WithLength(maxLength), Ct)).StatusCode);

        var response = await client.PutAsJsonAsync(Path, WithLength(maxLength + 1), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(error, await ErrorOf(response));
    }

    [Fact]
    public async Task Too_long_email_and_website_are_rejected()
    {
        using var client = await LoginAsync("admin@zur-linde.test");

        var email = await client.PutAsJsonAsync(Path, Profile(email: $"{new string('a', 250)}@zur-linde.example"), Ct);
        var website = await client.PutAsJsonAsync(Path, Profile(website: $"https://zur-linde.example/{new string('a', 200)}"), Ct);

        Assert.Equal("invalid_email", await ErrorOf(email));
        Assert.Equal("invalid_website", await ErrorOf(website));
    }

    [Fact]
    public async Task A_rejected_save_changes_nothing()
    {
        using var client = await LoginAsync("admin@zur-linde.test");
        await client.PutAsJsonAsync(Path, Profile(city: "Augsburg"), Ct);

        var response = await client.PutAsJsonAsync(Path, Profile(city: "Regensburg", email: "kein-email"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Augsburg", (await client.GetFromJsonAsync<ProfileDto>(Path, Ct))?.City);
    }

    [Fact]
    public async Task An_admin_only_sees_and_changes_the_profile_of_their_own_restaurant()
    {
        using var linde = await LoginAsync("admin@zur-linde.test");
        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        await dunav.PutAsJsonAsync(Path, Profile(street: "Sunčani kej 7", postalCode: "21000", city: "Novi Sad", email: "info@kafana-dunav.example"), Ct);

        await linde.PutAsJsonAsync(Path, Profile(city: "Passau", email: "info@zur-linde.example"), Ct);

        var dunavProfile = await dunav.GetFromJsonAsync<ProfileDto>(Path, Ct);
        Assert.Equal("Novi Sad", dunavProfile?.City);
        Assert.Equal("info@kafana-dunav.example", dunavProfile?.Email);
        Assert.Equal("Passau", (await linde.GetFromJsonAsync<ProfileDto>(Path, Ct))?.City);
    }

    [Fact]
    public async Task The_restaurant_list_shows_city_and_description()
    {
        using var dunav = await LoginAsync("admin@kafana-dunav.test");
        await dunav.PutAsJsonAsync(Path, Profile(city: "Novi Sad", description: "Kafana na keju uz Dunav."), Ct);
        using var anonymous = factory.CreateHttpsClient();

        var tenants = await anonymous.GetFromJsonAsync<List<TenantEndpoints.TenantListItem>>("/api/tenants", Ct);

        var tenant = Assert.Single(tenants!, t => t.Slug == "kafana-dunav");
        Assert.Equal("Novi Sad", tenant.City);
        Assert.Equal("Kafana na keju uz Dunav.", tenant.Description);
    }

    [Theory]
    [InlineData("GET", Path)]
    [InlineData("PUT", Path)]
    [InlineData("GET", "/api/admin/setup-status")]
    public async Task Profile_and_setup_status_are_for_tenant_admins_only(string method, string path)
    {
        using var anonymous = factory.CreateHttpsClient();
        using var frontDesk = await LoginAsync("frontdesk@zur-linde.test");
        HttpRequestMessage Request() => new(new HttpMethod(method), path)
        {
            Content = method == "PUT" ? JsonContent.Create(Profile()) : null,
        };

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(Request(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await frontDesk.SendAsync(Request(), Ct)).StatusCode);
    }
}
