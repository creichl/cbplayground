namespace Cbplayground.Api.Auth;

/// <summary>Names of the staff roles. Every user has exactly one of them.</summary>
public static class Roles
{
    public const string Superadmin = "Superadmin";
    public const string TenantAdmin = "TenantAdmin";
    public const string FrontDesk = "FrontDesk";
}

/// <summary>Names of the authorization policies, see Program.cs.</summary>
public static class Policies
{
    /// <summary>The Superadmin only: the platform operator, who manages the restaurants.</summary>
    public const string RequireSuperadmin = "RequireSuperadmin";

    /// <summary>Tenant Admins only.</summary>
    public const string RequireTenantAdmin = "RequireTenantAdmin";

    /// <summary>Restaurant staff: Tenant Admins and Front desk users.</summary>
    public const string RequireStaff = "RequireStaff";
}
