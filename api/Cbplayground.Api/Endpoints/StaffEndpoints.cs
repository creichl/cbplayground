using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Staff management of the admin area: a Tenant Admin lists, creates and changes the users of their own restaurant.
/// The restaurant is always the signed-in user's (<see cref="ITenantContext"/>), never a value from the request;
/// users of other restaurants are answered with 404.
/// </summary>
public static class StaffEndpoints
{
    /// <summary>The roles a Tenant Admin may give.</summary>
    private static readonly string[] AssignableRoles = [Roles.TenantAdmin, Roles.FrontDesk];

    public record StaffUser(string Id, string Email, string DisplayName, string Role, bool IsActive);

    public record CreateStaffRequest(string? Email, string? DisplayName, string? Role, string? Password);

    public record UpdateStaffRequest(string? DisplayName, string? Role);

    public record SetPasswordRequest(string? Password);

    /// <summary>
    /// Why a request failed: "invalid_email", "invalid_name", "invalid_role", "password_too_weak" (400),
    /// "email_taken", "last_admin" or "cannot_deactivate_self" (409).
    /// </summary>
    public record StaffError(string Error);

    public static void MapStaffEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/staff").RequireAuthorization(Policies.RequireTenantAdmin);

        group.MapGet("/", async (ITenantContext tenantContext, AppDbContext db) =>
        {
            var tenantId = RequireTenant(tenantContext);
            return await db.Users
                .Where(u => u.TenantId == tenantId)
                .OrderBy(u => u.DisplayName)
                .Select(u => new StaffUser(
                    u.Id,
                    u.Email!,
                    u.DisplayName,
                    db.UserRoles.Where(ur => ur.UserId == u.Id).Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.Name!).First(),
                    u.IsActive))
                .ToListAsync();
        });

        group.MapPost("/", async (CreateStaffRequest request, ITenantContext tenantContext, UserManager<ApplicationUser> userManager, AppDbContext db) =>
        {
            var tenantId = RequireTenant(tenantContext);
            var email = request.Email?.Trim() ?? "";
            var displayName = request.DisplayName?.Trim() ?? "";
            if (email.Length == 0)
            {
                return BadRequest("invalid_email");
            }
            if (displayName.Length == 0)
            {
                return BadRequest("invalid_name");
            }
            if (request.Role is null || !AssignableRoles.Contains(request.Role))
            {
                return BadRequest("invalid_role");
            }

            await using var transaction = await db.Database.BeginTransactionAsync();
            var user = new ApplicationUser
            {
                UserName = email,
                Email = email,
                DisplayName = displayName,
                TenantId = tenantId,
            };
            var created = await userManager.CreateAsync(user, request.Password ?? "");
            if (!created.Succeeded)
            {
                return IdentityError(created);
            }
            var addedToRole = await userManager.AddToRoleAsync(user, request.Role);
            if (!addedToRole.Succeeded)
            {
                return IdentityError(addedToRole);
            }
            await transaction.CommitAsync();

            return Results.Created($"/api/admin/staff/{user.Id}", new StaffUser(user.Id, user.Email, user.DisplayName, request.Role, user.IsActive));
        });

        group.MapPut("/{id}", async (string id, UpdateStaffRequest request, ITenantContext tenantContext, UserManager<ApplicationUser> userManager, AppDbContext db) =>
        {
            var tenantId = RequireTenant(tenantContext);
            var displayName = request.DisplayName?.Trim() ?? "";
            if (displayName.Length == 0)
            {
                return BadRequest("invalid_name");
            }
            if (request.Role is null || !AssignableRoles.Contains(request.Role))
            {
                return BadRequest("invalid_role");
            }

            // The transaction keeps two admins from demoting each other at the same time (SQLite's BEGIN IMMEDIATE).
            await using var transaction = await db.Database.BeginTransactionAsync();
            var user = await FindStaffUserAsync(db, tenantId, id);
            if (user is null)
            {
                return Results.NotFound();
            }

            var role = await RoleOfAsync(userManager, user);
            if (role == Roles.TenantAdmin && request.Role != Roles.TenantAdmin && user.IsActive
                && await CountActiveTenantAdminsAsync(db, tenantId) <= 1)
            {
                return Conflict("last_admin");
            }

            user.DisplayName = displayName;
            var updated = await userManager.UpdateAsync(user);
            if (!updated.Succeeded)
            {
                return IdentityError(updated);
            }
            if (role != request.Role)
            {
                var removed = await userManager.RemoveFromRoleAsync(user, role);
                if (!removed.Succeeded)
                {
                    return IdentityError(removed);
                }
                var added = await userManager.AddToRoleAsync(user, request.Role);
                if (!added.Succeeded)
                {
                    return IdentityError(added);
                }
            }
            await transaction.CommitAsync();

            return Results.Ok(new StaffUser(user.Id, user.Email!, user.DisplayName, request.Role, user.IsActive));
        });

        group.MapPost("/{id}/deactivate", async (string id, HttpContext httpContext, ITenantContext tenantContext, UserManager<ApplicationUser> userManager, AppDbContext db) =>
        {
            var tenantId = RequireTenant(tenantContext);

            await using var transaction = await db.Database.BeginTransactionAsync();
            var user = await FindStaffUserAsync(db, tenantId, id);
            if (user is null)
            {
                return Results.NotFound();
            }
            if (user.Id == userManager.GetUserId(httpContext.User))
            {
                return Conflict("cannot_deactivate_self");
            }

            var role = await RoleOfAsync(userManager, user);
            if (user.IsActive)
            {
                if (role == Roles.TenantAdmin && await CountActiveTenantAdminsAsync(db, tenantId) <= 1)
                {
                    return Conflict("last_admin");
                }

                user.IsActive = false;
                // A new security stamp ends the user's existing sessions on their next request (see Program.cs).
                var updated = await userManager.UpdateSecurityStampAsync(user);
                if (!updated.Succeeded)
                {
                    return IdentityError(updated);
                }
            }
            await transaction.CommitAsync();

            return Results.Ok(new StaffUser(user.Id, user.Email!, user.DisplayName, role, user.IsActive));
        });

        group.MapPost("/{id}/activate", async (string id, ITenantContext tenantContext, UserManager<ApplicationUser> userManager, AppDbContext db) =>
        {
            var tenantId = RequireTenant(tenantContext);
            var user = await FindStaffUserAsync(db, tenantId, id);
            if (user is null)
            {
                return Results.NotFound();
            }

            if (!user.IsActive)
            {
                user.IsActive = true;
                var updated = await userManager.UpdateAsync(user);
                if (!updated.Succeeded)
                {
                    return IdentityError(updated);
                }
            }

            return Results.Ok(new StaffUser(user.Id, user.Email!, user.DisplayName, await RoleOfAsync(userManager, user), user.IsActive));
        });

        group.MapPost("/{id}/password", async (string id, SetPasswordRequest request, HttpContext httpContext, ITenantContext tenantContext, UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager, AppDbContext db) =>
        {
            var tenantId = RequireTenant(tenantContext);
            var user = await FindStaffUserAsync(db, tenantId, id);
            if (user is null)
            {
                return Results.NotFound();
            }

            // Resetting with a token validates the new password and replaces the old one in a single update.
            // It also renews the security stamp, which ends the user's other sessions.
            var token = await userManager.GeneratePasswordResetTokenAsync(user);
            var reset = await userManager.ResetPasswordAsync(user, token, request.Password ?? "");
            if (!reset.Succeeded)
            {
                return IdentityError(reset);
            }

            // An admin who sets their own password stays signed in.
            if (user.Id == userManager.GetUserId(httpContext.User))
            {
                await signInManager.RefreshSignInAsync(user);
            }

            return Results.NoContent();
        });
    }

    private static Guid RequireTenant(ITenantContext tenantContext) =>
        tenantContext.TenantId ?? throw new InvalidOperationException("A Tenant Admin always belongs to a tenant.");

    /// <summary>The user with this id, if they belong to the tenant; users of other tenants are not found.</summary>
    private static Task<ApplicationUser?> FindStaffUserAsync(AppDbContext db, Guid tenantId, string id) =>
        db.Users.SingleOrDefaultAsync(u => u.Id == id && u.TenantId == tenantId);

    private static async Task<string> RoleOfAsync(UserManager<ApplicationUser> userManager, ApplicationUser user) =>
        (await userManager.GetRolesAsync(user)).Single();

    private static Task<int> CountActiveTenantAdminsAsync(AppDbContext db, Guid tenantId) =>
        db.Users.CountAsync(u => u.TenantId == tenantId && u.IsActive
            && db.UserRoles.Any(ur => ur.UserId == u.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == Roles.TenantAdmin)));

    private static IResult BadRequest(string error) =>
        Results.Json(new StaffError(error), statusCode: StatusCodes.Status400BadRequest);

    private static IResult Conflict(string error) =>
        Results.Json(new StaffError(error), statusCode: StatusCodes.Status409Conflict);

    /// <summary>Translates the Identity error codes into the error codes of this API. Also used by <see cref="SuperadminEndpoints"/>.</summary>
    internal static IResult IdentityError(IdentityResult result)
    {
        var codes = result.Errors.Select(e => e.Code).ToList();
        if (codes.Contains(nameof(IdentityErrorDescriber.DuplicateEmail)) || codes.Contains(nameof(IdentityErrorDescriber.DuplicateUserName)))
        {
            return Conflict("email_taken");
        }
        if (codes.Contains(nameof(IdentityErrorDescriber.InvalidEmail)) || codes.Contains(nameof(IdentityErrorDescriber.InvalidUserName)))
        {
            return BadRequest("invalid_email");
        }
        if (codes.Any(code => code.StartsWith("Password", StringComparison.Ordinal)))
        {
            return BadRequest("password_too_weak");
        }
        throw new InvalidOperationException($"Unexpected Identity error: {string.Join(" ", result.Errors.Select(e => $"{e.Code}: {e.Description}"))}");
    }
}
