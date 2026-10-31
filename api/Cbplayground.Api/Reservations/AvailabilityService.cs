using Cbplayground.Api.Data;
using Cbplayground.Api.OpeningHours;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>A table that is free for a reservation.</summary>
public record FreeTable(Guid Id, string Number, int Seats, Guid AreaId, string AreaName);

/// <summary>A possible start time and the tables free from it for the whole duration, in the order the system assigns them.</summary>
public record TimeSlot(TimeOnly Time, IReadOnlyList<FreeTable> FreeTables);

/// <summary>The possible start times within one opening window of a day.</summary>
public record PeriodSlots(OpenPeriod Period, IReadOnlyList<TimeSlot> Slots);

/// <summary>The result of <see cref="IAvailabilityService.CheckAsync"/>: the error code, or the table for the reservation.</summary>
public record BookingCheck(string? Error, FreeTable? Table);

/// <summary>The result of <see cref="IAvailabilityService.CheckWalkInAsync"/>: the error code, or the start (now) and the free tables.</summary>
public record WalkInCheck(string? Error, DateTime Start, IReadOnlyList<FreeTable> FreeTables);

/// <summary>
/// When the current restaurant has a table free. Online bookings only get tables of areas open for online booking and
/// within the area's online quota; staff bookings get every table. The opening hours apply to both.
/// </summary>
public interface IAvailabilityService
{
    /// <summary>The current local time of the restaurant; null while it has no location (and thus no time zone).</summary>
    Task<DateTime?> GetLocalNowAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// The start times of <paramref name="date"/> in 15-minute steps, grouped by opening window, with the free tables
    /// for <paramref name="guests"/>. Times in the past (and, online, days too far ahead) have no free tables.
    /// Empty when the restaurant is closed or has no location.
    /// </summary>
    Task<IReadOnlyList<PeriodSlots>> GetSlotsAsync(DateOnly date, int guests, int durationMinutes, ReservationSource channel,
        Guid? ignoreReservationId = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks a reservation and picks its table: <paramref name="tableId"/> if given and free, otherwise the smallest free table
    /// that seats the party (then by area order and table number). <paramref name="ignoreReservationId"/> is the reservation
    /// being changed, so it does not collide with itself. <paramref name="checkPast"/> false skips the "in the past" check,
    /// <paramref name="checkOpeningHours"/> false the check of the start time against the opening hours.
    /// </summary>
    Task<BookingCheck> CheckAsync(DateOnly date, TimeOnly time, int guests, int durationMinutes, ReservationSource channel,
        Guid? tableId, Guid? ignoreReservationId = null, bool checkPast = true, bool checkOpeningHours = true,
        CancellationToken cancellationToken = default);

    /// <summary>The largest party that can be booked online: the seats of the largest table that can be booked online; 0 if none.</summary>
    Task<int> GetMaxOnlinePartySizeAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// The tables free for a walk-in of <paramref name="guests"/> from now (to the minute) for <paramref name="durationMinutes"/>,
    /// in the order the system assigns them. Now has to lie within an opening window; the end may lie after it. The online quota
    /// does not apply. Errors: "invalid_party_size", "outside_opening_hours".
    /// </summary>
    Task<WalkInCheck> CheckWalkInAsync(int guests, int durationMinutes, CancellationToken cancellationToken = default);

    /// <summary>Whether the table is free from <paramref name="startLocal"/> to <paramref name="endLocal"/>, apart from the reservation <paramref name="ignoreReservationId"/>.</summary>
    Task<bool> IsTableFreeAsync(Guid tableId, DateTime startLocal, DateTime endLocal, Guid ignoreReservationId, CancellationToken cancellationToken = default);
}

public class AvailabilityService(AppDbContext db, ITenantContext tenantContext, IOpeningCalendar openingCalendar) : IAvailabilityService
{
    private record TableInfo(Table Table, Area Area);

    private record BusyTable(Guid TableId, Guid AreaId, int Seats, DateTime Start, DateTime End, ReservationSource Source);

