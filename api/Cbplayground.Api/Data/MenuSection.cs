namespace Cbplayground.Api.Data;

/// <summary>A section of the restaurant's menu, e.g. "Vorspeisen" or "Getränke", with its dishes; shown to guests in its order.</summary>
public class MenuSection : ITenantOwned
{
    public const int MaxNameLength = 60;
    public const int MaxDescriptionLength = 200;

    /// <summary>The most sections a restaurant's menu can have.</summary>
    public const int MaxSections = 20;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>Trimmed, 1 to <see cref="MaxNameLength"/> characters, in the restaurant's language.</summary>
    public required string Name { get; set; }

    /// <summary>Optional note under the name, e.g. "Alle Hauptgerichte mit Beilage"; trimmed, null when empty.</summary>
    public string? Description { get; set; }

    /// <summary>Position of the section in the menu, ascending.</summary>
    public int SortOrder { get; set; }

    public List<MenuItem> Items { get; set; } = [];
}
