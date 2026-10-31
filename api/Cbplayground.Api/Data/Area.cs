namespace Cbplayground.Api.Data;

/// <summary>An area of a restaurant, e.g. the dining room or the terrace, with its own floor plan.</summary>
public class Area : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public required string Name { get; set; }

    /// <summary>Position of the area among the restaurant's areas, ascending.</summary>
    public int SortOrder { get; set; }

    /// <summary>File name of the uploaded floor plan in the uploads folder; null until one is uploaded. Always chosen by the server.</summary>
    public string? FloorPlanFileName { get; set; }

    /// <summary>False blocks the area completely for online booking.</summary>
    public bool OnlineBookingEnabled { get; set; } = true;

    /// <summary>Share of the area's seats that guests can book online, 0–100. The rest stays for phone bookings and walk-ins.</summary>
    public int OnlineCapacityPercent { get; set; } = 100;
}
