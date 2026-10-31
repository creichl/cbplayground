using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Endpoints;

namespace Cbplayground.Api.Tests;

public class AuthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string email, string password = ApiFactory.Password) =>
        client.PostAsJsonAsync("/api/auth/login", new { email, password }, TestContext.Current.CancellationToken);

    private static async Task<string?> LoginErrorAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<AuthEndpoints.LoginError>(TestContext.Current.CancellationToken))?.Error;

    [Fact]
    public async Task Login_returns_the_user_with_role_and_tenant()
    {
        using var client = factory.CreateHttpsClient();

        var response = await LoginAsync(client, "admin@zur-linde.test");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = await response.Content.ReadFromJsonAsync<AuthEndpoints.MeResponse>(TestContext.Current.CancellationToken);
        Assert.NotNull(me);
        Assert.Equal("admin@zur-linde.test", me.Email);
        Assert.Equal("admin", me.DisplayName);
        Assert.Equal("TenantAdmin", me.Role);
        Assert.Equal("Gasthaus zur Linde", me.Tenant?.Name);
        Assert.Equal("zur-linde", me.Tenant?.Slug);
    }

    [Fact]
    public async Task Login_sets_an_HttpOnly_SameSite_Strict_Secure_cookie()
    {
        using var client = factory.CreateHttpsClient();

        var response = await LoginAsync(client, "frontdesk@zur-linde.test");

        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Login_with_a_wrong_password_fails()
    {
        using var client = factory.CreateHttpsClient();

        var response = await LoginAsync(client, "frontdesk@zur-linde.test", "wrong");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_credentials", await LoginErrorAsync(response));
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Login_with_an_unknown_email_fails()
    {
        using var client = factory.CreateHttpsClient();

        var response = await LoginAsync(client, "nobody@zur-linde.test");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_credentials", await LoginErrorAsync(response));
    }

    [Fact]
    public async Task Login_is_locked_out_after_five_failed_attempts()
    {
        using var client = factory.CreateHttpsClient();

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            Assert.Equal("invalid_credentials", await LoginErrorAsync(await LoginAsync(client, "lockout@zur-linde.test", "wrong")));
        }
        Assert.Equal("locked_out", await LoginErrorAsync(await LoginAsync(client, "lockout@zur-linde.test", "wrong")));

        // Even the correct password is rejected while the account is locked.
        var response = await LoginAsync(client, "lockout@zur-linde.test");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("locked_out", await LoginErrorAsync(response));
    }

    [Fact]
    public async Task Login_of_a_deactivated_user_fails()
    {
        using var client = factory.CreateHttpsClient();

        var response = await LoginAsync(client, "inactive@zur-linde.test");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("deactivated", await LoginErrorAsync(response));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Me_without_login_returns_401_without_redirect()
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.GetAsync("/api/auth/me", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Me_returns_the_signed_in_user()
    {
        using var client = factory.CreateHttpsClient();
        await LoginAsync(client, "frontdesk@zur-linde.test");

        var me = await client.GetFromJsonAsync<AuthEndpoints.MeResponse>("/api/auth/me", TestContext.Current.CancellationToken);

        Assert.NotNull(me);
        Assert.Equal("frontdesk@zur-linde.test", me.Email);
        Assert.Equal("FrontDesk", me.Role);
        Assert.Equal("Gasthaus zur Linde", me.Tenant?.Name);
    }

    [Fact]
    public async Task Me_of_the_superadmin_has_no_tenant()
    {
        using var client = factory.CreateHttpsClient();
        await LoginAsync(client, "superadmin@test.local");

        var me = await client.GetFromJsonAsync<AuthEndpoints.MeResponse>("/api/auth/me", TestContext.Current.CancellationToken);

        Assert.NotNull(me);
        Assert.Equal("Superadmin", me.Role);
        Assert.Null(me.Tenant);
    }

    [Fact]
    public async Task Logout_ends_the_session()
    {
        using var client = factory.CreateHttpsClient();
        await LoginAsync(client, "frontdesk@zur-linde.test");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me", TestContext.Current.CancellationToken)).StatusCode);

        var logout = await client.PostAsync("/api/auth/logout", null, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Admin_api_returns_401_without_login()
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.GetAsync("/api/admin/tenant", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Admin_api_returns_403_for_front_desk_users()
    {
        using var client = factory.CreateHttpsClient();
        await LoginAsync(client, "frontdesk@zur-linde.test");

        var response = await client.GetAsync("/api/admin/tenant", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Admin_api_returns_the_tenant_admins_own_restaurant()
    {
        using var client = factory.CreateHttpsClient();
        await LoginAsync(client, "admin@kafana-dunav.test");

        var tenant = await client.GetFromJsonAsync<TenantEndpoints.TenantResponse>("/api/admin/tenant", TestContext.Current.CancellationToken);

        Assert.Equal("Kafana Dunav", tenant?.Name);
    }

    [Theory]
    [InlineData("/api/auth/register")]
    [InlineData("/api/register")]
    [InlineData("/register")]
    public async Task There_is_no_registration_endpoint(string path)
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.PostAsJsonAsync(path, new { email = "new@test.local", password = ApiFactory.Password }, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
