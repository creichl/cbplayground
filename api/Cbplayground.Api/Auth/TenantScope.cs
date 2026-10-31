namespace Cbplayground.Api.Auth;

/// <summary>
/// A tenant set explicitly for the current request (scoped), e.g. by the public endpoints from the restaurant's slug.
/// <see cref="HttpTenantContext"/> prefers it to the tenant of the signed-in user.
/// </summary>
public class TenantScope
{
    public Guid? TenantId { get; set; }
}
