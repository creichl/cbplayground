using System.Text.Json.Serialization;
using Cbplayground.Api.FloorPlans;

namespace Cbplayground.Api.Data;

/// <summary>What a room element is. <see cref="Label"/> is only a text on the plan, e.g. "Blick auf den Stephansdom".</summary>
[JsonConverter(typeof(JsonStringEnumConverter<RoomElementKind>))]
public enum RoomElementKind
{
    Entrance,
    Window,
    Bar,
    Plant,
    Pillar,
    Sofa,
    Stage,
    Service,
    Stairs,
    Label,
}

/// <summary>
/// An object of the room of an area that is not a table, e.g. the entrance, a window or the bar. It belongs to its area and is
/// deleted with it. Like the tables, it lies on the 3:2 plan of the area.
/// </summary>
public class RoomElement : ITenantOwned
{
    public const int MaxLabelLength = 40;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid AreaId { get; set; }

    public RoomElementKind Kind { get; set; }

    /// <summary>Horizontal position of the element's centre relative to the plan, 0 (left) to 1 (right).</summary>
    public double PosX { get; set; }

    /// <summary>Vertical position of the element's centre relative to the plan, 0 (top) to 1 (bottom).</summary>
    public double PosY { get; set; }

    /// <summary>Width of the element as it lies on the plan (after the rotation), as a fraction of the plan width, more than 0 and at most 1.</summary>
    public double Width { get; set; }

    /// <summary>Height of the element as it lies on the plan (after the rotation), as a fraction of the plan height, more than 0 and at most 1.</summary>
    public double Height { get; set; }

    /// <summary>
    /// 0, 90, 180 or 270 degrees, clockwise. At 0 the element's front faces up, as at the bottom wall facing into the room;
    /// at 90 it stands at the left wall, at 180 at the top wall, at 270 at the right wall. An entrance keeps the room in front of it free.
    /// </summary>
    public int Rotation { get; set; }

    /// <summary>Optional text, at most <see cref="MaxLabelLength"/> characters; required for <see cref="RoomElementKind.Label"/>.</summary>
    public string? Label { get; set; }

    /// <summary>Position among the elements of the area, ascending: the order in which they were saved.</summary>
    public int SortOrder { get; set; }

    /// <summary>
    /// The size of a new element of this kind, as a length along the wall and a depth into the room, both in plan widths
    /// (the plan height is 2/3 of the plan width). The web uses the same sizes.
    /// </summary>
    public static (double Length, double Depth) DefaultDimensions(RoomElementKind kind) => kind switch
    {
        RoomElementKind.Entrance => (0.10, 0.03),
        RoomElementKind.Window => (0.16, 0.02),
        RoomElementKind.Bar => (0.30, 0.10),
        RoomElementKind.Plant => (0.05, 0.05),
        RoomElementKind.Pillar => (0.04, 0.04),
        RoomElementKind.Sofa => (0.16, 0.06),
        RoomElementKind.Stage => (0.30, 0.15),
        RoomElementKind.Service => (0.14, 0.08),
        RoomElementKind.Stairs => (0.10, 0.16),
        RoomElementKind.Label => (0.24, 0.04),
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    /// <summary>
    /// <see cref="Width"/> and <see cref="Height"/> of an element of the given length along the wall and depth (in plan widths) at this
    /// rotation: at 0 and 180 the length lies horizontal, at 90 and 270 vertical.
    /// </summary>
    public static (double Width, double Height) Size(double length, double depth, int rotation) =>
        rotation is 90 or 270 ? (depth, length * TableLayout.AspectRatio) : (length, depth * TableLayout.AspectRatio);
}
