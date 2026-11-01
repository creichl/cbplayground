using Cbplayground.Api.Data;
using Cbplayground.Api.FloorPlans;
using static Cbplayground.Api.Tests.TableLayoutTests;

namespace Cbplayground.Api.Tests;

/// <summary>The suggested rooms (<see cref="RoomSuggestion"/>) and the arrangement of the tables around room elements (<see cref="TableLayout"/>).</summary>
public class RoomLayoutTests
{
    private const double Tolerance = 1e-9;

    private static readonly RoomElementKind[] BlockingKinds =
        [RoomElementKind.Bar, RoomElementKind.Pillar, RoomElementKind.Sofa, RoomElementKind.Stage, RoomElementKind.Service, RoomElementKind.Stairs, RoomElementKind.Plant];

    /// <summary>
    /// What a table must not touch, as fractions of the plan: a blocking element, or an entrance together with the room of
    /// <see cref="TableLayout.EntranceZoneDepth"/> plan widths in front of it.
    /// </summary>
    internal static List<(string What, double Left, double Top, double Right, double Bottom)> Obstacles(IEnumerable<RoomElement> elements)
    {
        var obstacles = new List<(string, double, double, double, double)>();
        foreach (var e in elements)
        {
            var (left, top, right, bottom) = (e.PosX - e.Width / 2, e.PosY - e.Height / 2, e.PosX + e.Width / 2, e.PosY + e.Height / 2);
            if (e.Kind == RoomElementKind.Entrance)
            {
                var depthX = TableLayout.EntranceZoneDepth;
                var depthY = TableLayout.EntranceZoneDepth * TableLayout.AspectRatio;
                switch (e.Rotation)
                {
                    case 0: top -= depthY; break;
                    case 90: right += depthX; break;
                    case 180: bottom += depthY; break;
                    case 270: left -= depthX; break;
                }
            }
            else if (!BlockingKinds.Contains(e.Kind))
            {
                continue;
            }
            obstacles.Add(($"{e.Kind} at {e.PosX:0.###}/{e.PosY:0.###}", left, top, right, bottom));
        }
        return obstacles;
    }

    /// <summary>No table (with <paramref name="space"/> in plan widths around it) overlaps a blocking element or the room in front of an entrance.</summary>
    internal static void AssertClearOfElements(IEnumerable<Table> tables, IEnumerable<RoomElement> elements, int tableScale, double space = 0)
    {
        var obstacles = Obstacles(elements);
        foreach (var table in tables)
        {
            var (left, top, right, bottom) = Bounds(table, tableScale, space);
            foreach (var o in obstacles)
            {
                var overlap = left < o.Right - Tolerance && o.Left < right - Tolerance && top < o.Bottom - Tolerance && o.Top < bottom - Tolerance;
                Assert.False(overlap, $"Table {table.Number} at {table.PosX:0.###}/{table.PosY:0.###} touches the {o.What}.");
            }
        }
    }

    private static RoomElement Element(RoomElementKind kind, double x, double y, double width, double height, int rotation = 0) =>
        new() { Kind = kind, PosX = x, PosY = y, Width = width, Height = height, Rotation = rotation };

    public static TheoryData<RoomStyle, int> StylesAndTableCounts()
    {
        var data = new TheoryData<RoomStyle, int>();
        foreach (var style in Enum.GetValues<RoomStyle>())
        {
            foreach (var count in new[] { 1, 6, 20 })
            {
                data.Add(style, count);
            }
        }
        return data;
    }

    [Theory]
    [MemberData(nameof(StylesAndTableCounts))]
    public void The_tables_of_a_suggested_room_keep_away_from_its_elements_with_their_chairs(RoomStyle style, int count)
    {
        var elements = RoomSuggestion.Suggest(style, count);
        var tables = MixedTables(count);

        TableLayout.Arrange(tables, 100, elements);

        Assert.NotEmpty(elements);
        Assert.All(tables, t => AssertInside(t, 100, TableLayout.ChairSpace));
        AssertNoOverlap(tables, 100, TableLayout.ChairSpace);
        AssertClearOfElements(tables, elements, 100, TableLayout.ChairSpace);
    }

