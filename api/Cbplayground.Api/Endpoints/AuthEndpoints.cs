using Cbplayground.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Sign-in for staff users. There is deliberately no registration endpoint:
/// staff users are created by a Tenant Admin (or the development seed).
/// </summary>
public static class AuthEndpoints
{
    public record LoginRequest(string? Email, string? Password);

    /// <summary>Why a login failed: "invalid_credentials", "locked_out" or "deactivated".</summary>
    public record LoginError(string Error);

    public record MeTenant(Guid Id, string Name, string Slug);

    public record MeResponse(string Id, string Email, string DisplayName, string Role, MeTenant? Tenant);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/login", async (LoginRequest request, UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager, AppDbContext db) =>
        {
            var invalidCredentials = Results.Json(new LoginError("invalid_credentials"), statusCode: StatusCodes.Status401Unauthorized);
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password))
            {
                return invalidCredentials;
            }

            var user = await userManager.FindByEmailAsync(request.Email);
            if (user is null)
            {
                return invalidCredentials;
            }

            // Counts failed attempts and locks the account after too many of them (see the lockout options in Program.cs).
            var result = await signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
            if (result.IsLockedOut)
            {
                return Results.Json(new LoginError("locked_out"), statusCode: StatusCodes.Status401Unauthorized);
            }
            if (!result.Succeeded)
            {
                return invalidCredentials;
            }
            if (!user.IsActive)
            {
                return Results.Json(new LoginError("deactivated"), statusCode: StatusCodes.Status401Unauthorized);
            }

            await signInManager.SignInAsync(user, isPersistent: false);
            return Results.Ok(await ToMeResponse(user, userManager, db));
        });

        group.MapPost("/logout", async (SignInManager<ApplicationUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return Results.NoContent();
        });

        group.MapGet("/me", async (HttpContext httpContext, UserManager<ApplicationUser> userManager, AppDbContext db) =>
        {
            var user = await userManager.GetUserAsync(httpContext.User);
            if (user is null || !user.IsActive)
            {
                return Results.Unauthorized();
            }
            return Results.Ok(await ToMeResponse(user, userManager, db));
        }).RequireAuthorization();
    }

    private static async Task<MeResponse> ToMeResponse(ApplicationUser user, UserManager<ApplicationUser> userManager, AppDbContext db)
    {
        var role = (await userManager.GetRolesAsync(user)).Single();
        var tenant = user.TenantId is { } tenantId
            ? await db.Tenants.Where(t => t.Id == tenantId).Select(t => new MeTenant(t.Id, t.Name, t.Slug)).SingleAsync()
            : null;
        return new MeResponse(user.Id, user.Email!, user.DisplayName, role, tenant);
    }
}
