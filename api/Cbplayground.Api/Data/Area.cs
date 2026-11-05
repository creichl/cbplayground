using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>
/// The kind of room of an area, which sets floor and boundary of the drawn plan: <see cref="Indoor"/> parquet and walls,
/// <see cref="Terrace"/> stone slabs and a railing, <see cref="Garden"/> gravel or lawn and a hedge, <see cref="Rooftop"/> a wooden
/// deck and a glass parapet.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<RoomStyle>))]
public enum RoomStyle
{
    Indoor,
    Terrace,
    Garden,
    Rooftop,
}

/// <summary>An area of a restaurant, e.g. the dining room or the terrace, with its own floor plan.</summary>
public class Area : ITenantOwned
{
    public const int MaxDescriptionLength = 200;

    /// <summary>The smallest and the largest real width of a plan in metres.</summary>
    public const double MinWidthMeters = 5;
    public const double MaxWidthMeters = 80;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    /// <summary>Position of the area among the restaurant's areas, ascending.</summary>
    public int SortOrder { get; set; }

    /// <summary>File name of the uploaded floor plan in the uploads folder; null until one is uploaded. Always chosen by the server.</summary>
    public string? FloorPlanFileName { get; set; }

    /// <summary>Short description for the guest's choice of the area, e.g. "Dachterrasse mit Blick über die Stadt"; null when empty.</summary>
    public string? Description { get; set; }

    /// <summary>File name of the uploaded photo of the area in the uploads folder; null without photo. Always chosen by the server.</summary>
    public string? PhotoFileName { get; set; }

    /// <summary>False blocks the area completely for online booking.</summary>
    public bool OnlineBookingEnabled { get; set; } = true;

    /// <summary>Share of the area's seats that guests can book online, 0–100. The rest stays for phone bookings and walk-ins.</summary>
    public int OnlineCapacityPercent { get; set; } = 100;

    /// <summary>
    /// Size of the drawn tables of this area in percent, so they match an uploaded floor plan: 50–200 as the admin sets it,
    /// or derived from <see cref="WidthMeters"/> (<see cref="FloorPlans.TableLayout.RealSizeScale"/>) when that is set.
    /// </summary>
    public int TableScale { get; set; } = 100;

    /// <summary>
    /// The real width of the plan in metres, <see cref="MinWidthMeters"/>–<see cref="MaxWidthMeters"/>: of the floor plan image,
    /// or of the drawn room, which is 3:2 and so two thirds as deep. With it the tables are drawn at their real size and the
    /// plan gets a scale bar; null: unknown, the admin sets <see cref="TableScale"/>.
    /// </summary>
    public double? WidthMeters { get; set; }

    /// <summary>The kind of room. Stored also for an area with floor plan image, but only drawn without one.</summary>
    public RoomStyle RoomStyle { get; set; } = RoomStyle.Indoor;
}
