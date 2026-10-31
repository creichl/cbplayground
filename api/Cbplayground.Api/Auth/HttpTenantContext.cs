using Cbplayground.Api.Data;

namespace Cbplayground.Api.Auth;

/// <summary>Reads the tenant from the claims of the signed-in user.</summary>
public class HttpTenantContext(IHttpContextAccessor httpContextAccessor) : ITenantContext
{
    public const string TenantIdClaimType = "tenant_id";

    public Guid? TenantId
    {
        get
        {
            var value = httpContextAccessor.HttpContext?.User.FindFirst(TenantIdClaimType)?.Value;
            return Guid.TryParse(value, out var tenantId) ? tenantId : null;
        }
    }
}
