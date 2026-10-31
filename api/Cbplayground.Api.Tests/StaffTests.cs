using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Endpoints;

namespace Cbplayground.Api.Tests;

/// <summary>
/// Staff management under /api/admin/staff. The tests on the shared factory only change users they create themselves;
/// tests that change the seeded admins run on a factory of their own.
/// </summary>
public class StaffTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static CancellationToken Token => TestContext.Current.CancellationToken;

    private static async Task<HttpClient> SignedInClientAsync(ApiFactory apiFactory, string email, string password = ApiFactory.Password)
    {
        var client = apiFactory.CreateHttpsClient();
        var response = await LoginAsync(client, email, password);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string email, string password = ApiFactory.Password) =>
        client.PostAsJsonAsync("/api/auth/login", new { email, password }, Token);

    private static async Task<string?> ErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<StaffEndpoints.StaffError>(Token))?.Error;

    private static async Task<StaffEndpoints.StaffUser> CreateAsync(HttpClient admin, string email, string role = "FrontDesk", string password = ApiFactory.Password)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/staff", new { email, displayName = $"Name of {email}", role, password }, Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var user = await response.Content.ReadFromJsonAsync<StaffEndpoints.StaffUser>(Token);
        Assert.NotNull(user);
        return user;
    }

    private static async Task<List<StaffEndpoints.StaffUser>> ListAsync(HttpClient admin) =>
        (await admin.GetFromJsonAsync<List<StaffEndpoints.StaffUser>>("/api/admin/staff", Token))!;

    [Theory]
    [InlineData("GET", "/api/admin/staff")]
    [InlineData("POST", "/api/admin/staff")]
    [InlineData("PUT", "/api/admin/staff/some-id")]
    [InlineData("POST", "/api/admin/staff/some-id/deactivate")]
    [InlineData("POST", "/api/admin/staff/some-id/activate")]
    [InlineData("POST", "/api/admin/staff/some-id/password")]
    public async Task Front_desk_users_get_403_on_every_staff_endpoint(string method, string path)
    {
        using var client = await SignedInClientAsync(factory, "frontdesk@zur-linde.test");

        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method != "GET")
        {
            request.Content = JsonContent.Create(new { email = "x@zur-linde.test", displayName = "X", role = "TenantAdmin", password = ApiFactory.Password });
        }
        var response = await client.SendAsync(request, Token);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Staff_api_returns_401_without_login()
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.GetAsync("/api/admin/staff", Token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_tenant_admin_only_sees_the_users_of_their_restaurant()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");

        var users = await ListAsync(admin);

        Assert.Contains(users, u => u.Email == "admin@zur-linde.test" && u.Role == "TenantAdmin" && u.IsActive);
        Assert.Contains(users, u => u.Email == "frontdesk@zur-linde.test" && u.Role == "FrontDesk");
        Assert.Contains(users, u => u.Email == "inactive@zur-linde.test" && !u.IsActive);
        Assert.All(users, u => Assert.EndsWith("@zur-linde.test", u.Email));
    }

    [Fact]
    public async Task A_new_front_desk_user_can_sign_in_right_away()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");

        var created = await CreateAsync(admin, "new-frontdesk@zur-linde.test", password: "Start1234!");

        Assert.Equal("FrontDesk", created.Role);
        Assert.True(created.IsActive);
        Assert.Contains(await ListAsync(admin), u => u.Id == created.Id);

        using var client = factory.CreateHttpsClient();
        var login = await LoginAsync(client, "new-frontdesk@zur-linde.test", "Start1234!");
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var me = await login.Content.ReadFromJsonAsync<AuthEndpoints.MeResponse>(Token);
        Assert.Equal("FrontDesk", me?.Role);
        Assert.Equal("zur-linde", me?.Tenant?.Slug);
    }

    [Fact]
    public async Task A_new_user_always_belongs_to_the_admins_restaurant()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");
        var tenants = await admin.GetFromJsonAsync<List<TenantEndpoints.TenantResponse>>("/api/tenants", Token);
        var dunav = tenants!.Single(t => t.Slug == "kafana-dunav");

        var response = await admin.PostAsJsonAsync("/api/admin/staff",
            new { email = "planted@zur-linde.test", displayName = "Planted", role = "FrontDesk", password = ApiFactory.Password, tenantId = dunav.Id }, Token);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var client = await SignedInClientAsync(factory, "planted@zur-linde.test");
        var me = await client.GetFromJsonAsync<AuthEndpoints.MeResponse>("/api/auth/me", Token);
        Assert.Equal("zur-linde", me?.Tenant?.Slug);
    }

    [Fact]
    public async Task Creating_a_user_with_a_taken_email_fails()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");

        // The email belongs to a user of another restaurant: emails are unique across all restaurants.
        var response = await admin.PostAsJsonAsync("/api/admin/staff",
            new { email = "admin@kafana-dunav.test", displayName = "Copy", role = "FrontDesk", password = ApiFactory.Password }, Token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("email_taken", await ErrorAsync(response));
    }

    [Fact]
    public async Task Creating_a_user_with_a_weak_password_fails()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");

        var response = await admin.PostAsJsonAsync("/api/admin/staff",
            new { email = "weak@zur-linde.test", displayName = "Weak", role = "FrontDesk", password = "123" }, Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("password_too_weak", await ErrorAsync(response));
        Assert.DoesNotContain(await ListAsync(admin), u => u.Email == "weak@zur-linde.test");
    }

    [Theory]
    [InlineData("Superadmin")]
    [InlineData("Guest")]
    [InlineData(null)]
    public async Task Only_tenant_admin_and_front_desk_can_be_given(string? role)
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");

        var response = await admin.PostAsJsonAsync("/api/admin/staff",
            new { email = $"role-{role}@zur-linde.test", displayName = "Role", role, password = ApiFactory.Password }, Token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_role", await ErrorAsync(response));
    }

    [Fact]
    public async Task A_deactivated_user_is_signed_out_and_cannot_sign_in_until_activated()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");
        // An admin, so the session can be checked on an endpoint that does not look at IsActive itself.
        // The user ends deactivated, so the restaurant keeps its single active seeded admin for the other tests.
        var user = await CreateAsync(admin, "to-deactivate@zur-linde.test", role: "TenantAdmin");
        using var session = await SignedInClientAsync(factory, "to-deactivate@zur-linde.test");
        Assert.Equal(HttpStatusCode.OK, (await session.GetAsync("/api/admin/staff", Token)).StatusCode);

        var deactivated = await admin.PostAsync($"/api/admin/staff/{user.Id}/deactivate", null, Token);

        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        Assert.False((await deactivated.Content.ReadFromJsonAsync<StaffEndpoints.StaffUser>(Token))?.IsActive);
        Assert.Equal(HttpStatusCode.Unauthorized, (await session.GetAsync("/api/admin/staff", Token)).StatusCode);
        using var client = factory.CreateHttpsClient();
        var login = await LoginAsync(client, "to-deactivate@zur-linde.test");
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        Assert.Equal("deactivated", (await login.Content.ReadFromJsonAsync<AuthEndpoints.LoginError>(Token))?.Error);

        var activated = await admin.PostAsync($"/api/admin/staff/{user.Id}/activate", null, Token);

        Assert.Equal(HttpStatusCode.OK, activated.StatusCode);
        Assert.True((await activated.Content.ReadFromJsonAsync<StaffEndpoints.StaffUser>(Token))?.IsActive);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, "to-deactivate@zur-linde.test")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/admin/staff/{user.Id}/deactivate", null, Token)).StatusCode);
    }

    [Fact]
    public async Task An_admin_cannot_deactivate_themselves()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");
        var self = (await ListAsync(admin)).Single(u => u.Email == "admin@zur-linde.test");

        var response = await admin.PostAsync($"/api/admin/staff/{self.Id}/deactivate", null, Token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("cannot_deactivate_self", await ErrorAsync(response));
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/staff", Token)).StatusCode);
    }

    [Fact]
    public async Task Name_and_role_can_be_changed()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");
        var user = await CreateAsync(admin, "to-promote@zur-linde.test");
        using var session = await SignedInClientAsync(factory, "to-promote@zur-linde.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await session.GetAsync("/api/admin/staff", Token)).StatusCode);

        var response = await admin.PutAsJsonAsync($"/api/admin/staff/{user.Id}", new { displayName = "  Promoted  ", role = "TenantAdmin" }, Token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = Assert.Single(await ListAsync(admin), u => u.Id == user.Id);
        Assert.Equal("Promoted", updated.DisplayName);
        Assert.Equal("TenantAdmin", updated.Role);
        // The new role applies to the existing session right away.
        Assert.Equal(HttpStatusCode.OK, (await session.GetAsync("/api/admin/staff", Token)).StatusCode);

        // Back to front desk, so the restaurant keeps its single seeded admin for the other tests.
        var demoted = await admin.PutAsJsonAsync($"/api/admin/staff/{user.Id}", new { displayName = "Promoted", role = "FrontDesk" }, Token);
        Assert.Equal(HttpStatusCode.OK, demoted.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await session.GetAsync("/api/admin/staff", Token)).StatusCode);
    }

    [Fact]
    public async Task Setting_a_password_replaces_the_old_one_and_ends_the_users_sessions()
    {
        using var admin = await SignedInClientAsync(factory, "admin@zur-linde.test");
        var user = await CreateAsync(admin, "new-password@zur-linde.test");
        using var session = await SignedInClientAsync(factory, "new-password@zur-linde.test");

        var weak = await admin.PostAsJsonAsync($"/api/admin/staff/{user.Id}/password", new { password = "abc" }, Token);
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        Assert.Equal("password_too_weak", await ErrorAsync(weak));
        Assert.Equal(HttpStatusCode.OK, (await session.GetAsync("/api/auth/me", Token)).StatusCode);

        var response = await admin.PostAsJsonAsync($"/api/admin/staff/{user.Id}/password", new { password = "Changed1234!" }, Token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await session.GetAsync("/api/auth/me", Token)).StatusCode);
        using var client = factory.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, "new-password@zur-linde.test")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, "new-password@zur-linde.test", "Changed1234!")).StatusCode);
    }

    [Fact]
    public async Task Users_of_another_restaurant_can_neither_be_seen_nor_changed()
    {
        using var lindeAdmin = await SignedInClientAsync(factory, "admin@zur-linde.test");
        var lindeUser = await CreateAsync(lindeAdmin, "foreign-target@zur-linde.test");
        using var dunavAdmin = await SignedInClientAsync(factory, "admin@kafana-dunav.test");

        Assert.DoesNotContain(await ListAsync(dunavAdmin), u => u.Id == lindeUser.Id);
        var responses = new[]
        {
            await dunavAdmin.PutAsJsonAsync($"/api/admin/staff/{lindeUser.Id}", new { displayName = "Taken over", role = "TenantAdmin" }, Token),
            await dunavAdmin.PostAsync($"/api/admin/staff/{lindeUser.Id}/deactivate", null, Token),
            await dunavAdmin.PostAsync($"/api/admin/staff/{lindeUser.Id}/activate", null, Token),
            await dunavAdmin.PostAsJsonAsync($"/api/admin/staff/{lindeUser.Id}/password", new { password = "Taken1234!" }, Token),
        };

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.NotFound, r.StatusCode));
        var unchanged = Assert.Single(await ListAsync(lindeAdmin), u => u.Id == lindeUser.Id);
        Assert.Equal(lindeUser, unchanged);
        using var client = factory.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, "foreign-target@zur-linde.test")).StatusCode);
    }

    [Fact]
    public async Task The_last_active_tenant_admin_cannot_be_demoted()
    {
        using var isolated = new ApiFactory();
        using var admin = await SignedInClientAsync(isolated, "admin@zur-linde.test");
        var self = (await ListAsync(admin)).Single(u => u.Email == "admin@zur-linde.test");

        var demoted = await admin.PutAsJsonAsync($"/api/admin/staff/{self.Id}", new { displayName = "Admin", role = "FrontDesk" }, Token);

        Assert.Equal(HttpStatusCode.Conflict, demoted.StatusCode);
        Assert.Equal("last_admin", await ErrorAsync(demoted));

        // An inactive second admin does not count.
        var second = await CreateAsync(admin, "second-admin@zur-linde.test", role: "TenantAdmin");
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/admin/staff/{second.Id}/deactivate", null, Token)).StatusCode);
        demoted = await admin.PutAsJsonAsync($"/api/admin/staff/{self.Id}", new { displayName = "Admin", role = "FrontDesk" }, Token);
        Assert.Equal("last_admin", await ErrorAsync(demoted));

        // With a second active admin, the first one can step down.
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/admin/staff/{second.Id}/activate", null, Token)).StatusCode);
        demoted = await admin.PutAsJsonAsync($"/api/admin/staff/{self.Id}", new { displayName = "Admin", role = "FrontDesk" }, Token);
        Assert.Equal(HttpStatusCode.OK, demoted.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/admin/staff", Token)).StatusCode);

        // Now the second admin is the last one and cannot be demoted either.
        using var secondAdmin = await SignedInClientAsync(isolated, "second-admin@zur-linde.test");
        var response = await secondAdmin.PutAsJsonAsync($"/api/admin/staff/{second.Id}", new { displayName = "Second", role = "FrontDesk" }, Token);
        Assert.Equal("last_admin", await ErrorAsync(response));
    }

    [Fact]
    public async Task An_admin_who_sets_their_own_password_stays_signed_in()
    {
        using var isolated = new ApiFactory();
        using var admin = await SignedInClientAsync(isolated, "admin@zur-linde.test");
        var self = (await ListAsync(admin)).Single(u => u.Email == "admin@zur-linde.test");

        var response = await admin.PostAsJsonAsync($"/api/admin/staff/{self.Id}/password", new { password = "Own1234!" }, Token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/staff", Token)).StatusCode);
        using var client = isolated.CreateHttpsClient();
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, "admin@zur-linde.test", "Own1234!")).StatusCode);
    }
}
