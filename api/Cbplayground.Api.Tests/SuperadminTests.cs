using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Cbplayground.Api.Endpoints;
using static Cbplayground.Api.Endpoints.SuperadminEndpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// The Superadmin's restaurant management under /api/superadmin. Tests that change a restaurant create one of their own,
/// so the seeded restaurants stay as they are.
/// </summary>
public class SuperadminTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Superadmin = "superadmin@test.local";

    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string email, string password = ApiFactory.Password) =>
        client.PostAsJsonAsync("/api/auth/login", new { email, password }, Token);

    private async Task<HttpClient> SignedInClientAsync(string email, string password = ApiFactory.Password)
    {
        var client = factory.CreateHttpsClient();
        var response = await LoginAsync(client, email, password);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }

    private static async Task<string?> ErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<ErrorResponse>(Token))?.Error;

    private static string NewSlug() => $"s-{Guid.NewGuid():N}"[..14];

    private static async Task<SuperadminTenant> CreateTenantAsync(HttpClient superadmin, string? slug = null, string? countryCode = null, string? regionCode = null)
    {
        slug ??= NewSlug();
        var response = await superadmin.PostAsJsonAsync("/api/superadmin/tenants", new { name = $"Restaurant {slug}", slug, countryCode, regionCode }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SuperadminTenant>(Token))!;
    }

    private static async Task<TenantAdminUser> CreateAdminAsync(HttpClient superadmin, Guid tenantId, string email)
    {
        var response = await superadmin.PostAsJsonAsync($"/api/superadmin/tenants/{tenantId}/admins", new { email, displayName = $"Admin {email}", password = ApiFactory.Password }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TenantAdminUser>(Token))!;
    }

    private static async Task<List<SuperadminTenant>> ListAsync(HttpClient superadmin) =>
        (await superadmin.GetFromJsonAsync<List<SuperadminTenant>>("/api/superadmin/tenants", Token))!;

    private static async Task<List<TenantEndpoints.TenantListItem>> PublicListAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<List<TenantEndpoints.TenantListItem>>("/api/tenants", Token))!;

    public static TheoryData<string, string, string> ForbiddenRequests()
    {
        var data = new TheoryData<string, string, string>();
        var id = Guid.NewGuid();
        string[][] endpoints =
        [
            ["GET", "/api/superadmin/tenants"],
            ["POST", "/api/superadmin/tenants"],
            ["PUT", $"/api/superadmin/tenants/{id}"],
            ["POST", $"/api/superadmin/tenants/{id}/deactivate"],
            ["POST", $"/api/superadmin/tenants/{id}/activate"],
            ["GET", $"/api/superadmin/tenants/{id}/admins"],
            ["POST", $"/api/superadmin/tenants/{id}/admins"],
            ["POST", $"/api/superadmin/tenants/{id}/admins/some-id/password"],
        ];
        foreach (var email in new[] { "admin@zur-linde.test", "frontdesk@zur-linde.test" })
        {
            foreach (var endpoint in endpoints)
            {
                data.Add(email, endpoint[0], endpoint[1]);
            }
        }
        return data;
    }

    [Theory]
    [MemberData(nameof(ForbiddenRequests))]
    public async Task Tenant_admins_and_front_desk_users_get_403_on_every_superadmin_endpoint(string email, string method, string path)
    {
        using var client = await SignedInClientAsync(email);

        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method != "GET")
        {
            request.Content = JsonContent.Create(new { name = "X", slug = "x", email = "x@x.test", displayName = "X", password = ApiFactory.Password });
        }
        var response = await client.SendAsync(request, Token);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Superadmin_api_returns_401_without_login()
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.GetAsync("/api/superadmin/tenants", Token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task The_list_contains_every_restaurant_with_its_key_figures()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 2), ("2", 4))]);
        var day = TestRestaurants.NextOpenDay(factory);
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", day.ToDateTime(new TimeOnly(12, 0)));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", day.ToDateTime(new TimeOnly(12, 0)), status: ReservationStatus.Requested);
        // Neither a past nor a cancelled reservation counts.
        await TestRestaurants.AddReservationAsync(factory, restaurant, "1", TestRestaurant.Today.AddDays(-3).ToDateTime(new TimeOnly(12, 0)));
        await TestRestaurants.AddReservationAsync(factory, restaurant, "2", day.ToDateTime(new TimeOnly(18, 0)), status: ReservationStatus.Cancelled);
        using var superadmin = await SignedInClientAsync(Superadmin);

        var tenants = await ListAsync(superadmin);

        Assert.Contains(tenants, t => t.Slug == "zur-linde" && t.Name == "Gasthaus zur Linde" && t.IsActive);
        Assert.Contains(tenants, t => t.Slug == "kafana-dunav" && t.AdminCount == 1);
        // zur-linde has one active admin; the deactivated and front desk users do not count.
        Assert.Equal(1, tenants.Single(t => t.Slug == "zur-linde").AdminCount);
        var created = tenants.Single(t => t.Id == restaurant.Id);
        Assert.Equal(1, created.AdminCount);
        Assert.Equal(2, created.TableCount);
        Assert.Equal(2, created.UpcomingReservationCount);
        Assert.Equal(tenants.OrderBy(t => t.Name, StringComparer.Ordinal).Select(t => t.Id), tenants.Select(t => t.Id));
    }

    [Fact]
    public async Task A_new_restaurant_with_an_admin_can_be_used_right_away()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);
        var slug = NewSlug();

        var tenant = await CreateTenantAsync(superadmin, slug, "DE", "DE-BY");
        var admin = await CreateAdminAsync(superadmin, tenant.Id, $"admin@{slug}.test");

        Assert.Equal(slug, tenant.Slug);
        Assert.Equal("DE", tenant.CountryCode);
        Assert.Equal("DE-BY", tenant.RegionCode);
        Assert.True(tenant.IsActive);
        Assert.Equal(0, tenant.AdminCount);
        Assert.True(admin.IsActive);
        Assert.Contains(await ListAsync(superadmin), t => t.Id == tenant.Id && t.AdminCount == 1);
        Assert.Contains(await PublicListAsync(superadmin), t => t.Slug == slug);

        using var adminClient = await SignedInClientAsync(admin.Email);
        var me = await adminClient.GetFromJsonAsync<AuthEndpoints.MeResponse>("/api/auth/me", Token);
        Assert.Equal("TenantAdmin", me?.Role);
        Assert.Equal(tenant.Id, me?.Tenant?.Id);
        // Only the location is set; everything else of the setup is still open.
        Assert.Equal(
            new ProfileEndpoints.SetupStatusResponse(false, true, false, false, false, false),
            await adminClient.GetFromJsonAsync<ProfileEndpoints.SetupStatusResponse>("/api/admin/setup-status", Token));
        var location = await adminClient.GetFromJsonAsync<OpeningHoursEndpoints.LocationResponse>("/api/admin/location", Token);
        Assert.Equal("Europe/Berlin", location?.TimeZoneId);
    }

    [Fact]
    public async Task A_new_restaurant_needs_no_location_and_its_slug_is_stored_in_lower_case()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);
        var slug = NewSlug();

        var response = await superadmin.PostAsJsonAsync("/api/superadmin/tenants", new { name = "  Neues Lokal  ", slug = $" {slug.ToUpperInvariant()} " }, Token);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var tenant = (await response.Content.ReadFromJsonAsync<SuperadminTenant>(Token))!;
        Assert.Equal("Neues Lokal", tenant.Name);
        Assert.Equal(slug, tenant.Slug);
        Assert.Null(tenant.CountryCode);
        Assert.Null(tenant.RegionCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("zwei worte")]
    [InlineData("-vorne")]
    [InlineData("hinten-")]
    [InlineData("dop--pelt")]
    [InlineData("gasthaus-zur-mühle")]
    [InlineData("unter_strich")]
    [InlineData("a12345678901234567890123456789012345678901234567890")]
    public async Task An_invalid_slug_is_rejected(string slug)
    {
        using var superadmin = await SignedInClientAsync(Superadmin);

        var response = await superadmin.PostAsJsonAsync("/api/superadmin/tenants", new { name = "Lokal", slug }, Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_slug", await ErrorAsync(response));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    [InlineData("a12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901")]
    public async Task An_invalid_name_is_rejected(string? name)
    {
        using var superadmin = await SignedInClientAsync(Superadmin);

        var response = await superadmin.PostAsJsonAsync("/api/superadmin/tenants", new { name, slug = NewSlug() }, Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_name", await ErrorAsync(response));
    }

    [Theory]
    [InlineData("XX", null, "invalid_country")]
    [InlineData(null, "DE-BY", "invalid_country")]
    [InlineData("DE", null, "region_required")]
    [InlineData("DE", "DE-XX", "invalid_region")]
    [InlineData("AT", "DE-BY", "region_not_allowed")]
    public async Task An_invalid_location_is_rejected(string? countryCode, string? regionCode, string error)
    {
        using var superadmin = await SignedInClientAsync(Superadmin);

        var response = await superadmin.PostAsJsonAsync("/api/superadmin/tenants", new { name = "Lokal", slug = NewSlug(), countryCode, regionCode }, Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(error, await ErrorAsync(response));
    }

    [Fact]
    public async Task A_taken_slug_is_rejected()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);

        var response = await superadmin.PostAsJsonAsync("/api/superadmin/tenants", new { name = "Noch eine Linde", slug = "Zur-Linde" }, Token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("slug_taken", await ErrorAsync(response));
    }

    [Fact]
    public async Task Name_and_slug_can_be_changed()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);
        var tenant = await CreateTenantAsync(superadmin);
        var newSlug = NewSlug();

        // Keeping the own slug is not a conflict.
        var sameSlug = await superadmin.PutAsJsonAsync($"/api/superadmin/tenants/{tenant.Id}", new { name = "Umbenannt", slug = tenant.Slug }, Token);
        Assert.Equal(HttpStatusCode.OK, sameSlug.StatusCode);

        var response = await superadmin.PutAsJsonAsync($"/api/superadmin/tenants/{tenant.Id}", new { name = "Neuer Name", slug = newSlug }, Token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<SuperadminTenant>(Token))!;
        Assert.Equal("Neuer Name", updated.Name);
        Assert.Equal(newSlug, updated.Slug);
        Assert.Equal(HttpStatusCode.OK, (await superadmin.GetAsync($"/api/public/restaurants/{newSlug}", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await superadmin.GetAsync($"/api/public/restaurants/{tenant.Slug}", Token)).StatusCode);
    }

    [Fact]
    public async Task Changing_to_a_taken_or_invalid_slug_is_rejected()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);
        var tenant = await CreateTenantAsync(superadmin);

        var taken = await superadmin.PutAsJsonAsync($"/api/superadmin/tenants/{tenant.Id}", new { name = "X", slug = "kafana-dunav" }, Token);
        var invalidSlug = await superadmin.PutAsJsonAsync($"/api/superadmin/tenants/{tenant.Id}", new { name = "X", slug = "kein slug" }, Token);
        var invalidName = await superadmin.PutAsJsonAsync($"/api/superadmin/tenants/{tenant.Id}", new { name = "", slug = tenant.Slug }, Token);

        Assert.Equal(HttpStatusCode.Conflict, taken.StatusCode);
        Assert.Equal("slug_taken", await ErrorAsync(taken));
        Assert.Equal("invalid_slug", await ErrorAsync(invalidSlug));
        Assert.Equal("invalid_name", await ErrorAsync(invalidName));
        Assert.Equal(tenant.Slug, (await ListAsync(superadmin)).Single(t => t.Id == tenant.Id).Slug);
    }

    [Fact]
    public async Task Unknown_restaurants_are_not_found()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);
        var id = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await superadmin.PutAsJsonAsync($"/api/superadmin/tenants/{id}", new { name = "X", slug = NewSlug() }, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await superadmin.PostAsync($"/api/superadmin/tenants/{id}/deactivate", null, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await superadmin.PostAsync($"/api/superadmin/tenants/{id}/activate", null, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await superadmin.GetAsync($"/api/superadmin/tenants/{id}/admins", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await superadmin.PostAsJsonAsync($"/api/superadmin/tenants/{id}/admins", new { email = "x@x.test", displayName = "X", password = ApiFactory.Password }, Token)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await superadmin.PostAsJsonAsync($"/api/superadmin/tenants/{id}/admins/some-id/password", new { password = ApiFactory.Password }, Token)).StatusCode);
    }

    [Fact]
    public async Task A_deactivated_restaurant_is_hidden_and_its_staff_is_signed_out_until_it_is_activated_again()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4))]);
        using var superadmin = await SignedInClientAsync(Superadmin);
        using var frontDesk = await SignedInClientAsync(restaurant.FrontDeskEmail);
        using var guest = factory.CreateHttpsClient();

        var deactivate = await superadmin.PostAsync($"/api/superadmin/tenants/{restaurant.Id}/deactivate", null, Token);

        Assert.Equal(HttpStatusCode.OK, deactivate.StatusCode);
        Assert.False((await deactivate.Content.ReadFromJsonAsync<SuperadminTenant>(Token))!.IsActive);
        Assert.DoesNotContain(await PublicListAsync(guest), t => t.Id == restaurant.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}", Token)).StatusCode);
        var day = TestRestaurants.NextOpenDay(factory).ToString("yyyy-MM-dd");
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}/availability?date={day}&guests=2", Token)).StatusCode);
        // The existing session ends with the next request, and signing in again is refused.
        Assert.Equal(HttpStatusCode.Unauthorized, (await frontDesk.GetAsync("/api/auth/me", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await frontDesk.GetAsync("/api/staff/reservations", Token)).StatusCode);
        var login = await LoginAsync(factory.CreateHttpsClient(), restaurant.AdminEmail);
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        Assert.Equal("restaurant_deactivated", (await login.Content.ReadFromJsonAsync<AuthEndpoints.LoginError>(Token))?.Error);
        // The Superadmin still sees it, and deactivating twice changes nothing.
        Assert.Contains(await ListAsync(superadmin), t => t.Id == restaurant.Id && !t.IsActive);
        Assert.Equal(HttpStatusCode.OK, (await superadmin.PostAsync($"/api/superadmin/tenants/{restaurant.Id}/deactivate", null, Token)).StatusCode);

        var activate = await superadmin.PostAsync($"/api/superadmin/tenants/{restaurant.Id}/activate", null, Token);

        Assert.Equal(HttpStatusCode.OK, activate.StatusCode);
        Assert.True((await activate.Content.ReadFromJsonAsync<SuperadminTenant>(Token))!.IsActive);
        Assert.Contains(await PublicListAsync(guest), t => t.Id == restaurant.Id);
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync($"/api/public/restaurants/{restaurant.Slug}", Token)).StatusCode);
        using var admin = await SignedInClientAsync(restaurant.AdminEmail);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/tenant", Token)).StatusCode);
    }

    [Fact]
    public async Task Deactivating_a_restaurant_does_not_affect_other_restaurants()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4))]);
        using var superadmin = await SignedInClientAsync(Superadmin);
        using var otherAdmin = await SignedInClientAsync("admin@kafana-dunav.test");

        await superadmin.PostAsync($"/api/superadmin/tenants/{restaurant.Id}/deactivate", null, Token);

        Assert.Equal(HttpStatusCode.OK, (await otherAdmin.GetAsync("/api/auth/me", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await superadmin.GetAsync("/api/auth/me", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await superadmin.GetAsync("/api/public/restaurants/kafana-dunav", Token)).StatusCode);
    }

    [Fact]
    public async Task The_admins_of_a_restaurant_are_listed_without_its_other_staff()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4))]);
        using var superadmin = await SignedInClientAsync(Superadmin);
        var second = await CreateAdminAsync(superadmin, restaurant.Id, $"zweiter@{restaurant.Slug}.test");

        var admins = await superadmin.GetFromJsonAsync<List<TenantAdminUser>>($"/api/superadmin/tenants/{restaurant.Id}/admins", Token);

        Assert.NotNull(admins);
        Assert.Equal([restaurant.AdminEmail, second.Email], admins.Select(a => a.Email).Order());
        Assert.DoesNotContain(admins, a => a.Email == restaurant.FrontDeskEmail);
        Assert.Equal(2, (await ListAsync(superadmin)).Single(t => t.Id == restaurant.Id).AdminCount);
    }

    [Fact]
    public async Task Creating_an_admin_validates_the_input()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);
        var tenant = await CreateTenantAsync(superadmin);
        var path = $"/api/superadmin/tenants/{tenant.Id}/admins";

        var taken = await superadmin.PostAsJsonAsync(path, new { email = "admin@zur-linde.test", displayName = "X", password = ApiFactory.Password }, Token);
        var weak = await superadmin.PostAsJsonAsync(path, new { email = $"weak@{tenant.Slug}.test", displayName = "X", password = "abc" }, Token);
        var noName = await superadmin.PostAsJsonAsync(path, new { email = $"noname@{tenant.Slug}.test", displayName = " ", password = ApiFactory.Password }, Token);
        var noEmail = await superadmin.PostAsJsonAsync(path, new { email = "", displayName = "X", password = ApiFactory.Password }, Token);

        Assert.Equal(HttpStatusCode.Conflict, taken.StatusCode);
        Assert.Equal("email_taken", await ErrorAsync(taken));
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        Assert.Equal("password_too_weak", await ErrorAsync(weak));
        Assert.Equal("invalid_name", await ErrorAsync(noName));
        Assert.Equal("invalid_email", await ErrorAsync(noEmail));
        Assert.Equal(0, (await ListAsync(superadmin)).Single(t => t.Id == tenant.Id).AdminCount);
    }

    [Fact]
    public async Task Setting_an_admins_password_lets_them_sign_in_with_it_and_ends_their_sessions()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);
        var tenant = await CreateTenantAsync(superadmin);
        var admin = await CreateAdminAsync(superadmin, tenant.Id, $"admin@{tenant.Slug}.test");
        using var adminSession = await SignedInClientAsync(admin.Email);
        const string newPassword = "Neu5678!";

        var response = await superadmin.PostAsJsonAsync($"/api/superadmin/tenants/{tenant.Id}/admins/{admin.Id}/password", new { password = newPassword }, Token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await adminSession.GetAsync("/api/auth/me", Token)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(factory.CreateHttpsClient(), admin.Email)).StatusCode);
        using var _ = await SignedInClientAsync(admin.Email, newPassword);
        Assert.Equal(HttpStatusCode.OK, (await superadmin.GetAsync("/api/auth/me", Token)).StatusCode);
    }

    [Fact]
    public async Task A_weak_password_is_rejected()
    {
        using var superadmin = await SignedInClientAsync(Superadmin);
        var tenant = await CreateTenantAsync(superadmin);
        var admin = await CreateAdminAsync(superadmin, tenant.Id, $"admin@{tenant.Slug}.test");

        var response = await superadmin.PostAsJsonAsync($"/api/superadmin/tenants/{tenant.Id}/admins/{admin.Id}/password", new { password = "abc" }, Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("password_too_weak", await ErrorAsync(response));
        using var _ = await SignedInClientAsync(admin.Email);
    }

    [Fact]
    public async Task Only_the_passwords_of_the_restaurants_own_admins_can_be_set()
    {
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4))]);
        var other = await TestRestaurants.CreateAsync(factory, [new TestArea("Saal", true, 100, ("1", 4))]);
        using var superadmin = await SignedInClientAsync(Superadmin);
        var otherAdmins = await superadmin.GetFromJsonAsync<List<TenantAdminUser>>($"/api/superadmin/tenants/{other.Id}/admins", Token);
        var otherAdmin = Assert.Single(otherAdmins!);
        var me = await superadmin.GetFromJsonAsync<AuthEndpoints.MeResponse>("/api/auth/me", Token);

        // An admin of another restaurant, and the Superadmin themselves, are not admins of this restaurant.
        var ofOther = await superadmin.PostAsJsonAsync($"/api/superadmin/tenants/{restaurant.Id}/admins/{otherAdmin.Id}/password", new { password = "Neu5678!" }, Token);
        var ofSuperadmin = await superadmin.PostAsJsonAsync($"/api/superadmin/tenants/{restaurant.Id}/admins/{me!.Id}/password", new { password = "Neu5678!" }, Token);

        Assert.Equal(HttpStatusCode.NotFound, ofOther.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, ofSuperadmin.StatusCode);
        using var _ = await SignedInClientAsync(other.AdminEmail);
    }
}
