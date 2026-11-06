using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>
/// A table, or a combination of tables (<see cref="TableCombination"/>), that is free for a reservation. <see cref="Kind"/> is
/// <see cref="TableKind"/> or <see cref="CombinationKind"/>; <see cref="Id"/> is the id of the table or of the combination,
/// <see cref="TableIds"/> are its tables in number order and <see cref="Number"/> (and <see cref="Label"/>) their numbers, e.g. "4 + 5".
/// </summary>
public record FreeTable(Guid Id, string Number, int Seats, Guid AreaId, string AreaName, string Kind, IReadOnlyList<Guid> TableIds)
{
    public const string TableKind = "table";
    public const string CombinationKind = "combination";

    public string Label => Number;
}

/// <summary>A possible start time and the tables free from it for the whole duration, in the order the system assigns them.</summary>
public record TimeSlot(TimeOnly Time, IReadOnlyList<FreeTable> FreeTables);

/// <summary>The possible start times within one opening window of a day.</summary>
public record PeriodSlots(OpenPeriod Period, IReadOnlyList<TimeSlot> Slots);

/// <summary>The result of <see cref="IAvailabilityService.CheckAsync"/>: the error code, or the table or combination for the reservation.</summary>
public record BookingCheck(string? Error, FreeTable? Table);

/// <summary>The result of <see cref="IAvailabilityService.CheckWalkInAsync"/>: the error code, or the start (now) and the free tables (no combinations).</summary>
public record WalkInCheck(string? Error, DateTime Start, IReadOnlyList<FreeTable> FreeTables);

