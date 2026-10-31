namespace Cbplayground.Api.Data;

/// <summary>The tenant of the current request.</summary>
public interface ITenantContext
{
    /// <summary>The signed-in user's tenant; null when nobody is signed in or the user is the Superadmin.</summary>
    Guid? TenantId { get; }
}
