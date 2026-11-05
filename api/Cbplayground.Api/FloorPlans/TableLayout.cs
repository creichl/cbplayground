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

    /// <summary>The real length of a table per seat in metres: a table for 4 is 85 cm, as in most restaurants.</summary>
    public const double RealSizePerSeatMeters = 0.2125;

    /// <summary>
    /// The table scale in percent at which the tables of a plan <paramref name="widthMeters"/> wide are drawn at their real size
    /// (<see cref="RealSizePerSeatMeters"/>), rounded to whole percent: 18 m give 67 %, 12 m 101 %.
    /// </summary>
    public static int RealSizeScale(double widthMeters) =>
        (int)Math.Round(100 * RealSizePerSeatMeters / (SizePerSeat * widthMeters), MidpointRounding.AwayFromZero);

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
    /// The room kept free in front of an <see cref="RoomElementKind.Entrance"/>, in plan widths: about the depth of a table
    /// with its chairs (<see cref="RectangleDepth"/> plus <see cref="ChairSpace"/> on both sides).
    /// </summary>
    public const double EntranceZoneDepth = 0.10;

    /// <summary>
    /// Sets the positions of the tables of one area: in rows from top left to bottom right, in the order of the table number
    /// (length first, then ordinal, as the table list). Every row spreads its tables evenly over the width, the rows are spread
    /// evenly over the height, so larger tables get more room. The number of rows is the one with the largest distances.
    /// The tables keep their <see cref="ChairSpace"/> and a distance to each other and to the edge; with many tables the distance
    /// shrinks, then the chair space. They only overlap when they do not fit side by side even without it.
    /// With room <paramref name="elements"/> (only in an area without floor plan image) the tables and their chairs also keep away
    /// from the blocking elements and the room in front of an entrance (<see cref="Obstacles"/>): a row is spread over the free
    /// pieces of its width, and the rows may also be spread over the height between elements at the top and the bottom of the
    /// room, whichever leaves the largest distances. Only when the tables do not fit beside the elements even overlapping each
    /// other, they are arranged as if there were no elements.
    /// </summary>
    public static void Arrange(IReadOnlyCollection<Table> tables, int tableScale, IReadOnlyCollection<RoomElement>? elements = null)
    {
        var ordered = InNumberOrder(tables);
        var positions = Positions(ordered.Select(t => TableSize(t.Shape, t.Seats, t.Rotation, tableScale)).ToList(), ChairSpace * tableScale / 100, Obstacles(elements));
        for (var i = 0; i < ordered.Count; i++)
        {
            (ordered[i].PosX, ordered[i].PosY) = positions[i];
        }
    }

    /// <summary>
    /// The position of a new table among the <paramref name="existing"/> tables of an area without floor plan image: the first
    /// place of the arrangement of all tables, the new one included, that does not overlap an existing table with its chairs;
    /// otherwise the first such place top left to bottom right, then the first one where at least the tables do not overlap.
    /// None of these places touches a blocking room element or the room in front of an entrance, the chairs included as far as
    /// they are. The middle only when there is no such place at all, or, if the middle lies on a room element, the first place
    /// that is free of the elements.
    /// </summary>
    public static (double X, double Y) FreePosition(IReadOnlyCollection<Table> existing, Table table, int tableScale, IReadOnlyCollection<RoomElement>? elements = null)
    {
        var size = Fraction(TableSize(table.Shape, table.Seats, table.Rotation, tableScale));
        var others = existing.Select(t => (t.PosX, t.PosY, Size: Fraction(TableSize(t.Shape, t.Seats, t.Rotation, tableScale)))).ToList();
        var obstacles = Obstacles(elements);
        var chairSpace = ChairSpace * tableScale / 100;
        var slots = Positions(InNumberOrder([.. existing, table]).Select(t => TableSize(t.Shape, t.Seats, t.Rotation, tableScale)).ToList(), chairSpace, obstacles);

        // The chair space around a table is space in plan widths: as a fraction of the plan width and of the plan height.
        bool IsFree((double X, double Y) position, double space, bool besideTables)
        {
            var spaceX = space;
            var spaceY = space * AspectRatio;
            var left = position.X - size.Width / 2;
            var right = position.X + size.Width / 2;
            var top = position.Y - size.Height / 2;
            var bottom = position.Y + size.Height / 2;
            return left >= 0 && right <= 1 && top >= 0 && bottom <= 1
                && (!besideTables || others.All(o =>
                    Math.Abs(position.X - o.PosX) >= (size.Width + o.Size.Width) / 2 + 2 * spaceX - Tolerance
                    || Math.Abs(position.Y - o.PosY) >= (size.Height + o.Size.Height) / 2 + 2 * spaceY - Tolerance))
                && obstacles.All(o =>
                    right + spaceX <= o.Left + Tolerance || left - spaceX >= o.Right - Tolerance
                    || bottom + spaceY <= o.Top * AspectRatio + Tolerance || top - spaceY >= o.Bottom * AspectRatio - Tolerance);
        }

        (double X, double Y)? FirstFree(double space, bool besideTables)
        {
            foreach (var slot in slots)
            {
                if (IsFree(slot, space, besideTables))
                {
                    return slot;
                }
            }
            var spaceY = space * AspectRatio;
            for (var y = size.Height / 2 + spaceY; y <= 1 - size.Height / 2 - spaceY; y += GridStep)
            {
                for (var x = size.Width / 2 + space; x <= 1 - size.Width / 2 - space; x += GridStep)
                {
                    if (IsFree((x, y), space, besideTables))
                    {
                        return (x, y);
                    }
                }
            }
            return null;
        }

        foreach (var space in new[] { chairSpace, 0 })
        {
            if (FirstFree(space, besideTables: true) is { } position)
            {
                return position;
            }
        }
        // The room is full: overlapping a table comes before overlapping a room element.
        (double X, double Y) middle = (0.5, 0.5);
        return IsFree(middle, 0, besideTables: false) ? middle : FirstFree(0, besideTables: false) ?? middle;
    }

    /// <summary>Steps of the search for a free place, as a fraction of the plan.</summary>
    private const double GridStep = 0.01;

    /// <summary>Rounding errors that do not count as overlap.</summary>
    private const double Tolerance = 1e-9;

    /// <summary>A rectangle in plan widths: from the left 0–1, from the top 0 to the plan height.</summary>
    private readonly record struct Box(double Left, double Top, double Right, double Bottom);

    /// <summary>A possible arrangement: the smallest distance (negative when tables overlap each other), whether every table lies beside the obstacles, and the centres (0–1).</summary>
    private record Layout(double Gap, bool Fits, List<(double X, double Y)> Positions);

    private static bool IsBetter(bool fits, double gap, Layout than) => fits != than.Fits ? fits : gap > than.Gap;

    /// <summary>Room elements on which no table may stand: <see cref="RoomElementKind.Window"/> and <see cref="RoomElementKind.Label"/> do not block.</summary>
    private static bool IsBlocking(RoomElementKind kind) => kind is RoomElementKind.Bar or RoomElementKind.Pillar or RoomElementKind.Sofa
        or RoomElementKind.Stage or RoomElementKind.Service or RoomElementKind.Stairs or RoomElementKind.Plant;

    /// <summary>
    /// The rectangles the tables keep away from: every blocking element, and every entrance together with the room of
    /// <see cref="EntranceZoneDepth"/> in front of it, on the side it faces (rotation 0: up, 90: right, 180: down, 270: left).
    /// </summary>
    private static List<Box> Obstacles(IReadOnlyCollection<RoomElement>? elements)
    {
        var obstacles = new List<Box>();
        foreach (var element in elements ?? [])
        {
            if (element.Kind != RoomElementKind.Entrance && !IsBlocking(element.Kind))
            {
                continue;
            }
            var left = element.PosX - element.Width / 2;
            var right = element.PosX + element.Width / 2;
            var top = (element.PosY - element.Height / 2) * PlanHeight;
            var bottom = (element.PosY + element.Height / 2) * PlanHeight;
            if (element.Kind == RoomElementKind.Entrance)
            {
                switch (element.Rotation)
                {
                    case 90: right += EntranceZoneDepth; break;
                    case 180: bottom += EntranceZoneDepth; break;
                    case 270: left -= EntranceZoneDepth; break;
                    default: top -= EntranceZoneDepth; break;
                }
            }
            obstacles.Add(new Box(left, top, right, bottom));
        }
        return obstacles;
    }

    private static List<Table> InNumberOrder(IEnumerable<Table> tables) =>
        tables.OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal).ToList();

    /// <summary>A size in plan widths as fractions of the plan width and height.</summary>
    private static (double Width, double Height) Fraction((double Width, double Height) size) => (size.Width, size.Height * AspectRatio);

    /// <summary>The centres (0–1) for tables of the given sizes (in plan widths), in this order, beside the <paramref name="obstacles"/>.</summary>
    private static List<(double X, double Y)> Positions(List<(double Width, double Height)> sizes, double chairSpace, List<Box> obstacles)
    {
        if (sizes.Count == 0)
        {
            return [];
        }

        // The largest chair space (at most the scaled ChairSpace) with which the tables fit without overlapping;
        // none when they do not even fit without it.
        var best = BestLayout(sizes, chairSpace, obstacles);
        if (best.Gap < 0)
        {
            best = BestLayout(sizes, 0, obstacles);
            if (best.Gap >= 0)
            {
                var low = 0.0;
                var high = chairSpace;
                for (var i = 0; i < 30; i++)
                {
                    var middle = (low + high) / 2;
                    if (BestLayout(sizes, middle, obstacles).Gap >= 0)
                    {
                        low = middle;
                    }
                    else
                    {
                        high = middle;
                    }
                }
                best = BestLayout(sizes, low, obstacles);
            }
        }

        // Overlapping the room elements is the last resort.
        if (!best.Fits && obstacles.Count > 0)
        {
            return Positions(sizes, chairSpace, []);
        }
        return best.Positions;
    }

    /// <summary>
    /// The arrangement with the largest gap between the tables (with <paramref name="space"/> around each), to the edge and to the
    /// obstacles, over every number of rows and every height the rows can be spread over: the whole plan height, or from below an
    /// obstacle that begins in the upper half to above one that ends in the lower half. One where every table lies beside the
    /// obstacles comes first.
    /// </summary>
    private static Layout BestLayout(List<(double Width, double Height)> sizes, double space, List<Box> obstacles)
    {
        List<double> tops = [0, .. obstacles.Where(o => o.Top < PlanHeight / 2 && o.Bottom > 0 && o.Bottom < PlanHeight).Select(o => o.Bottom).Order()];
        List<double> bottoms = [PlanHeight, .. obstacles.Where(o => o.Bottom > PlanHeight / 2 && o.Top < PlanHeight && o.Top > 0).Select(o => o.Top).OrderDescending()];

        Layout? best = null;
        foreach (var top in tops.Distinct())
        {
            foreach (var bottom in bottoms.Distinct().Where(b => b > top))
            {
                for (var rowCount = 1; rowCount <= sizes.Count; rowCount++)
                {
                    var rows = Rows(sizes.Count, rowCount);
                    var rowHeights = rows.Select(row => row.Select(i => sizes[i].Height + 2 * space).Max()).ToList();
                    var verticalGap = (bottom - top - rowHeights.Sum()) / (rowCount + 1);
                    var verticalFits = rowHeights.All(h => h <= bottom - top + Tolerance);
                    // The rows can only make it worse.
                    if (best is not null && !IsBetter(verticalFits, verticalGap, best))
                    {
                        continue;
                    }
                    var layout = ArrangeRows(sizes, space, obstacles, rows, rowHeights, top, bottom, verticalGap, verticalFits);
                    if (best is null || IsBetter(layout.Fits, layout.Gap, best))
                    {
                        best = layout;
                    }
                }
            }
        }
        return best!;
    }

    /// <summary>The rows spread evenly between <paramref name="top"/> and <paramref name="bottom"/>, each spread over the free pieces of its width.</summary>
    private static Layout ArrangeRows(List<(double Width, double Height)> sizes, double space, List<Box> obstacles, List<List<int>> rows,
        List<double> rowHeights, double top, double bottom, double verticalGap, bool verticalFits)
    {
        var gap = verticalGap;
        var fits = verticalFits;
        var rowCentres = Spread(rowHeights, bottom - top).Select(c => top + c).ToList();
        var positions = new (double X, double Y)[sizes.Count];
        for (var r = 0; r < rows.Count; r++)
        {
            var segments = FreeSegments(obstacles, rowCentres[r] - rowHeights[r] / 2, rowCentres[r] + rowHeights[r] / 2);
            var (rowGap, rowFits, centres) = FitRow(rows[r].Select(i => sizes[i].Width + 2 * space).ToList(), segments);
            gap = Math.Min(gap, rowGap);
            fits &= rowFits;
            for (var j = 0; j < rows[r].Count; j++)
            {
                var (width, height) = Fraction(sizes[rows[r][j]]);
                positions[rows[r][j]] = (Inside(centres[j], width), Inside(rowCentres[r] / PlanHeight, height));
            }
        }
        return new Layout(gap, fits, [.. positions]);
    }

    /// <summary>The pieces of the width 0–1 that no obstacle covers between <paramref name="top"/> and <paramref name="bottom"/>, from left to right.</summary>
    private static List<(double Start, double End)> FreeSegments(List<Box> obstacles, double top, double bottom)
    {
        var covered = obstacles
            .Where(o => o.Top < bottom - Tolerance && o.Bottom > top + Tolerance && o.Right > Tolerance && o.Left < 1 - Tolerance)
            .Select(o => (Start: Math.Max(0, o.Left), End: Math.Min(1, o.Right)))
            .OrderBy(c => c.Start);
        var segments = new List<(double Start, double End)>();
        var position = 0.0;
        foreach (var (start, end) in covered)
        {
            if (start > position + Tolerance)
            {
                segments.Add((position, start));
            }
            position = Math.Max(position, end);
        }
        if (position < 1 - Tolerance)
        {
            segments.Add((position, 1));
        }
        return segments;
    }

    /// <summary>
    /// The centres of consecutive pieces of the given lengths, in this order, spread over the free <paramref name="segments"/>:
    /// each segment gets the next pieces and spreads them evenly (<see cref="Spread"/>). The split with the largest gap, one where
    /// every piece fits into its segment first. A row without free segments is spread over the whole width and does not fit.
    /// </summary>
    private static (double Gap, bool Fits, List<double> Centres) FitRow(List<double> lengths, List<(double Start, double End)> segments)
    {
        var n = lengths.Count;
        var m = segments.Count;
        if (m == 0)
        {
            return (double.NegativeInfinity, false, Spread(lengths, 1));
        }

        // The best split of the first i pieces over the first j segments, and where the pieces of segment j - 1 begin.
        var reached = new bool[m + 1, n + 1];
        var fits = new bool[m + 1, n + 1];
        var gaps = new double[m + 1, n + 1];
        var from = new int[m + 1, n + 1];
        reached[0, 0] = true;
        fits[0, 0] = true;
        gaps[0, 0] = double.PositiveInfinity;
        for (var j = 1; j <= m; j++)
        {
            var length = segments[j - 1].End - segments[j - 1].Start;
            for (var i = 0; i <= n; i++)
            {
                var total = 0.0;
                var longest = 0.0;
                for (var k = i; k >= 0; k--)
                {
                    if (k < i)
                    {
                        total += lengths[k];
                        longest = Math.Max(longest, lengths[k]);
                    }
                    if (!reached[j - 1, k])
                    {
                        continue;
                    }
                    var count = i - k;
                    var groupFits = longest <= length + Tolerance;
                    var groupGap = count == 0 ? double.PositiveInfinity : (length - total) / (count + 1);
                    var candidateFits = fits[j - 1, k] && groupFits;
                    var candidateGap = Math.Min(gaps[j - 1, k], groupGap);
                    if (!reached[j, i] || (candidateFits != fits[j, i] ? candidateFits : candidateGap > gaps[j, i]))
                    {
                        reached[j, i] = true;
                        fits[j, i] = candidateFits;
                        gaps[j, i] = candidateGap;
                        from[j, i] = k;
                    }
                }
            }
        }

        var centres = new double[n];
        for (int j = m, i = n; j > 0; j--)
        {
            var k = from[j, i];
            var segment = segments[j - 1];
            var groupCentres = Spread(lengths.GetRange(k, i - k), segment.End - segment.Start);
            for (var g = 0; g < groupCentres.Count; g++)
            {
                centres[k + g] = segment.Start + groupCentres[g];
            }
            i = k;
        }
        return (gaps[m, n], fits[m, n], [.. centres]);
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