    [Theory]
    [MemberData(nameof(StylesAndTableCounts))]
    public void A_suggested_room_lies_inside_the_plan_and_has_an_entrance(RoomStyle style, int count)
    {
        var elements = RoomSuggestion.Suggest(style, count);

        Assert.All(elements, e =>
        {
            Assert.InRange(e.PosX - e.Width / 2, -Tolerance, 1 + Tolerance);
            Assert.InRange(e.PosX + e.Width / 2, -Tolerance, 1 + Tolerance);
            Assert.InRange(e.PosY - e.Height / 2, -Tolerance, 1 + Tolerance);
            Assert.InRange(e.PosY + e.Height / 2, -Tolerance, 1 + Tolerance);
            Assert.Contains(e.Rotation, new[] { 0, 90, 180, 270 });
            Assert.Null(e.Label);
        });
        Assert.Single(elements, e => e.Kind == RoomElementKind.Entrance);
        Assert.Equal(Enumerable.Range(0, elements.Count), elements.Select(e => e.SortOrder));
    }

    [Theory]
    [MemberData(nameof(StylesAndTableCounts))]
    public void The_same_style_and_number_of_tables_give_the_same_room(RoomStyle style, int count)
    {
        static List<(RoomElementKind, double, double, double, double, int)> Values(List<RoomElement> elements) =>
            elements.Select(e => (e.Kind, e.PosX, e.PosY, e.Width, e.Height, e.Rotation)).ToList();

        Assert.Equal(Values(RoomSuggestion.Suggest(style, count)), Values(RoomSuggestion.Suggest(style, count)));
    }

    [Fact]
    public void An_indoor_room_has_the_entrance_in_the_bottom_wall_windows_at_the_top_plants_in_two_corners_and_a_bar_from_6_tables()
    {
        var small = RoomSuggestion.Suggest(RoomStyle.Indoor, 5);
        var large = RoomSuggestion.Suggest(RoomStyle.Indoor, 6);

        var entrance = Assert.Single(small, e => e.Kind == RoomElementKind.Entrance);
        Assert.Equal((0.5, 0), (entrance.PosX, entrance.Rotation));
        Assert.Equal(1, entrance.PosY + entrance.Height / 2, 10);
        Assert.Contains(small, e => e.Kind == RoomElementKind.Window);
        Assert.All(small.Where(e => e.Kind == RoomElementKind.Window), w => Assert.Equal((0, 180), (w.PosY - w.Height / 2, w.Rotation)));
        var plants = small.Where(e => e.Kind == RoomElementKind.Plant).ToList();
        Assert.Equal(2, plants.Count);
        Assert.All(plants, p => Assert.True(IsInCorner(p), $"The plant at {p.PosX}/{p.PosY} is not in a corner."));
        Assert.DoesNotContain(small, e => e.Kind == RoomElementKind.Bar);

        var bar = Assert.Single(large, e => e.Kind == RoomElementKind.Bar);
        Assert.True(bar.PosX - bar.Width / 2 < Tolerance || bar.PosX + bar.Width / 2 > 1 - Tolerance, "The bar does not stand at a side wall.");
    }

    [Theory]
    [InlineData(RoomStyle.Terrace)]
    [InlineData(RoomStyle.Rooftop)]
    public void Terraces_and_rooftops_have_an_entrance_at_a_side_plants_no_windows_and_a_bar_from_6_tables(RoomStyle style)
    {
        var small = RoomSuggestion.Suggest(style, 5);
        var large = RoomSuggestion.Suggest(style, 6);

        var entrance = Assert.Single(small, e => e.Kind == RoomElementKind.Entrance);
        Assert.Contains(entrance.Rotation, new[] { 90, 270 });
        Assert.Contains(small, e => e.Kind == RoomElementKind.Plant);
        Assert.DoesNotContain(large, e => e.Kind == RoomElementKind.Window);
        Assert.DoesNotContain(small, e => e.Kind == RoomElementKind.Bar);
        Assert.Single(large, e => e.Kind == RoomElementKind.Bar);
        if (style == RoomStyle.Rooftop)
        {
            // Guests come up the stairs and step onto the deck through the entrance in front of them.
            var stairs = Assert.Single(small, e => e.Kind == RoomElementKind.Stairs);
            Assert.Equal(stairs.PosX + stairs.Width / 2, entrance.PosX - entrance.Width / 2, 10);
        }
    }

