using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>The shape of a table as it is drawn on the floor plan.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<TableShape>))]
public enum TableShape
{
    Round,
    Square,
    Rectangle,
}

/// <summary>A table on the floor plan of an area.</summary>
public class Table : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid AreaId { get; set; }

    /// <summary>The table's label, e.g. "12" or "T3". Unique among the restaurant's tables that are not archived.</summary>
    public required string Number { get; set; }

    /// <summary>Number of guests, at least 1.</summary>
    public int Seats { get; set; }

    /// <summary>
    /// The smallest party the table is given to online, 1 to <see cref="Seats"/>; 1: every party that fits. So a large table stays
    /// free for a large group (e.g. an 8-seat table from 5 people). Staff can still give the table to a smaller party.
    /// </summary>
    public int MinGuests { get; set; } = 1;

    /// <summary>Horizontal position of the table's centre relative to the floor plan, 0 (left) to 1 (right).</summary>
    public double PosX { get; set; }

    /// <summary>Vertical position of the table's centre relative to the floor plan, 0 (top) to 1 (bottom).</summary>
    public double PosY { get; set; }

    /// <summary>Chosen by the restaurant; a new table without a choice gets <see cref="DefaultShape"/>. Changing the seats keeps it.</summary>
    public TableShape Shape { get; set; }

    /// <summary>0 or 90 degrees. Stored for every table, visible only on rectangular ones: at 0 the long side is horizontal.</summary>
    public int Rotation { get; set; }

    /// <summary>
    /// When the table was deleted while it still had reservations (UTC); null while it is in use. An archived table keeps its
    /// reservations, with their table number and area, but is left out of the floor plans, the availability and the setup.
    /// </summary>
    public DateTime? ArchivedAtUtc { get; set; }

    /// <summary>The shape of a new table for which none was chosen: square up to 4 seats, rectangular from 5.</summary>
    public static TableShape DefaultShape(int seats) => seats <= 4 ? TableShape.Square : TableShape.Rectangle;
}