    public async Task<DateTime?> GetLocalNowAsync(CancellationToken cancellationToken = default)
    {
        var timeZoneId = await db.Tenants
            .Where(t => t.Id == tenantContext.TenantId)
            .Select(t => t.TimeZoneId)
            .SingleOrDefaultAsync(cancellationToken);
        return timeZoneId is null ? null : TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, timeZoneId);
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

        var tooFarAhead = channel == ReservationSource.Online && IsTooFarAhead(date, now);
        var tables = await LoadTablesAsync(cancellationToken);
        var busy = await LoadBusyTablesAsync(DayStart(date), DayStart(date).AddDays(1), ignoreReservationId, cancellationToken);

        var result = new List<PeriodSlots>();
        foreach (var period in periods)
        {
            var slots = new List<TimeSlot>();
            foreach (var start in StartTimes(date, period, durationMinutes))
            {
                var free = start <= now || tooFarAhead
                    ? []
                    : FreeTables(tables, busy, start, start.AddMinutes(durationMinutes), guests, channel);
                slots.Add(new TimeSlot(TimeOnly.FromDateTime(start), free));
            }
            result.Add(new PeriodSlots(period, slots));
        }
        return result;
    }

    public async Task<BookingCheck> CheckAsync(DateOnly date, TimeOnly time, int guests, int durationMinutes, ReservationSource channel,
        Guid? tableId, Guid? ignoreReservationId = null, bool checkPast = true, bool checkOpeningHours = true,
        CancellationToken cancellationToken = default)
    {
        var tables = await LoadTablesAsync(cancellationToken);
        if (guests < 1 || guests > MaxPartySize(tables, channel))
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
        if (channel == ReservationSource.Online && IsTooFarAhead(date, now))
        {
            return Error("too_far_ahead");
        }

        var periods = await openingCalendar.GetOpenPeriodsAsync(date, cancellationToken);
        if (checkOpeningHours && !periods.Any(period => StartTimes(date, period, durationMinutes).Contains(start)))
        {
            return Error("outside_opening_hours");
        }

        var busy = await LoadBusyTablesAsync(DayStart(date), DayStart(date).AddDays(1), ignoreReservationId, cancellationToken);
        var free = FreeTables(tables, busy, start, start.AddMinutes(durationMinutes), guests, channel);
        if (tableId is not null)
        {
            var table = free.FirstOrDefault(t => t.Id == tableId);
            return table is null ? Error("table_unavailable") : new BookingCheck(null, table);
        }
        return free.Count == 0 ? Error("slot_unavailable") : new BookingCheck(null, free[0]);
    }

    public async Task<int> GetMaxOnlinePartySizeAsync(CancellationToken cancellationToken = default) =>
        MaxPartySize(await LoadTablesAsync(cancellationToken), ReservationSource.Online);

    public async Task<WalkInCheck> CheckWalkInAsync(int guests, int durationMinutes, CancellationToken cancellationToken = default)
    {
        var tables = await LoadTablesAsync(cancellationToken);
        if (guests < 1 || guests > MaxPartySize(tables, ReservationSource.Staff))
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
        var busy = await LoadBusyTablesAsync(start, end, null, cancellationToken);
        return new WalkInCheck(null, start, FreeTables(tables, busy, start, end, guests, ReservationSource.Staff));
    }

    public async Task<bool> IsTableFreeAsync(Guid tableId, DateTime startLocal, DateTime endLocal, Guid ignoreReservationId,
        CancellationToken cancellationToken = default)
    {
        var busy = await LoadBusyTablesAsync(startLocal, endLocal, ignoreReservationId, cancellationToken);
        return busy.All(r => r.TableId != tableId);
    }

    private static BookingCheck Error(string error) => new(error, null);

    private static DateTime DayStart(DateOnly date) => date.ToDateTime(TimeOnly.MinValue);

    private static bool IsTooFarAhead(DateOnly date, DateTime now) =>
        date > DateOnly.FromDateTime(now).AddDays(ReservationRules.MaxOnlineDaysAhead);

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

