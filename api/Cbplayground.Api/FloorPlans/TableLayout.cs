using Cbplayground.Api.Data;

namespace Cbplayground.Api.FloorPlans;

/// <summary>
/// The schematic floor plan of an area: the size of the drawn tables and their automatic arrangement.
/// A position is the table's centre relative to the plan, 0–1 in both directions. The schematic plan of an area without
/// floor plan image has the aspect ratio 3:2 (width:height); the arrangement always uses it.
/// Sizes are fractions of the plan width at a table scale of 100 %; the web draws the tables with the same constants.
/// </summary>
public static class TableLayout
{
    /// <summary>Width : height of the schematic plan.</summary>
    public const double AspectRatio = 3.0 / 2.0;

    /// <summary>Length of a table per seat: a table for 4 is 7 % of the plan width.</summary>
    public const double SizePerSeat = 0.0175;

    /// <summary>The smallest round or square table (diameter or side).</summary>
    public const double MinTableSize = 0.05;

    /// <summary>The short side of a rectangular table.</summary>
    public const double RectangleDepth = 0.06;

    /// <summary>The shortest long side of a rectangular table.</summary>
    public const double RectangleMinLength = 0.08;

    /// <summary>Room for the chairs on every side of a table, scaled like the tables. The arrangement keeps it free as long as the tables fit.</summary>
    public const double ChairSpace = 0.02;

    /// <summary>The plan height in plan widths.</summary>
    private const double PlanHeight = 1 / AspectRatio;

    /// <summary>
    /// Width and height of the drawn table in plan widths: round and square tables <see cref="SizePerSeat"/> × seats, at least
    /// <see cref="MinTableSize"/>; rectangular ones <see cref="SizePerSeat"/> × seats long, at least <see cref="RectangleMinLength"/>,
    /// and <see cref="RectangleDepth"/> deep, long side horizontal at 0° and vertical at 90°. All multiplied by the table scale.
    /// </summary>
    public static (double Width, double Height) TableSize(TableShape shape, int seats, int rotation, int tableScale)
    {
        var scale = tableScale / 100.0;
        if (shape != TableShape.Rectangle)
        {
            var size = Math.Max(MinTableSize, SizePerSeat * seats) * scale;
            return (size, size);
        }
        var length = Math.Max(RectangleMinLength, SizePerSeat * seats) * scale;
        var depth = RectangleDepth * scale;
        return rotation == 90 ? (depth, length) : (length, depth);
    }

    /// <summary>
    /// Sets the positions of the tables of one area: in rows from top left to bottom right, in the order of the table number
    /// (length first, then ordinal, as the table list). Every row spreads its tables evenly over the width, the rows are spread
    /// evenly over the height, so larger tables get more room. The number of rows is the one with the largest distances.
    /// The tables keep their <see cref="ChairSpace"/> and a distance to each other and to the edge; with many tables the distance
    /// shrinks, then the chair space. They only overlap when they do not fit side by side even without it.
    /// </summary>
    public static void Arrange(IReadOnlyCollection<Table> tables, int tableScale)
    {
        var ordered = InNumberOrder(tables);
        var positions = Positions(ordered.Select(t => TableSize(t.Shape, t.Seats, t.Rotation, tableScale)).ToList(), ChairSpace * tableScale / 100);
        for (var i = 0; i < ordered.Count; i++)
        {
            (ordered[i].PosX, ordered[i].PosY) = positions[i];
        }
    }

    /// <summary>
    /// The position of a new table among the <paramref name="existing"/> tables of an area without floor plan image: the first
    /// place of the arrangement of all tables, the new one included, that does not overlap an existing table with its chairs;
    /// otherwise the first such place top left to bottom right, then the first one where at least the tables do not overlap.
    /// The middle only when there is no such place at all.
    /// </summary>
    public static (double X, double Y) FreePosition(IReadOnlyCollection<Table> existing, Table table, int tableScale)
    {
        var size = Fraction(TableSize(table.Shape, table.Seats, table.Rotation, tableScale));
        var others = existing.Select(t => (t.PosX, t.PosY, Size: Fraction(TableSize(t.Shape, t.Seats, t.Rotation, tableScale)))).ToList();
        var chairSpace = ChairSpace * tableScale / 100;
        var slots = Positions(InNumberOrder([.. existing, table]).Select(t => TableSize(t.Shape, t.Seats, t.Rotation, tableScale)).ToList(), chairSpace);

        foreach (var space in new[] { chairSpace, 0 })
        {
            // The chair space around a table, as a fraction of the plan width and of the plan height.
            var spaceX = space;
            var spaceY = space * AspectRatio;
            bool IsFree((double X, double Y) position) =>
                position.X - size.Width / 2 >= 0 && position.X + size.Width / 2 <= 1
                && position.Y - size.Height / 2 >= 0 && position.Y + size.Height / 2 <= 1
                && others.All(o =>
                    Math.Abs(position.X - o.PosX) >= (size.Width + o.Size.Width) / 2 + 2 * spaceX - Tolerance
                    || Math.Abs(position.Y - o.PosY) >= (size.Height + o.Size.Height) / 2 + 2 * spaceY - Tolerance);

            foreach (var slot in slots)
            {
                if (IsFree(slot))
                {
                    return slot;
                }
            }
            for (var y = size.Height / 2 + spaceY; y <= 1 - size.Height / 2 - spaceY; y += GridStep)
            {
                for (var x = size.Width / 2 + spaceX; x <= 1 - size.Width / 2 - spaceX; x += GridStep)
                {
                    if (IsFree((x, y)))
                    {
                        return (x, y);
                    }
                }
            }
        }
        return (0.5, 0.5);
    }

