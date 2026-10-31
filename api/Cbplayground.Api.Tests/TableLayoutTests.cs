using Cbplayground.Api.Data;
using Cbplayground.Api.FloorPlans;

namespace Cbplayground.Api.Tests;

/// <summary>Sizes and the automatic arrangement of the tables on the schematic floor plan.</summary>
public class TableLayoutTests
{
    private const double Tolerance = 1e-9;

    /// <summary>Tables "1" to <paramref name="count"/> of mixed sizes and shapes, not in the order of their numbers.</summary>
    private static List<Table> MixedTables(int count)
    {
        int[] seats = [2, 4, 6, 8, 4, 2, 3, 5, 4, 6];
        TableShape[] shapes = [TableShape.Round, TableShape.Square, TableShape.Rectangle];
        return Enumerable.Range(1, count)
            .Select(i => new Table
            {
                Number = i.ToString(),
                Seats = seats[i % seats.Length],
                Shape = shapes[i % shapes.Length],
                Rotation = i % 4 == 0 ? 90 : 0,
            })
            .OrderBy(t => t.Number, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>The table's rectangle (round tables: the enclosing square) as fractions of the plan, grown by <paramref name="space"/> (in plan widths) on every side.</summary>
    private static (double Left, double Top, double Right, double Bottom) Bounds(Table table, int tableScale, double space = 0)
    {
        var (width, height) = TableLayout.TableSize(table.Shape, table.Seats, table.Rotation, tableScale);
        var halfWidth = width / 2 + space;
        var halfHeight = (height / 2 + space) * TableLayout.AspectRatio;
        return (table.PosX - halfWidth, table.PosY - halfHeight, table.PosX + halfWidth, table.PosY + halfHeight);
    }

    private static bool Overlap(Table a, Table b, int tableScale, double space = 0)
    {
        var first = Bounds(a, tableScale, space);
        var second = Bounds(b, tableScale, space);
        return first.Left < second.Right - Tolerance && second.Left < first.Right - Tolerance
            && first.Top < second.Bottom - Tolerance && second.Top < first.Bottom - Tolerance;
    }

    private static void AssertInside(Table table, int tableScale, double space = 0)
    {
        var (left, top, right, bottom) = Bounds(table, tableScale, space);
        Assert.True(left >= -Tolerance && top >= -Tolerance && right <= 1 + Tolerance && bottom <= 1 + Tolerance,
            $"Table {table.Number} at {table.PosX}/{table.PosY} is not inside the plan.");
    }

    private static void AssertNoOverlap(IReadOnlyList<Table> tables, int tableScale, double space = 0)
    {
        for (var i = 0; i < tables.Count; i++)
        {
            for (var j = i + 1; j < tables.Count; j++)
            {
                Assert.False(Overlap(tables[i], tables[j], tableScale, space), $"Tables {tables[i].Number} and {tables[j].Number} overlap.");
            }
        }
    }

    [Fact]
    public void A_table_for_four_is_7_percent_of_the_plan_width()
    {
        Assert.Equal(0.07, TableLayout.TableSize(TableShape.Square, 4, 0, 100).Width, 10);
        Assert.Equal(0.07, TableLayout.TableSize(TableShape.Round, 4, 0, 100).Width, 10);
    }

    [Fact]
    public void Larger_tables_are_larger_and_the_table_scale_scales_them()
    {
        Assert.True(TableLayout.TableSize(TableShape.Round, 8, 0, 100).Width > TableLayout.TableSize(TableShape.Round, 4, 0, 100).Width);
        Assert.True(TableLayout.TableSize(TableShape.Rectangle, 8, 0, 100).Width > TableLayout.TableSize(TableShape.Rectangle, 6, 0, 100).Width);
        Assert.Equal(TableLayout.MinTableSize, TableLayout.TableSize(TableShape.Square, 1, 0, 100).Width, 10);

        var normal = TableLayout.TableSize(TableShape.Rectangle, 6, 0, 100);
        var large = TableLayout.TableSize(TableShape.Rectangle, 6, 0, 200);
        Assert.Equal(2 * normal.Width, large.Width, 10);
        Assert.Equal(2 * normal.Height, large.Height, 10);
    }

    [Fact]
    public void A_rectangular_table_turned_by_90_degrees_stands_upright()
    {
        var lying = TableLayout.TableSize(TableShape.Rectangle, 6, 0, 100);
        var standing = TableLayout.TableSize(TableShape.Rectangle, 6, 90, 100);

        Assert.True(lying.Width > lying.Height);
        Assert.Equal((lying.Height, lying.Width), standing);
        // On round and square tables the rotation has no visible effect.
        Assert.Equal(TableLayout.TableSize(TableShape.Square, 4, 0, 100), TableLayout.TableSize(TableShape.Square, 4, 90, 100));
    }

    [Fact]
    public void A_single_table_is_placed_in_the_middle()
    {
        var tables = MixedTables(1);

        TableLayout.Arrange(tables, 100);

        Assert.Equal((0.5, 0.5), (tables[0].PosX, tables[0].PosY));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(6)]
    [InlineData(20)]
    [InlineData(40)]
    public void The_arranged_tables_lie_inside_the_plan_without_overlapping(int count)
    {
        var tables = MixedTables(count);

        TableLayout.Arrange(tables, 100);

        Assert.All(tables, t => AssertInside(t, 100));
        AssertNoOverlap(tables, 100);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(6)]
    [InlineData(20)]
    public void Up_to_20_tables_keep_room_for_their_chairs_and_a_distance_to_the_edge(int count)
    {
        var tables = MixedTables(count);

        TableLayout.Arrange(tables, 100);

        Assert.All(tables, t => AssertInside(t, 100, TableLayout.ChairSpace));
        AssertNoOverlap(tables, 100, TableLayout.ChairSpace);
    }

    [Theory]
    [InlineData(6)]
    [InlineData(20)]
    [InlineData(40)]
    public void The_tables_are_arranged_in_rows_in_the_order_of_their_numbers(int count)
    {
        var tables = MixedTables(count);

        TableLayout.Arrange(tables, 100);

        // "1", "2", ..., "10", "11": length first, then ordinal, as the table list.
        var ordered = tables.OrderBy(t => int.Parse(t.Number)).ToList();
        for (var i = 1; i < ordered.Count; i++)
        {
            var previous = ordered[i - 1];
            var current = ordered[i];
            var sameRow = Math.Abs(previous.PosY - current.PosY) < Tolerance;
            Assert.True(sameRow ? current.PosX > previous.PosX : current.PosY > previous.PosY,
                $"Table {current.Number} does not follow table {previous.Number}.");
        }
        Assert.True(ordered.Select(t => t.PosY).Distinct().Count() > 1, "The tables should be spread over several rows.");
    }

    [Fact]
    public void A_larger_table_scale_still_fits_the_plan()
    {
        // At 200 % a table takes four times the room: 10 tables are like 40 at 100 %.
        var tables = MixedTables(10);

        TableLayout.Arrange(tables, 200);

        Assert.All(tables, t => AssertInside(t, 200));
        AssertNoOverlap(tables, 200);
    }

    [Fact]
    public void Tables_that_cannot_fit_overlap_but_stay_inside_the_plan()
    {
        var tables = MixedTables(40);

        TableLayout.Arrange(tables, 200);

        Assert.All(tables, t => AssertInside(t, 200));
    }

    [Fact]
    public void A_new_table_in_an_empty_area_comes_to_the_middle()
    {
        var table = new Table { Number = "1", Seats = 4, Shape = TableShape.Square };

        Assert.Equal((0.5, 0.5), TableLayout.FreePosition([], table, 100));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(6)]
    [InlineData(20)]
    public void A_new_table_does_not_overlap_the_arranged_tables(int count)
    {
        var tables = MixedTables(count);
        TableLayout.Arrange(tables, 100);
        var table = new Table { Number = "X1", Seats = 8, Shape = TableShape.Rectangle };

        (table.PosX, table.PosY) = TableLayout.FreePosition(tables, table, 100);

        AssertInside(table, 100);
        Assert.All(tables, t => Assert.False(Overlap(t, table, 100), $"The new table overlaps table {t.Number}."));
    }

    [Fact]
    public void A_new_table_avoids_tables_that_were_moved_by_hand()
    {
        // Tables spread over the whole plan except the bottom right corner.
        var tables = new List<Table>();
        for (var i = 0; i < 12; i++)
        {
            tables.Add(new Table { Number = $"{i + 1}", Seats = 4, Shape = TableShape.Square, PosX = 0.1 + i % 4 * 0.2, PosY = 0.15 + i / 4 * 0.3 });
        }
        tables.RemoveAt(11);
        var table = new Table { Number = "13", Seats = 2, Shape = TableShape.Round };

        (table.PosX, table.PosY) = TableLayout.FreePosition(tables, table, 100);

        AssertInside(table, 100);
        Assert.All(tables, t => Assert.False(Overlap(t, table, 100, TableLayout.ChairSpace), $"The new table is too close to table {t.Number}."));
    }
}
