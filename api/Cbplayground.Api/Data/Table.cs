namespace Cbplayground.Api.Data;

/// <summary>A table on the floor plan of an area.</summary>
public class Table : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid AreaId { get; set; }

    /// <summary>The table's label, e.g. "12" or "T3". Unique within the restaurant.</summary>
    public required string Number { get; set; }

    /// <summary>Number of guests, at least 1.</summary>
    public int Seats { get; set; }

    /// <summary>Horizontal position of the table's centre relative to the floor plan image, 0 (left) to 1 (right).</summary>
    public double PosX { get; set; }

    /// <summary>Vertical position of the table's centre relative to the floor plan image, 0 (top) to 1 (bottom).</summary>
    public double PosY { get; set; }
}
