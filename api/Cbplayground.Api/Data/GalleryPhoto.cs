namespace Cbplayground.Api.Data;

/// <summary>A photo of the restaurant's gallery, e.g. a dish, the bar or the view, shown to guests on the booking page in its order.</summary>
public class GalleryPhoto : ITenantOwned
{
    public const int MaxCaptionLength = 120;

    /// <summary>The most photos a restaurant's gallery can have.</summary>
    public const int MaxPhotos = 20;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>File name of the photo in the uploads folder. Always chosen by the server.</summary>
    public required string FileName { get; set; }

    /// <summary>Optional caption, e.g. "Kaiserschmarrn mit Zwetschkenröster"; trimmed, null when empty.</summary>
    public string? Caption { get; set; }

    /// <summary>Position of the photo in the gallery, ascending.</summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }
}
