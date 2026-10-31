using System.Net;
using System.Net.Http.Json;
using Cbplayground.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Cbplayground.Api.Tests;

/// <summary>Starting the API outside Development and starting it again.</summary>
public class StartupTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task An_empty_database_is_migrated_in_production_without_demo_data()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"cbplayground-tests-production-{Guid.NewGuid():N}");
        try
        {
            // The database folder does not exist yet either.
            using (var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Production");
                builder.UseSetting("ConnectionStrings:Default", $"Data Source={Path.Combine(directory, "data", "cbplayground.db")}");
                builder.UseSetting("Uploads:Path", Path.Combine(directory, "uploads"));
                builder.UseSetting("Backup:Enabled", "false");
                builder.UseSetting("Backup:Path", Path.Combine(directory, "backups"));
                builder.UseSetting("DataProtection:KeysPath", Path.Combine(directory, "keys"));
            }))
            {
                using var scope = factory.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                Assert.Equal(db.Database.GetMigrations(), await db.Database.GetAppliedMigrationsAsync(Ct));
                Assert.Equal(0, await db.Tenants.CountAsync(Ct));
                Assert.Equal(0, await db.Users.CountAsync(Ct));
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task Signed_in_staff_stay_signed_in_after_a_restart()
    {
        using var factory = new ApiFactory();
        var options = new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false };
        using var client = factory.CreateClient(options);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = "admin@zur-linde.test", password = ApiFactory.Password }, Ct);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = Assert.Single(login.Headers.GetValues("Set-Cookie")).Split(';')[0];
        Assert.NotEmpty(Directory.GetFiles(factory.KeysPath, "key-*.xml"));

        // A second API on the same database and keys folder, as after a restart.
        using var restarted = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("ConnectionStrings:Default", $"Data Source={factory.DatabasePath}");
            builder.UseSetting("Uploads:Path", factory.UploadsPath);
            builder.UseSetting("Backup:Enabled", "false");
            builder.UseSetting("Backup:Path", factory.BackupPath);
            builder.UseSetting("DataProtection:KeysPath", factory.KeysPath);
        });
        using var restartedClient = restarted.CreateClient(options);
        using var me = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        me.Headers.Add("Cookie", cookie);

        Assert.Equal(HttpStatusCode.OK, (await restartedClient.SendAsync(me, Ct)).StatusCode);
    }
}
