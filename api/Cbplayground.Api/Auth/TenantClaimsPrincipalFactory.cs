using System.Security.Claims;
using Cbplayground.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace Cbplayground.Api.Auth;

/// <summary>Adds the user's tenant to the claims stored in the sign-in cookie, so <see cref="HttpTenantContext"/> can read it.</summary>
public class TenantClaimsPrincipalFactory(
    UserManager<ApplicationUser> userManager,
    RoleManager<IdentityRole> roleManager,
    IOptions<IdentityOptions> options)
    : UserClaimsPrincipalFactory<ApplicationUser, IdentityRole>(userManager, roleManager, options)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(ApplicationUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        if (user.TenantId is { } tenantId)
        {
            identity.AddClaim(new Claim(HttpTenantContext.TenantIdClaimType, tenantId.ToString()));
        }
        return identity;
    }
}