    /// <summary>Steps of the search for a free place, as a fraction of the plan.</summary>
    private const double GridStep = 0.01;

    /// <summary>Rounding errors that do not count as overlap.</summary>
    private const double Tolerance = 1e-9;

    private static List<Table> InNumberOrder(IEnumerable<Table> tables) =>
        tables.OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal).ToList();

    /// <summary>A size in plan widths as fractions of the plan width and height.</summary>
    private static (double Width, double Height) Fraction((double Width, double Height) size) => (size.Width, size.Height * AspectRatio);

    /// <summary>The centres (0–1) for tables of the given sizes (in plan widths), in this order.</summary>
    private static List<(double X, double Y)> Positions(List<(double Width, double Height)> sizes, double chairSpace)
    {
        if (sizes.Count == 0)
        {
            return [];
        }

        // The largest chair space (at most the scaled ChairSpace) with which the tables fit without overlapping.
        var space = chairSpace;
        if (BestRowCount(sizes, space).Gap < 0)
        {
            var low = 0.0;
            var high = chairSpace;
            for (var i = 0; i < 30; i++)
            {
                var middle = (low + high) / 2;
                if (BestRowCount(sizes, middle).Gap >= 0)
                {
                    low = middle;
                }
                else
                {
                    high = middle;
                }
            }
            space = low;
        }

        var rows = Rows(sizes.Count, BestRowCount(sizes, space).Rows);
        var rowHeights = rows.Select(row => row.Select(i => sizes[i].Height + 2 * space).Max()).ToList();
        var rowCentres = Spread(rowHeights, PlanHeight);
        var positions = new (double X, double Y)[sizes.Count];
        for (var r = 0; r < rows.Count; r++)
        {
            var centres = Spread(rows[r].Select(i => sizes[i].Width + 2 * space).ToList(), 1);
            for (var j = 0; j < rows[r].Count; j++)
            {
                var (width, height) = Fraction(sizes[rows[r][j]]);
                positions[rows[r][j]] = (Inside(centres[j], width), Inside(rowCentres[r] / PlanHeight, height));
            }
        }
        return [.. positions];
    }

    /// <summary>
    /// The number of rows with the largest gap between the tables (with <paramref name="space"/> around each) and to the edge;
    /// the gap is negative when they do not fit.
    /// </summary>
    private static (int Rows, double Gap) BestRowCount(List<(double Width, double Height)> sizes, double space)
    {
        var best = (Rows: 1, Gap: double.NegativeInfinity);
        for (var rowCount = 1; rowCount <= sizes.Count; rowCount++)
        {
            var rows = Rows(sizes.Count, rowCount);
            var rowHeights = rows.Select(row => row.Select(i => sizes[i].Height + 2 * space).Max()).ToList();
            var gap = (PlanHeight - rowHeights.Sum()) / (rowCount + 1);
            foreach (var row in rows)
            {
                gap = Math.Min(gap, (1 - row.Select(i => sizes[i].Width + 2 * space).Sum()) / (row.Count + 1));
            }
            if (gap > best.Gap)
            {
                best = (rowCount, gap);
            }
        }
        return best;
    }

    /// <summary>The indexes 0 to count − 1 in order, split into rows that differ by at most one table, the longer rows first.</summary>
    private static List<List<int>> Rows(int count, int rowCount)
    {
        var rows = new List<List<int>>();
        var next = 0;
        for (var r = 0; r < rowCount; r++)
        {
            var length = count / rowCount + (r < count % rowCount ? 1 : 0);
            rows.Add(Enumerable.Range(next, length).ToList());
            next += length;
        }
        return rows;
    }

    /// <summary>
    /// The centres of consecutive pieces of the given lengths on a line of length <paramref name="total"/>, with equal gaps
    /// between them and at both ends. When they do not fit, they overlap evenly from end to end instead.
    /// </summary>
    private static List<double> Spread(List<double> lengths, double total)
    {
        var free = total - lengths.Sum();
        if (free < 0 && lengths.Count == 1)
        {
            return [total / 2];
        }
        var gap = free >= 0 ? free / (lengths.Count + 1) : free / (lengths.Count - 1);
        var position = free >= 0 ? gap : 0;
        var centres = new List<double>();
        foreach (var length in lengths)
        {
            centres.Add(position + length / 2);
            position += length + gap;
        }
        return centres;
    }

    /// <summary>The centre moved so that a table of this size lies within 0–1, as far as it can.</summary>
    private static double Inside(double centre, double size) =>
        size >= 1 ? 0.5 : Math.Clamp(centre, size / 2, 1 - size / 2);
}
