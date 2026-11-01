using Cbplayground.Api.Data;

namespace Cbplayground.Api.FloorPlans;

/// <summary>
/// A suggested room for an area without floor plan image: the room elements for its <see cref="RoomStyle"/> and number of tables.
/// The elements have their default size (<see cref="RoomElement.DefaultDimensions"/>) and stand at the edge of the plan, so the tables
/// keep the middle (<see cref="TableLayout.Arrange"/>). Deterministic: the same style and number of tables give the same room.
/// </summary>
public static class RoomSuggestion
{
    /// <summary>From this number of tables the room gets a bar.</summary>
    public const int BarFromTables = 6;

    /// <summary>
    /// <list type="bullet">
    /// <item><see cref="RoomStyle.Indoor"/>: the entrance in the middle of the bottom wall, three windows in the top wall, from
    /// <see cref="BarFromTables"/> tables a bar at the right wall, plants in the two top corners.</item>
    /// <item><see cref="RoomStyle.Terrace"/>: the door in the lower part of the left side, from <see cref="BarFromTables"/> tables a bar
    /// in the middle of the back (top), plants in the other three corners; no windows.</item>
    /// <item><see cref="RoomStyle.Rooftop"/>: the stairs in the bottom left corner with the entrance in front of them, from
    /// <see cref="BarFromTables"/> tables a bar in the middle of the back (top), planters in the other three corners; no windows.</item>
    /// <item><see cref="RoomStyle.Garden"/>: the entrance in the middle of the bottom side, plants (trees) along the edge: in the four
    /// corners and in the middle of the top, left and right side.</item>
    /// </list>
    /// The elements are new, without area; <see cref="RoomElement.SortOrder"/> is their order in the list.
    /// </summary>
    public static List<RoomElement> Suggest(RoomStyle style, int tableCount)
    {
        var bar = tableCount >= BarFromTables;
        List<RoomElement> elements = style switch
        {
            RoomStyle.Indoor =>
            [
                AtWall(RoomElementKind.Entrance, 0, 0.5),
                AtWall(RoomElementKind.Window, 180, 0.25),
                AtWall(RoomElementKind.Window, 180, 0.5),
                AtWall(RoomElementKind.Window, 180, 0.75),
                .. bar ? [AtWall(RoomElementKind.Bar, 270, 0.5)] : Array.Empty<RoomElement>(),
                InCorner(RoomElementKind.Plant, left: true, top: true),
                InCorner(RoomElementKind.Plant, left: false, top: true),
            ],
            RoomStyle.Terrace =>
            [
                AtWall(RoomElementKind.Entrance, 90, 0.85),
                .. bar ? [AtWall(RoomElementKind.Bar, 180, 0.5)] : Array.Empty<RoomElement>(),
                InCorner(RoomElementKind.Plant, left: true, top: true),
                InCorner(RoomElementKind.Plant, left: false, top: true),
                InCorner(RoomElementKind.Plant, left: false, top: false),
            ],
            RoomStyle.Rooftop => RooftopElements(bar),
            RoomStyle.Garden =>
            [
                AtWall(RoomElementKind.Entrance, 0, 0.5),
                InCorner(RoomElementKind.Plant, left: true, top: true),
                AtWall(RoomElementKind.Plant, 180, 0.5),
                InCorner(RoomElementKind.Plant, left: false, top: true),
                AtWall(RoomElementKind.Plant, 90, 0.5),
                AtWall(RoomElementKind.Plant, 270, 0.5),
                InCorner(RoomElementKind.Plant, left: true, top: false),
                InCorner(RoomElementKind.Plant, left: false, top: false),
            ],
            _ => throw new ArgumentOutOfRangeException(nameof(style)),
        };
        for (var i = 0; i < elements.Count; i++)
        {
            elements[i].SortOrder = i;
        }
        return elements;
    }

    /// <summary>The stairs come up in the bottom left corner and face right; the entrance onto the deck is right in front of them.</summary>
    private static List<RoomElement> RooftopElements(bool bar)
    {
        var stairs = InCorner(RoomElementKind.Stairs, left: true, top: false, rotation: 90);
        var entrance = Element(RoomElementKind.Entrance, 90, 0, stairs.PosY);
        entrance.PosX = stairs.PosX + stairs.Width / 2 + entrance.Width / 2;
        return
        [
            stairs,
            entrance,
            .. bar ? [AtWall(RoomElementKind.Bar, 180, 0.5)] : Array.Empty<RoomElement>(),
            InCorner(RoomElementKind.Plant, left: true, top: true),
            InCorner(RoomElementKind.Plant, left: false, top: true),
            InCorner(RoomElementKind.Plant, left: false, top: false),
        ];
    }

    /// <summary>
    /// An element of its default size, or of <paramref name="length"/> along the wall (in plan widths), at the wall its rotation stands
    /// for (0: bottom, 90: left, 180: top, 270: right), touching it, with its centre at <paramref name="along"/> (0–1) along that wall.
    /// </summary>
    internal static RoomElement AtWall(RoomElementKind kind, int rotation, double along, double? length = null)
    {
        var element = Element(kind, rotation, along, along, length);
        switch (rotation)
        {
            case 0: element.PosY = 1 - element.Height / 2; break;
            case 90: element.PosX = element.Width / 2; break;
            case 180: element.PosY = element.Height / 2; break;
            default: element.PosX = 1 - element.Width / 2; break;
        }
        return element;
    }

    /// <summary>An element of its default size in a corner of the plan, touching both walls.</summary>
    private static RoomElement InCorner(RoomElementKind kind, bool left, bool top, int rotation = 0)
    {
        var element = Element(kind, rotation, 0, 0);
        element.PosX = left ? element.Width / 2 : 1 - element.Width / 2;
        element.PosY = top ? element.Height / 2 : 1 - element.Height / 2;
        return element;
    }

    internal static RoomElement Element(RoomElementKind kind, int rotation, double x, double y, double? length = null)
    {
        var (defaultLength, depth) = RoomElement.DefaultDimensions(kind);
        var (width, height) = RoomElement.Size(length ?? defaultLength, depth, rotation);
        return new RoomElement { Kind = kind, Rotation = rotation, PosX = x, PosY = y, Width = width, Height = height };
    }
}
