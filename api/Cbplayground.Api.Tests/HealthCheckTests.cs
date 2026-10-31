using System.Net;
using Microsoft.Data.Sqlite;

namespace Cbplayground.Api.Tests;

public sealed class HealthCheckTests : IDisposable
{
    private readonly ApiFactory factory = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task The_health_check_is_ok_while_the_database_can_be_reached()
    {
        using var client = factory.CreateHttpsClient();

        var response = await client.GetAsync("/api/health", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("""{"status":"ok"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task The_health_check_answers_503_when_the_database_cannot_be_reached()
    {
        using var client = factory.CreateHttpsClient();
        SqliteConnection.ClearAllPools();
        File.Delete(factory.DatabasePath);

        var response = await client.GetAsync("/api/health", Ct);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("""{"error":"unhealthy"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    public void Dispose() => factory.Dispose();
}
