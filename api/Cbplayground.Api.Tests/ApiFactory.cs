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

    private readonly string databasePath = Path.Combine(Path.GetTempPath(), $"cbplayground-tests-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={databasePath}");
    }

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
        var db = services.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();

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
        File.Delete(databasePath);
    }
}
