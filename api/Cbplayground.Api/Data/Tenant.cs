namespace Cbplayground.Api.Data;

/// <summary>A tenant is one restaurant. All tenants share one database.</summary>
public class Tenant
{
    public Guid Id { get; set; }

    public required string Name { get; set; }

    /// <summary>URL-friendly, unique identifier of the restaurant, e.g. "zur-linde".</summary>
    public required string Slug { get; set; }

    /// <summary>Creation time in UTC. DateTime instead of DateTimeOffset because EF Core cannot sort or filter DateTimeOffset on SQLite.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Country of the restaurant ("DE", "AT" or "RS"), see <see cref="OpeningHours.Locations"/>. Null until the Tenant Admin chooses it.</summary>
    public string? CountryCode { get; set; }

    /// <summary>Federal state for Germany, e.g. "DE-BY"; null for Austria and Serbia.</summary>
    public string? RegionCode { get; set; }

    /// <summary>IANA time zone, derived from the country, e.g. "Europe/Berlin".</summary>
    public string? TimeZoneId { get; set; }
}
