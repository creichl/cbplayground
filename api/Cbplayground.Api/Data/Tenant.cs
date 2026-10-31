namespace Cbplayground.Api.Data;

/// <summary>A tenant is one restaurant. All tenants share one database.</summary>
public class Tenant
{
    public const int MaxStreetLength = 200;
    public const int MaxPostalCodeLength = 10;
    public const int MaxCityLength = 100;
    public const int MaxPhoneLength = 30;
    public const int MaxEmailLength = 254;
    public const int MaxWebsiteLength = 200;
    public const int MaxDescriptionLength = 500;

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

    // The restaurant's profile, maintained by the Tenant Admin and shown to guests. Every field is optional (null when empty).

    public string? Street { get; set; }

    public string? PostalCode { get; set; }

    public string? City { get; set; }

    public string? Phone { get; set; }

    public string? Email { get; set; }

    /// <summary>The restaurant's own website, an absolute http or https URL.</summary>
    public string? Website { get; set; }

    /// <summary>A short description for guests.</summary>
    public string? Description { get; set; }
}
