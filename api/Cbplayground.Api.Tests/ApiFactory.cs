using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Cbplayground.Api.Tests;

/// <summary>
/// Runs the API in the "Testing" environment (so the cookie is Secure, as in production)
/// against a temporary SQLite file with two restaurants and a few staff users.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    public const string Password = "Test1234!";

    /// <summary>The temporary SQLite file.</summary>
    public string DatabasePath { get; } = Path.Combine(Path.GetTempPath(), $"cbplayground-tests-{Guid.NewGuid():N}.db");

    /// <summary>Temporary folder for the uploaded floor plans.</summary>
    public string UploadsPath { get; } = Path.Combine(Path.GetTempPath(), $"cbplayground-tests-uploads-{Guid.NewGuid():N}");

    /// <summary>Temporary folder for the database backups.</summary>
    public string BackupPath { get; } = Path.Combine(Path.GetTempPath(), $"cbplayground-tests-backups-{Guid.NewGuid():N}");

    /// <summary>Temporary folder for the Data Protection keys.</summary>
    public string KeysPath { get; } = Path.Combine(Path.GetTempPath(), $"cbplayground-tests-keys-{Guid.NewGuid():N}");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={DatabasePath}");
        builder.UseSetting("Uploads:Path", UploadsPath);
        // No scheduled backups during the tests; BackupTests call DatabaseBackup directly.
        builder.UseSetting("Backup:Enabled", "false");
        builder.UseSetting("Backup:Path", BackupPath);
        builder.UseSetting("DataProtection:KeysPath", KeysPath);
        // The tests book, sign in and read far more often from the same client than the real limits allow;
        // the rate limit tests set their own limits.
        builder.UseSetting("RateLimiting:PublicBookings:PermitLimit", PublicBookingLimit.ToString());
        builder.UseSetting("RateLimiting:Login:PermitLimit", LoginLimit.ToString());
        builder.UseSetting("RateLimiting:PublicReads:PermitLimit", PublicReadLimit.ToString());
    }

    /// <summary>Online bookings per client in 10 minutes.</summary>
    protected virtual int PublicBookingLimit => 10_000;

    /// <summary>Sign-in attempts per client in a minute.</summary>
    protected virtual int LoginLimit => 10_000;

    /// <summary>Calls of the public calendar, availability and tables per client in a minute.</summary>
    protected virtual int PublicReadLimit => 10_000;

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);
        using var scope = host.Services.CreateScope();
        SeedAsync(scope.ServiceProvider).GetAwaiter().GetResult();
        return host;
    }

    /// <summary>A client on https (the cookie is Secure) that keeps cookies and does not follow redirects.</summary>
    public HttpClient CreateHttpsClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });

    private static async Task SeedAsync(IServiceProvider services)
    {
        // The API has applied the migrations on startup.
        var db = services.GetRequiredService<AppDbContext>();

        var linde = new Tenant { Name = "Gasthaus zur Linde", Slug = "zur-linde", CreatedAt = DateTime.UtcNow };
        var dunav = new Tenant { Name = "Kafana Dunav", Slug = "kafana-dunav", CreatedAt = DateTime.UtcNow };
        db.Tenants.AddRange(linde, dunav);
        await db.SaveChangesAsync();

        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        await CreateUserAsync(userManager, "superadmin@test.local", Roles.Superadmin, null);
        await CreateUserAsync(userManager, "admin@zur-linde.test", Roles.TenantAdmin, linde.Id);
        await CreateUserAsync(userManager, "frontdesk@zur-linde.test", Roles.FrontDesk, linde.Id);
        await CreateUserAsync(userManager, "admin@kafana-dunav.test", Roles.TenantAdmin, dunav.Id);
        await CreateUserAsync(userManager, "inactive@zur-linde.test", Roles.FrontDesk, linde.Id, isActive: false);
        await CreateUserAsync(userManager, "lockout@zur-linde.test", Roles.FrontDesk, linde.Id);
    }

    private static async Task CreateUserAsync(UserManager<ApplicationUser> userManager, string email, string role, Guid? tenantId, bool isActive = true)
    {
        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            DisplayName = email.Split('@')[0],
            TenantId = tenantId,
            IsActive = isActive,
        };
        var created = await userManager.CreateAsync(user, Password);
        Assert.True(created.Succeeded, string.Join(" ", created.Errors.Select(e => e.Description)));
        var addedToRole = await userManager.AddToRoleAsync(user, role);
        Assert.True(addedToRole.Succeeded, string.Join(" ", addedToRole.Errors.Select(e => e.Description)));
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        SqliteConnection.ClearAllPools();
        File.Delete(DatabasePath);
        if (Directory.Exists(UploadsPath))
        {
            Directory.Delete(UploadsPath, recursive: true);
        }
        if (Directory.Exists(BackupPath))
        {
            Directory.Delete(BackupPath, recursive: true);
        }
        if (Directory.Exists(KeysPath))
        {
            Directory.Delete(KeysPath, recursive: true);
        }
    }
}
