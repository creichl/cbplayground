using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Data;

/// <summary>Creates the demo staff users from the "Seed:Users" section of appsettings.Development.json.</summary>
public static class DevelopmentSeed
{
    public record SeedUser(string Email, string Password, string DisplayName, string Role, string? TenantSlug = null);

    /// <summary>Adds every configured user that does not exist yet; existing users are left as they are.</summary>
    public static async Task SeedUsersAsync(IServiceProvider services, IConfiguration configuration)
    {
        var db = services.GetRequiredService<AppDbContext>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var users = configuration.GetSection("Seed:Users").Get<List<SeedUser>>() ?? [];

        foreach (var seedUser in users)
        {
            if (await userManager.FindByEmailAsync(seedUser.Email) is not null)
            {
                continue;
            }

            Guid? tenantId = null;
            if (seedUser.TenantSlug is not null)
            {
                var tenant = await db.Tenants.SingleOrDefaultAsync(t => t.Slug == seedUser.TenantSlug)
                    ?? throw new InvalidOperationException($"Seed user {seedUser.Email}: there is no tenant with the slug '{seedUser.TenantSlug}'.");
                tenantId = tenant.Id;
            }

            var user = new ApplicationUser
            {
                UserName = seedUser.Email,
                Email = seedUser.Email,
                EmailConfirmed = true,
                DisplayName = seedUser.DisplayName,
                TenantId = tenantId,
            };
            ThrowOnError(await userManager.CreateAsync(user, seedUser.Password), seedUser.Email);
            ThrowOnError(await userManager.AddToRoleAsync(user, seedUser.Role), seedUser.Email);
        }
    }

    private static void ThrowOnError(IdentityResult result, string email)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException($"Seed user {email}: {string.Join(" ", result.Errors.Select(e => e.Description))}");
        }
    }
}