/// <summary>
/// When the current restaurant has a table free. A reservation occupies all its tables (<see cref="Reservation.Tables"/>); a
/// combination (<see cref="TableCombination"/>) is free when all its tables are. The free tables come first, smallest first, then
/// the free combinations, smallest first, so the system gives a combination only when no single table fits. Online bookings only
/// get tables and combinations of areas open for online booking, within the area's online quota and whose smallest party
/// (<see cref="Table.MinGuests"/>, <see cref="TableCombination.MinGuests"/>) the party reaches, combinations only when they are
/// <see cref="TableCombination.OnlineBookable"/>, and are bound to the restaurant's lead time, booking horizon and largest online
/// party (<see cref="ReservationSettings"/>); staff bookings get every table and combination that seats the party. The opening
/// hours and the buffer after every reservation apply to both.
/// </summary>
public interface IAvailabilityService
{
    /// <summary>The current local time of the restaurant; null while it has no location (and thus no time zone).</summary>
    Task<DateTime?> GetLocalNowAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// The start times of <paramref name="date"/> in 15-minute steps, grouped by opening window, with the free tables
    /// for <paramref name="guests"/>. Times in the past (and, online, within the lead time, days beyond the booking horizon
    /// and parties larger than the largest online party) have no free tables.
    /// Empty when the restaurant is closed or has no location.
    /// </summary>
    Task<IReadOnlyList<PeriodSlots>> GetSlotsAsync(DateOnly date, int guests, int durationMinutes, ReservationSource channel,
        Guid? ignoreReservationId = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks a reservation and picks its tables: <paramref name="tableIds"/> if given and free (one table, or exactly the tables of
    /// one combination; any other set of several tables: "invalid_tables"), otherwise the smallest free table that seats the party
    /// (then by area order and table number), and only without one the smallest free combination. <paramref name="ignoreReservationId"/>
    /// is the reservation being changed, so it does not collide with itself. <paramref name="checkPast"/> false skips the "in the past"
    /// check, <paramref name="checkOpeningHours"/> false the check of the start time against the opening hours.
    /// </summary>
    Task<BookingCheck> CheckAsync(DateOnly date, TimeOnly time, int guests, int durationMinutes, ReservationSource channel,
        IReadOnlyCollection<Guid>? tableIds, Guid? ignoreReservationId = null, bool checkPast = true, bool checkOpeningHours = true,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The largest party that can be booked online: the seats of the largest table or combination that can be booked online
    /// (0 if none), limited by <see cref="ReservationSettings.MaxOnlinePartySize"/>.
    /// </summary>
    Task<int> GetMaxOnlinePartySizeAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// The tables free for a walk-in of <paramref name="guests"/> from now (to the minute) for <paramref name="durationMinutes"/>,
    /// in the order the system assigns them. Walk-ins only get single tables, no combinations. Now has to lie within an opening
    /// window; the end may lie after it. The online quota does not apply. Errors: "invalid_party_size", "outside_opening_hours".
    /// </summary>
    Task<WalkInCheck> CheckWalkInAsync(int guests, int durationMinutes, CancellationToken cancellationToken = default);

    /// <summary>
    /// Whether all the tables are free from <paramref name="startLocal"/> to <paramref name="endLocal"/> (plus the buffer around the
    /// other reservations), apart from the reservation <paramref name="ignoreReservationId"/>.
    /// </summary>
    Task<bool> AreTablesFreeAsync(IReadOnlyCollection<Guid> tableIds, DateTime startLocal, DateTime endLocal, Guid ignoreReservationId,
        CancellationToken cancellationToken = default);
}

public class AvailabilityService(AppDbContext db, ITenantContext tenantContext, IOpeningCalendar openingCalendar, TimeProvider timeProvider) : IAvailabilityService
{
    private record TableInfo(Table Table, Area Area);

    /// <summary>A combination with its area and its tables in number order; <see cref="Label"/> their numbers, e.g. "4 + 5".</summary>
    private record CombinationInfo(TableCombination Combination, Area Area, List<Table> Tables, string Label);

    /// <summary>The tables and the combinations of the restaurant, in the order the system assigns them among ones of the same size.</summary>
    private record Floor(List<TableInfo> Tables, List<CombinationInfo> Combinations);

    /// <summary>
    /// A reservation that occupies <see cref="TableIds"/>. <see cref="Seats"/> count for the online quota of <see cref="AreaId"/>:
    /// those of the combination when the tables are one, otherwise those of the tables.
    /// </summary>
    private record BusyReservation(IReadOnlyList<Guid> TableIds, Guid AreaId, int Seats, DateTime Start, DateTime End, ReservationSource Source);

    public async Task<DateTime?> GetLocalNowAsync(CancellationToken cancellationToken = default)
    {
        var timeZoneId = await db.Tenants
            .Where(t => t.Id == tenantContext.TenantId)
            .Select(t => t.TimeZoneId)
            .SingleOrDefaultAsync(cancellationToken);
        return timeZoneId is null ? null : TimeZoneInfo.ConvertTimeBySystemTimeZoneId(timeProvider.GetUtcNow().UtcDateTime, timeZoneId);
    }

    public async Task<IReadOnlyList<PeriodSlots>> GetSlotsAsync(DateOnly date, int guests, int durationMinutes, ReservationSource channel,
        Guid? ignoreReservationId = null, CancellationToken cancellationToken = default)
    {
        if (await GetLocalNowAsync(cancellationToken) is not { } now)
        {
            return [];
        }
        var periods = await openingCalendar.GetOpenPeriodsAsync(date, cancellationToken);
        if (periods.Count == 0)
        {
            return [];
        }

        var settings = await LoadSettingsAsync(cancellationToken);
        var floor = await LoadFloorAsync(cancellationToken);
        var online = channel == ReservationSource.Online;
        var notBookable = online && (IsTooFarAhead(date, now, settings) || guests > MaxPartySize(floor, channel, settings));
        // Online, the first possible start is now plus the lead time; staff can book any time after now.
        var earliestOnline = now.AddMinutes(online ? settings.MinLeadTimeMinutes : 0);
        var busy = await LoadBusyAsync(floor, DayStart(date), DayStart(date).AddDays(1), settings.BufferMinutes, ignoreReservationId, cancellationToken);

        var result = new List<PeriodSlots>();
        foreach (var period in periods)
        {
            var slots = new List<TimeSlot>();
            foreach (var start in StartTimes(date, period, durationMinutes))
            {
                var free = start <= now || start < earliestOnline || notBookable
                    ? []
                    : FreeTables(floor, busy, start, start.AddMinutes(durationMinutes), settings.BufferMinutes, guests, channel);
                slots.Add(new TimeSlot(TimeOnly.FromDateTime(start), free));
            }
            result.Add(new PeriodSlots(period, slots));
        }
        return result;
    }

    public async Task<BookingCheck> CheckAsync(DateOnly date, TimeOnly time, int guests, int durationMinutes, ReservationSource channel,
        IReadOnlyCollection<Guid>? tableIds, Guid? ignoreReservationId = null, bool checkPast = true, bool checkOpeningHours = true,
        CancellationToken cancellationToken = default)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        var floor = await LoadFloorAsync(cancellationToken);
        // Several tables only together as one of the combinations.
        if (tableIds is not null && (tableIds.Count == 0 || tableIds.Distinct().Count() != tableIds.Count
            || (tableIds.Count > 1 && !floor.Combinations.Any(c => IsSameSet(c.Tables.Select(t => t.Id).ToList(), tableIds)))))
        {
            return Error("invalid_tables");
        }
        if (guests < 1 || guests > MaxPartySize(floor, channel, settings))
        {
            return Error("invalid_party_size");
        }

        // Without a location the restaurant has no time zone and is not bookable.
        if (await GetLocalNowAsync(cancellationToken) is not { } now)
        {
            return Error("outside_opening_hours");
        }
        var start = date.ToDateTime(time);
        if (checkPast && start <= now)
        {
            return Error("in_the_past");
        }
        if (channel == ReservationSource.Online && start < now.AddMinutes(settings.MinLeadTimeMinutes))
        {
            return Error("too_short_notice");
        }
        if (channel == ReservationSource.Online && IsTooFarAhead(date, now, settings))
        {
            return Error("too_far_ahead");
        }

        var periods = await openingCalendar.GetOpenPeriodsAsync(date, cancellationToken);
        if (checkOpeningHours && !periods.Any(period => StartTimes(date, period, durationMinutes).Contains(start)))
        {
            return Error("outside_opening_hours");
        }

        var busy = await LoadBusyAsync(floor, DayStart(date), DayStart(date).AddDays(1), settings.BufferMinutes, ignoreReservationId, cancellationToken);
        var free = FreeTables(floor, busy, start, start.AddMinutes(durationMinutes), settings.BufferMinutes, guests, channel);
        if (tableIds is not null)
        {
            var table = free.FirstOrDefault(t => IsSameSet(t.TableIds, tableIds));
            return table is null ? Error("table_unavailable") : new BookingCheck(null, table);
        }
        return free.Count == 0 ? Error("slot_unavailable") : new BookingCheck(null, free[0]);
    }

    public async Task<int> GetMaxOnlinePartySizeAsync(CancellationToken cancellationToken = default) =>
        MaxPartySize(await LoadFloorAsync(cancellationToken), ReservationSource.Online, await LoadSettingsAsync(cancellationToken));

    public async Task<WalkInCheck> CheckWalkInAsync(int guests, int durationMinutes, CancellationToken cancellationToken = default)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        // Walk-ins only get single tables.
        var floor = await LoadFloorAsync(cancellationToken) with { Combinations = [] };
        if (guests < 1 || guests > MaxPartySize(floor, ReservationSource.Staff, settings))
        {
            return new WalkInCheck("invalid_party_size", default, []);
        }
        if (await GetLocalNowAsync(cancellationToken) is not { } now)
        {
            return new WalkInCheck("outside_opening_hours", default, []);
        }

        var start = new DateTime(now.Year, now.Month, now.Day, now.Hour, now.Minute, 0);
        var date = DateOnly.FromDateTime(start);
        var time = TimeOnly.FromDateTime(start);
        var periods = await openingCalendar.GetOpenPeriodsAsync(date, cancellationToken);
        if (!periods.Any(period => period.Start <= time && (period.End == OpeningPeriod.EndOfDay || time < period.End)))
        {
            return new WalkInCheck("outside_opening_hours", default, []);
        }

        var end = start.AddMinutes(durationMinutes);
        var busy = await LoadBusyAsync(floor, start, end, settings.BufferMinutes, null, cancellationToken);
        return new WalkInCheck(null, start, FreeTables(floor, busy, start, end, settings.BufferMinutes, guests, ReservationSource.Staff));
    }

    public async Task<bool> AreTablesFreeAsync(IReadOnlyCollection<Guid> tableIds, DateTime startLocal, DateTime endLocal, Guid ignoreReservationId,
        CancellationToken cancellationToken = default)
    {
        var bufferMinutes = (await LoadSettingsAsync(cancellationToken)).BufferMinutes;
        var busy = await LoadBusyAsync(await LoadFloorAsync(cancellationToken), startLocal, endLocal, bufferMinutes, ignoreReservationId, cancellationToken);
        return busy.All(r => !r.TableIds.Any(tableIds.Contains));
    }

    private static BookingCheck Error(string error) => new(error, null);

    private static bool IsSameSet(IReadOnlyCollection<Guid> a, IReadOnlyCollection<Guid> b) => a.Count == b.Count && a.All(b.Contains);

    private static DateTime DayStart(DateOnly date) => date.ToDateTime(TimeOnly.MinValue);

    /// <summary>The stored settings, or the defaults when the restaurant has not saved any.</summary>
    private async Task<ReservationSettings> LoadSettingsAsync(CancellationToken cancellationToken) =>
        await db.ReservationSettings.AsNoTracking().SingleOrDefaultAsync(cancellationToken) ?? new ReservationSettings();

    /// <summary>Online, a date later than today plus <see cref="ReservationSettings.BookingHorizonDays"/> is too far ahead.</summary>
    private static bool IsTooFarAhead(DateOnly date, DateTime now, ReservationSettings settings) =>
        date > DateOnly.FromDateTime(now).AddDays(settings.BookingHorizonDays);

    /// <summary>
    /// The start times in an opening window: every quarter hour from its start, up to its end minus the duration
    /// (<see cref="ReservationRules.MustEndByClosingTime"/>).
    /// </summary>
    private static IEnumerable<DateTime> StartTimes(DateOnly date, OpenPeriod period, int durationMinutes)
    {
        var periodEnd = period.End == OpeningPeriod.EndOfDay ? date.AddDays(1).ToDateTime(TimeOnly.MinValue) : date.ToDateTime(period.End);
        var lastStart = ReservationRules.MustEndByClosingTime
            ? periodEnd.AddMinutes(-durationMinutes)
            : periodEnd.AddMinutes(-ReservationRules.SlotMinutes);

        var minutes = period.Start.Hour * 60 + period.Start.Minute;
        var firstMinute = (minutes + ReservationRules.SlotMinutes - 1) / ReservationRules.SlotMinutes * ReservationRules.SlotMinutes;
        for (var start = date.ToDateTime(TimeOnly.MinValue).AddMinutes(firstMinute); start <= lastStart; start = start.AddMinutes(ReservationRules.SlotMinutes))
        {
            yield return start;
        }
    }

    /// <summary>
    /// All tables with their area, and all combinations with their area and tables, in the order the system assigns them among
    /// ones of the same size: by area order, then by table number (of a combination: of its first table).
    /// </summary>
    private async Task<Floor> LoadFloorAsync(CancellationToken cancellationToken)
    {
        var tables = (await db.Tables
            .Join(db.Areas, t => t.AreaId, a => a.Id, (t, a) => new TableInfo(t, a))
            .ToListAsync(cancellationToken))
            .OrderBy(t => t.Area.SortOrder).ThenBy(t => t.Area.Name, StringComparer.Ordinal)
            .ThenBy(t => t.Table.Number.Length).ThenBy(t => t.Table.Number, StringComparer.Ordinal)
            .ToList();
        var tableById = tables.ToDictionary(t => t.Table.Id);
        var position = tables.Select((t, i) => (t.Table.Id, i)).ToDictionary(x => x.Id, x => x.i);
        var combinations = (await db.TableCombinations.Include(c => c.Tables).ToListAsync(cancellationToken))
            .Select(c =>
            {
                var combined = c.Tables.Select(t => tableById[t.TableId]).OrderBy(t => position[t.Table.Id]).Select(t => t.Table).ToList();
                return new CombinationInfo(c, tableById[combined[0].Id].Area, combined, CombinedLabel(combined));
            })
            .OrderBy(c => position[c.Tables[0].Id]).ThenBy(c => c.Label, StringComparer.Ordinal)
            .ToList();
        return new Floor(tables, combinations);
    }

    /// <summary>The numbers of tables joined for a combined reservation, e.g. "4 + 5", in the given order.</summary>
    public static string CombinedLabel(IEnumerable<Table> tables) => string.Join(" + ", tables.Select(t => t.Number));

    /// <summary>
    /// The reservations that occupy their tables between <paramref name="from"/> and <paramref name="to"/>, including the buffer
    /// of <paramref name="bufferMinutes"/> after them and after the new reservation. A reservation whose guest has left
    /// (<see cref="ReservationStatus.Completed"/>) occupies them only until the guest left (at most until its end), plus the buffer.
    /// </summary>
    private async Task<List<BusyReservation>> LoadBusyAsync(Floor floor, DateTime from, DateTime to, int bufferMinutes, Guid? ignoreReservationId,
        CancellationToken cancellationToken)
    {
        // A reservation ending up to the buffer before from, or starting up to the buffer after to, still collides.
        var startsBefore = to.AddMinutes(bufferMinutes);
        var endsAfter = from.AddMinutes(-bufferMinutes);
        var reservations = await db.Reservations
            .Include(r => r.Tables)
            .Where(r => r.StartLocal < startsBefore && r.EndLocal > endsAfter && r.Id != ignoreReservationId
                && (ReservationRules.BlockingStatuses.Contains(r.Status) || r.Status == ReservationStatus.Completed))
            .ToListAsync(cancellationToken);
        var tableById = floor.Tables.ToDictionary(t => t.Table.Id);
        return reservations
            .Select(r =>
            {
                var tableIds = r.Tables.Select(t => t.TableId).ToList();
                var combination = tableIds.Count > 1
                    ? floor.Combinations.FirstOrDefault(c => IsSameSet(c.Tables.Select(t => t.Id).ToList(), tableIds))
                    : null;
                return new BusyReservation(
                    tableIds,
                    tableById[r.TableId].Area.Id,
                    combination?.Combination.Seats ?? tableIds.Sum(id => tableById[id].Table.Seats),
                    r.StartLocal,
                    r.Status == ReservationStatus.Completed && r.CompletedAtLocal < r.EndLocal ? r.CompletedAtLocal.Value : r.EndLocal,
                    r.Source);
            })
            .Where(r => r.Start < r.End && r.Start < startsBefore && r.End > endsAfter)
            .ToList();
    }

    /// <summary>
    /// The tables free from <paramref name="start"/> to <paramref name="end"/> that seat the party, smallest first, followed by the
    /// combinations whose tables are all free and that seat the party, smallest first. Online only those whose smallest party it
    /// reaches, so a small party never gets a large table online, also when no smaller one is free. Every reservation, the new one
    /// as well, occupies its tables for <paramref name="bufferMinutes"/> after its end.
    /// </summary>
    private static List<FreeTable> FreeTables(Floor floor, List<BusyReservation> busy, DateTime start, DateTime end, int bufferMinutes,
        int guests, ReservationSource channel)
    {
        var occupied = busy
            .Where(r => r.Start < end.AddMinutes(bufferMinutes) && r.End.AddMinutes(bufferMinutes) > start)
            .SelectMany(r => r.TableIds)
            .ToHashSet();
        // The online quota counts the guests at the tables, so the buffer does not count for it.
        var overlapping = busy.Where(r => r.Start < end && r.End > start).ToList();
        var online = channel == ReservationSource.Online;

        // Online quota: the seats of the area's online reservations in this time plus the new table or combination
        // must not exceed the area's online share of its seats.
        bool WithinOnlineQuota(Area area, int seats) =>
            overlapping.Where(r => r.Source == ReservationSource.Online && r.AreaId == area.Id).Sum(r => r.Seats) + seats
                <= OnlineSeatLimit(floor, area);

        var tables = floor.Tables.Where(t => t.Table.Seats >= guests && !occupied.Contains(t.Table.Id)
            && (!online || (t.Area.OnlineBookingEnabled && guests >= t.Table.MinGuests && WithinOnlineQuota(t.Area, t.Table.Seats))));
        var combinations = floor.Combinations.Where(c => c.Combination.Seats >= guests && c.Tables.All(t => !occupied.Contains(t.Id))
            && (!online || (c.Combination.OnlineBookable && c.Area.OnlineBookingEnabled && guests >= c.Combination.MinGuests
                && WithinOnlineQuota(c.Area, c.Combination.Seats))));

        // OrderBy is stable, so ones of the same size keep the order of the areas and table numbers.
        return
        [
            .. tables
                .OrderBy(t => t.Table.Seats)
                .Select(t => new FreeTable(t.Table.Id, t.Table.Number, t.Table.Seats, t.Area.Id, t.Area.Name, FreeTable.TableKind, [t.Table.Id])),
            .. combinations
                .OrderBy(c => c.Combination.Seats)
                .Select(c => new FreeTable(c.Combination.Id, c.Label, c.Combination.Seats, c.Area.Id, c.Area.Name, FreeTable.CombinationKind,
                    c.Tables.Select(t => t.Id).ToList())),
        ];
    }

    /// <summary>How many of an area's seats can be booked online at the same time: floor(seats of its tables × percent / 100).</summary>
    private static int OnlineSeatLimit(Floor floor, Area area) =>
        floor.Tables.Where(t => t.Area.Id == area.Id).Sum(t => t.Table.Seats) * area.OnlineCapacityPercent / 100;

    /// <summary>
    /// The seats of the largest table or combination the channel can book; online only tables and combinations that fit into
    /// their area's online quota (combinations only when bookable online), and at most <see cref="ReservationSettings.MaxOnlinePartySize"/>
    /// when it is set.
    /// </summary>
    private static int MaxPartySize(Floor floor, ReservationSource channel, ReservationSettings settings)
    {
        var staff = channel == ReservationSource.Staff;
        var largest = floor.Tables
            .Where(t => staff || (t.Area.OnlineBookingEnabled && t.Table.Seats <= OnlineSeatLimit(floor, t.Area)))
            .Select(t => t.Table.Seats)
            .Concat(floor.Combinations
                .Where(c => staff || (c.Combination.OnlineBookable && c.Area.OnlineBookingEnabled && c.Combination.Seats <= OnlineSeatLimit(floor, c.Area)))
                .Select(c => c.Combination.Seats))
            .DefaultIfEmpty(0)
            .Max();
        return channel == ReservationSource.Online && settings.MaxOnlinePartySize is { } limit ? Math.Min(largest, limit) : largest;
    }
}