    /// <summary>All tables with their area, in the order the system assigns them among tables of the same size.</summary>
    private async Task<List<TableInfo>> LoadTablesAsync(CancellationToken cancellationToken)
    {
        var tables = await db.Tables
            .Join(db.Areas, t => t.AreaId, a => a.Id, (t, a) => new TableInfo(t, a))
            .ToListAsync(cancellationToken);
        return tables
            .OrderBy(t => t.Area.SortOrder).ThenBy(t => t.Area.Name, StringComparer.Ordinal)
            .ThenBy(t => t.Table.Number.Length).ThenBy(t => t.Table.Number, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// The reservations that occupy their table between <paramref name="from"/> and <paramref name="to"/>. A reservation whose guest
    /// has left (<see cref="ReservationStatus.Completed"/>) occupies it only until the guest left, at most until its end.
    /// </summary>
    private async Task<List<BusyTable>> LoadBusyTablesAsync(DateTime from, DateTime to, Guid? ignoreReservationId, CancellationToken cancellationToken)
    {
        var rows = await db.Reservations
            .Where(r => r.StartLocal < to && r.EndLocal > from && r.Id != ignoreReservationId
                && (ReservationRules.BlockingStatuses.Contains(r.Status) || r.Status == ReservationStatus.Completed))
            .Join(db.Tables, r => r.TableId, t => t.Id, (r, t) => new { Reservation = r, t.AreaId, t.Seats })
            .ToListAsync(cancellationToken);
        return rows
            .Select(x => new BusyTable(x.Reservation.TableId, x.AreaId, x.Seats, x.Reservation.StartLocal,
                x.Reservation.Status == ReservationStatus.Completed && x.Reservation.CompletedAtLocal < x.Reservation.EndLocal
                    ? x.Reservation.CompletedAtLocal.Value
                    : x.Reservation.EndLocal,
                x.Reservation.Source))
            .Where(r => r.Start < r.End && r.Start < to && r.End > from)
            .ToList();
    }

    /// <summary>The tables free from <paramref name="start"/> to <paramref name="end"/> that seat the party, smallest first.</summary>
    private static List<FreeTable> FreeTables(List<TableInfo> tables, List<BusyTable> busy, DateTime start, DateTime end, int guests, ReservationSource channel)
    {
        var overlapping = busy.Where(r => r.Start < end && r.End > start).ToList();
        var occupied = overlapping.Select(r => r.TableId).ToHashSet();

        var free = tables.Where(t => t.Table.Seats >= guests && !occupied.Contains(t.Table.Id));
        if (channel == ReservationSource.Online)
        {
            // Online quota: the seats of the area's online reservations in this time plus the new table
            // must not exceed the area's online share of its seats.
            free = free.Where(t => t.Area.OnlineBookingEnabled
                && overlapping.Where(r => r.Source == ReservationSource.Online && r.AreaId == t.Area.Id).Sum(r => r.Seats) + t.Table.Seats
                    <= OnlineSeatLimit(tables, t.Area));
        }

        // OrderBy is stable, so tables of the same size keep the order of the areas and table numbers.
        return free
            .OrderBy(t => t.Table.Seats)
            .Select(t => new FreeTable(t.Table.Id, t.Table.Number, t.Table.Seats, t.Area.Id, t.Area.Name))
            .ToList();
    }

    /// <summary>How many of an area's seats can be booked online at the same time: floor(seats × percent / 100).</summary>
    private static int OnlineSeatLimit(List<TableInfo> tables, Area area) =>
        tables.Where(t => t.Area.Id == area.Id).Sum(t => t.Table.Seats) * area.OnlineCapacityPercent / 100;

    /// <summary>The seats of the largest table the channel can book; online only tables that fit into their area's online quota.</summary>
    private static int MaxPartySize(List<TableInfo> tables, ReservationSource channel) =>
        tables
            .Where(t => channel == ReservationSource.Staff
                || (t.Area.OnlineBookingEnabled && t.Table.Seats <= OnlineSeatLimit(tables, t.Area)))
            .Select(t => t.Table.Seats)
            .DefaultIfEmpty(0)
            .Max();
}