    [Theory]
    [InlineData(1)]
    [InlineData(20)]
    public void A_garden_has_an_entrance_and_plants_along_its_edge(int count)
    {
        var elements = RoomSuggestion.Suggest(RoomStyle.Garden, count);

        Assert.Single(elements, e => e.Kind == RoomElementKind.Entrance);
        var plants = elements.Where(e => e.Kind == RoomElementKind.Plant).ToList();
        Assert.True(plants.Count >= 4);
        Assert.All(plants, p => Assert.True(
            p.PosX - p.Width / 2 < Tolerance || p.PosX + p.Width / 2 > 1 - Tolerance || p.PosY - p.Height / 2 < Tolerance || p.PosY + p.Height / 2 > 1 - Tolerance,
            $"The plant at {p.PosX}/{p.PosY} is not at the edge."));
        Assert.All(elements, e => Assert.Contains(e.Kind, new[] { RoomElementKind.Entrance, RoomElementKind.Plant }));
    }

    private static bool IsInCorner(RoomElement e) =>
        (e.PosX - e.Width / 2 < Tolerance || e.PosX + e.Width / 2 > 1 - Tolerance) && (e.PosY - e.Height / 2 < Tolerance || e.PosY + e.Height / 2 > 1 - Tolerance);

    [Theory]
    [InlineData(1)]
    [InlineData(6)]
    [InlineData(20)]
    public void The_tables_keep_away_from_a_stage_pillars_and_the_room_in_front_of_entrances(int count)
    {
        RoomElement[] elements =
        [
            Element(RoomElementKind.Stage, 0.5, 0.1, 0.4, 0.2),
            Element(RoomElementKind.Pillar, 0.35, 0.55, 0.04, 0.06),
            Element(RoomElementKind.Pillar, 0.65, 0.55, 0.04, 0.06),
            Element(RoomElementKind.Entrance, 0.015, 0.7, 0.03, 0.15, rotation: 90),
            Element(RoomElementKind.Entrance, 0.7, 0.9775, 0.1, 0.045),
        ];
        var tables = MixedTables(count);

        TableLayout.Arrange(tables, 100, elements);

        Assert.All(tables, t => AssertInside(t, 100));
        AssertNoOverlap(tables, 100);
        AssertClearOfElements(tables, elements, 100, TableLayout.ChairSpace);
    }

    [Fact]
    public void A_stage_along_the_whole_top_wall_moves_the_rows_below_it()
    {
        RoomElement[] elements = [Element(RoomElementKind.Stage, 0.5, 0.15, 1, 0.3)];
        var tables = MixedTables(12);

        TableLayout.Arrange(tables, 100, elements);

        Assert.All(tables, t => Assert.True(Bounds(t, 100, TableLayout.ChairSpace).Top >= 0.3 - Tolerance, $"Table {t.Number} stands on the stage."));
        AssertNoOverlap(tables, 100, TableLayout.ChairSpace);
        // Still in rows in the order of their numbers.
        var ordered = tables.OrderBy(t => int.Parse(t.Number)).ToList();
        for (var i = 1; i < ordered.Count; i++)
        {
            var sameRow = Math.Abs(ordered[i - 1].PosY - ordered[i].PosY) < Tolerance;
            Assert.True(sameRow ? ordered[i].PosX > ordered[i - 1].PosX : ordered[i].PosY > ordered[i - 1].PosY);
        }
    }

