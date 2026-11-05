using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>Light or dark appearance of the restaurant's guest pages.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ThemeMode>))]
public enum ThemeMode
{
    Light,
    Dark,
}

/// <summary>A curated pair of fonts for the restaurant's guest pages. The API only knows the key; the web decides which fonts it stands for.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<FontStyle>))]
public enum FontStyle
{
    Modern,
    Classic,
    Elegant,
    Rustic,
    Urban,
}

/// <summary>
/// How the tables look on the guest's floor plan when the guest picks one. The API only knows the key; the web draws them:
/// <see cref="Classic"/> furniture in the accent colour, <see cref="Natural"/> wooden furniture with a halo in the accent
/// colour, <see cref="Minimal"/> flat shapes with seats as dots, <see cref="Glow"/> luminous outlines.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<TableStyle>))]
public enum TableStyle
{
    Classic,
    Natural,
    Minimal,
    Glow,
}

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

    public const int MaxNameLength = 100;
    public const int MaxSlugLength = 50;

    /// <summary>Length of <see cref="BrandColor"/>, "#rrggbb".</summary>
    public const int BrandColorLength = 7;

    public Guid Id { get; set; }

    public required string Name { get; set; }

    /// <summary>URL-friendly, unique identifier of the restaurant, e.g. "zur-linde".</summary>
    public required string Slug { get; set; }

    /// <summary>
    /// Deactivated restaurants are hidden from guests (list and booking page) and their staff cannot sign in.
    /// Restaurants are never deleted, only deactivated by the Superadmin.
    /// </summary>
    public bool IsActive { get; set; } = true;

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

    // The restaurant's branding, maintained by the Tenant Admin. Every field is optional (null: the platform's default).

    /// <summary>Accent colour, "#rrggbb" in lower case.</summary>
    public string? BrandColor { get; set; }

    /// <summary>Null: <see cref="Data.ThemeMode.Light"/>.</summary>
    public ThemeMode? ThemeMode { get; set; }

    /// <summary>Null: <see cref="Data.FontStyle.Modern"/>.</summary>
    public FontStyle? FontStyle { get; set; }

    /// <summary>Null: <see cref="Data.TableStyle.Classic"/>.</summary>
    public TableStyle? TableStyle { get; set; }

    /// <summary>File name of the logo in "Uploads:Path", chosen by the server.</summary>
    public string? LogoFileName { get; set; }

    /// <summary>File name of the cover image in "Uploads:Path", chosen by the server.</summary>
    public string? CoverFileName { get; set; }
}
