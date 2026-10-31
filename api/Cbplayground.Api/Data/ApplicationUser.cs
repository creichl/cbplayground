using Microsoft.AspNetCore.Identity;

namespace Cbplayground.Api.Data;

/// <summary>A staff user who signs in with ASP.NET Core Identity. Guests have no account.</summary>
public class ApplicationUser : IdentityUser
{
    /// <summary>The restaurant the user works for. Empty only for the Superadmin, who belongs to no tenant.</summary>
    public Guid? TenantId { get; set; }

    public Tenant? Tenant { get; set; }

    public required string DisplayName { get; set; }

    /// <summary>Deactivated users cannot sign in.</summary>
    public bool IsActive { get; set; } = true;
}
