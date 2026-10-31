using System.Collections.Concurrent;
using System.Net;
using System.Text;
using Cbplayground.Api.Reservations;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Cbplayground.Api.Tests;

/// <summary>Requests the endpoints cannot bind and unexpected errors, both answered with <c>{ "error" }</c>.</summary>
public class ErrorResponseTests(ErrorResponseTests.FailingApiFactory factory) : IClassFixture<ErrorResponseTests.FailingApiFactory>
{
    /// <summary>The API with a duration policy that fails, like a bug or a violated tenant rule would.</summary>
    public class FailingApiFactory : ApiFactory
    {
        /// <summary>The exceptions logged as errors.</summary>
        public ConcurrentQueue<Exception> LoggedErrors { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureLogging(logging => logging.AddProvider(new ErrorLoggerProvider(LoggedErrors)));
            builder.ConfigureTestServices(services => services.AddScoped<IReservationDurationPolicy, FailingDurationPolicy>());
        }
    }

    private sealed class ErrorLoggerProvider(ConcurrentQueue<Exception> errors) : ILoggerProvider, ILogger
    {
        public ILogger CreateLogger(string categoryName) => this;

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Error;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel >= LogLevel.Error && exception is not null)
            {
                errors.Enqueue(exception);
            }
        }

        public void Dispose()
        {
        }
    }

    private class FailingDurationPolicy : IReservationDurationPolicy
    {
        public Task<int> GetDurationAsync(int guests, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("Reservation cannot be created for another tenant.");
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("/api/public/restaurants/zur-linde/availability?date=2026-12-01")]
    [InlineData("/api/public/restaurants/zur-linde/availability?date=2026-13-45&guests=2")]
    [InlineData("/api/public/restaurants/zur-linde/calendar?month=2026-12&guests=two")]
    [InlineData("/api/public/restaurants/zur-linde/tables?date=yesterday&time=18:00&guests=2")]
    public async Task A_missing_or_invalid_parameter_is_an_invalid_request(string path)
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.GetAsync(path, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("""{"error":"invalid_request"}""", await response.Content.ReadAsStringAsync(Ct));
        // The client's mistake, not an error of the API.
        Assert.DoesNotContain(factory.LoggedErrors, e => e is BadHttpRequestException);
    }

    [Theory]
    [InlineData("")]
    [InlineData("{ \"email\": ")]
    [InlineData("""{ "email": 42 }""")]
    public async Task An_unreadable_body_is_an_invalid_request(string body)
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.PostAsync("/api/auth/login", new StringContent(body, Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("""{"error":"invalid_request"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task An_unexpected_error_is_a_server_error_without_details()
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.GetAsync("/api/public/restaurants/zur-linde/availability?date=2026-12-01&guests=2", Ct);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("""{"error":"server_error"}""", await response.Content.ReadAsStringAsync(Ct));
        Assert.Contains(factory.LoggedErrors, e => e.Message == "Reservation cannot be created for another tenant.");
    }
}
