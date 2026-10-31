using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Endpoints;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Cbplayground.Api.Tests;

/// <summary>The rate limits of the sign-in and of the public calendar, availability and tables, per client IP.</summary>
public class RateLimitTests
{
    /// <summary>
    /// The API with small limits. Every request comes from <paramref name="remoteIp"/>, like from a reverse proxy;
    /// <paramref name="forwardedHeaders"/> switches the forwarded headers on, with <paramref name="knownProxy"/> as trusted proxy.
    /// </summary>
    private class LimitedApiFactory(string remoteIp = "127.0.0.1", bool forwardedHeaders = false, string? knownProxy = null) : ApiFactory
    {
        protected override int LoginLimit => 3;

        protected override int PublicReadLimit => 2;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("ForwardedHeaders:Enabled", forwardedHeaders.ToString());
            if (knownProxy is not null)
            {
                builder.UseSetting("ForwardedHeaders:KnownProxies:0", knownProxy);
            }
            builder.ConfigureTestServices(services => services.AddSingleton<IStartupFilter>(new RemoteIpStartupFilter(IPAddress.Parse(remoteIp))));
        }
    }

    /// <summary>The test server has no remote address; this sets one before the API's own middleware runs.</summary>
    private class RemoteIpStartupFilter(IPAddress remoteIp) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((context, nextMiddleware) =>
            {
                context.Connection.RemoteIpAddress = remoteIp;
                return nextMiddleware(context);
            });
            next(app);
        };
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<HttpResponseMessage> LoginAsync(HttpClient client, string password, string? forwardedFor = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "frontdesk@zur-linde.test", password }),
        };
        if (forwardedFor is not null)
        {
            request.Headers.Add("X-Forwarded-For", forwardedFor);
        }
        return await client.SendAsync(request, Ct);
    }

    private static async Task<string?> ErrorOf(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ErrorResponse>(Ct))?.Error;
    }

    [Fact]
    public async Task Too_many_sign_in_attempts_from_one_address_are_answered_with_429()
    {
        using var factory = new LimitedApiFactory();
        using var client = factory.CreateHttpsClient();

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, "wrong")).StatusCode);
        }

        // Also with the right password: the account is not locked, the address is limited.
        Assert.Equal("too_many_requests", await ErrorOf(await LoginAsync(client, ApiFactory.Password), HttpStatusCode.TooManyRequests));
    }

    [Fact]
    public async Task The_public_calendar_availability_and_tables_share_a_limit_per_address()
    {
        using var factory = new LimitedApiFactory();
        var restaurant = await TestRestaurants.CreateAsync(factory, [new TestArea("Gaststube", true, 100, ("1", 4))]);
        using var client = factory.CreateHttpsClient();
        var date = TestRestaurants.NextOpenDay(factory);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/public/restaurants/{restaurant.Slug}/calendar?month={date:yyyy-MM}&guests=2", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/public/restaurants/{restaurant.Slug}/availability?date={date:yyyy-MM-dd}&guests=2", Ct)).StatusCode);

        Assert.Equal("too_many_requests", await ErrorOf(
            await client.GetAsync($"/api/public/restaurants/{restaurant.Slug}/calendar?month={date:yyyy-MM}&guests=2", Ct), HttpStatusCode.TooManyRequests));
        // The restaurant itself is not limited.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/public/restaurants/{restaurant.Slug}", Ct)).StatusCode);
    }

    [Theory]
    // Forwarded headers from a trusted proxy: every client has a counter of its own.
    [InlineData(true, "10.0.0.5", false)]
    // From a proxy that is not trusted, the headers are ignored: all clients share the proxy's counter.
    [InlineData(true, null, true)]
    // Without forwarded headers, all clients share the proxy's counter.
    [InlineData(false, "10.0.0.5", true)]
    public async Task Behind_a_proxy_the_sign_in_limit_counts_per_forwarded_client(bool forwardedHeaders, string? knownProxy, bool secondClientLimited)
    {
        using var factory = new LimitedApiFactory("10.0.0.5", forwardedHeaders, knownProxy);
        using var client = factory.CreateHttpsClient();

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, "wrong", forwardedFor: "203.0.113.1")).StatusCode);
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, (await LoginAsync(client, "wrong", forwardedFor: "203.0.113.1")).StatusCode);

        var secondClient = await LoginAsync(client, ApiFactory.Password, forwardedFor: "203.0.113.2");
        Assert.Equal(secondClientLimited ? HttpStatusCode.TooManyRequests : HttpStatusCode.OK, secondClient.StatusCode);
    }
}
