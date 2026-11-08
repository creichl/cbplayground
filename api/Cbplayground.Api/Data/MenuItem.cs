using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>The 14 allergens that must be declared in the EU (Regulation (EU) No 1169/2011, Annex II).</summary>
[JsonConverter(typeof(JsonStringEnumConverter<Allergen>))]
public enum Allergen
{
    Gluten,
    Crustaceans,
    Eggs,
    Fish,
    Peanuts,
    Soy,
    Milk,
    Nuts,
    Celery,
    Mustard,
    Sesame,
    Sulphites,
    Lupin,
    Molluscs,
}

/// <summary>A dish or drink of a <see cref="MenuSection"/>, with its price, marks, allergens and an optional photo.</summary>
public class MenuItem : ITenantOwned
{
    public const int MaxNameLength = 100;
    public const int MaxDescriptionLength = 300;

    /// <summary>The most items a restaurant's menu can have, over all its sections.</summary>
    public const int MaxItems = 300;

    /// <summary>The highest price in minor units: 100 000.00 in the currency.</summary>
    public const int MaxPrice = 10_000_000;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid SectionId { get; set; }

    /// <summary>Trimmed, 1 to <see cref="MaxNameLength"/> characters, in the restaurant's language.</summary>
    public required string Name { get; set; }

    /// <summary>Optional, e.g. "mit Kartoffelknödel und Blaukraut"; trimmed, null when empty.</summary>
    public string? Description { get; set; }

    /// <summary>The price in minor units of the restaurant's currency (cents or para), 0 to <see cref="MaxPrice"/>; null without price.</summary>
    public int? Price { get; set; }

    /// <summary>File name of the photo in the uploads folder, chosen by the server; null without photo.</summary>
    public string? PhotoFileName { get; set; }

    /// <summary>Position of the item in its section, ascending.</summary>
    public int SortOrder { get; set; }

    public bool Vegetarian { get; set; }

    public bool Vegan { get; set; }

    public bool GlutenFree { get; set; }

    public bool Spicy { get; set; }

    /// <summary>A recommendation of the house; with a photo it is shown on top of the menu.</summary>
    public bool Recommended { get; set; }

    /// <summary>The allergens the dish contains, each at most once, in the order of <see cref="Allergen"/>.</summary>
    public List<Allergen> Allergens { get; set; } = [];
}
