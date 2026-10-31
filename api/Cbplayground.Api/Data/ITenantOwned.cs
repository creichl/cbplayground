namespace Cbplayground.Api.Data;

/// <summary>
/// Marks an entity that belongs to one tenant. AppDbContext filters every query on these entities
/// by the current tenant and sets <see cref="TenantId"/> on new entities when they are saved.
/// </summary>
public interface ITenantOwned
{
    Guid TenantId { get; set; }
}
