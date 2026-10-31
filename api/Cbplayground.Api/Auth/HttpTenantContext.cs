using Cbplayground.Api.Data;

namespace Cbplayground.Api.Auth;

/// <summary>
/// The tenant set for this request in <see cref="TenantScope"/> (public endpoints of a restaurant),
/// otherwise the tenant from the claims of the signed-in user.
/// </summary>
public class HttpTenantContext(IHttpContextAccessor httpContextAccessor, TenantScope tenantScope) : ITenantContext
{
    public const string TenantIdClaimType = "tenant_id";

    public Guid? TenantId
    {
        get
        {
            if (tenantScope.TenantId is { } scopedTenantId)
            {
                return scopedTenantId;
            }
            var value = httpContextAccessor.HttpContext?.User.FindFirst(TenantIdClaimType)?.Value;
            return Guid.TryParse(value, out var tenantId) ? tenantId : null;
        }
    }
}