    [Fact]
    public void An_entrance_keeps_the_room_in_front_of_it_free_on_the_side_it_faces()
    {
        // A door in the right wall facing left: the tables stay out of the strip in front of it, a table depth wide.
        RoomElement[] elements = [Element(RoomElementKind.Entrance, 0.985, 0.5, 0.03, 0.15, rotation: 270)];
        var tables = MixedTables(6);

        TableLayout.Arrange(tables, 100, elements);

        AssertClearOfElements(tables, elements, 100, TableLayout.ChairSpace);
        Assert.Equal(0.1, TableLayout.EntranceZoneDepth, 10);
    }

    [Fact]
    public void Windows_and_labels_do_not_block()
    {
        RoomElement[] elements =
        [
            Element(RoomElementKind.Window, 0.5, 0.5, 1, 1),
            Element(RoomElementKind.Label, 0.5, 0.5, 1, 1),
        ];
        var withElements = MixedTables(10);
        var without = MixedTables(10);

        TableLayout.Arrange(withElements, 100, elements);
        TableLayout.Arrange(without, 100);

        Assert.Equal(without.Select(t => (t.PosX, t.PosY)), withElements.Select(t => (t.PosX, t.PosY)));
    }

    [Fact]
    public void When_the_tables_do_not_fit_the_gaps_shrink_before_a_table_touches_an_element()
    {
        // A bar along the whole left wall and one along the whole right wall leave 0.6 of the width.
        RoomElement[] elements =
        [
            Element(RoomElementKind.Bar, 0.1, 0.5, 0.2, 1),
            Element(RoomElementKind.Bar, 0.9, 0.5, 0.2, 1),
        ];
        var tables = MixedTables(20);

        TableLayout.Arrange(tables, 100, elements);

        AssertNoOverlap(tables, 100);
        AssertClearOfElements(tables, elements, 100);
    }

    [Fact]
    public void Tables_only_stand_on_elements_when_there_is_no_room_beside_them()
    {
        RoomElement[] elements = [Element(RoomElementKind.Stage, 0.5, 0.5, 1, 1)];
        var withElements = MixedTables(6);
        var without = MixedTables(6);

        TableLayout.Arrange(withElements, 100, elements);
        TableLayout.Arrange(without, 100);

        Assert.Equal(without.Select(t => (t.PosX, t.PosY)), withElements.Select(t => (t.PosX, t.PosY)));
    }

    [Theory]
    [InlineData(RoomStyle.Indoor, 0)]
    [InlineData(RoomStyle.Rooftop, 6)]
    [InlineData(RoomStyle.Garden, 19)]
    public void A_new_table_does_not_stand_on_an_element(RoomStyle style, int count)
    {
        var elements = RoomSuggestion.Suggest(style, count + 1);
        var tables = MixedTables(count);
        TableLayout.Arrange(tables, 100, elements);
        var table = new Table { Number = "X1", Seats = 8, Shape = TableShape.Rectangle };

        (table.PosX, table.PosY) = TableLayout.FreePosition(tables, table, 100, elements);

        AssertInside(table, 100);
        Assert.All(tables, t => Assert.False(Bounds(t, 100) is var a && Bounds(table, 100) is var b
            && a.Left < b.Right - Tolerance && b.Left < a.Right - Tolerance && a.Top < b.Bottom - Tolerance && b.Top < a.Bottom - Tolerance,
            $"The new table overlaps table {t.Number}."));
        AssertClearOfElements([table], elements, 100);
    }

    [Fact]
    public void A_new_table_in_an_empty_area_avoids_a_pillar_in_the_middle()
    {
        RoomElement[] elements = [Element(RoomElementKind.Pillar, 0.5, 0.5, 0.04, 0.06)];
        var table = new Table { Number = "1", Seats = 4, Shape = TableShape.Square };

        (table.PosX, table.PosY) = TableLayout.FreePosition([], table, 100, elements);

        AssertInside(table, 100);
        AssertClearOfElements([table], elements, 100, TableLayout.ChairSpace);
    }
}
