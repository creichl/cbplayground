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

/// <summary>
/// When the current restaurant has a table free. Online bookings only get tables of areas open for online booking and
/// within the area's online quota, and are bound to the restaurant's lead time, booking horizon and largest online party
/// (<see cref="ReservationSettings"/>); staff bookings get every table. The opening hours and the buffer after every
/// reservation apply to both.
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
    /// Checks a reservation and picks its table: <paramref name="tableId"/> if given and free, otherwise the smallest free table
    /// that seats the party (then by area order and table number). <paramref name="ignoreReservationId"/> is the reservation
    /// being changed, so it does not collide with itself. <paramref name="checkPast"/> false skips the "in the past" check.
    /// </summary>
    Task<BookingCheck> CheckAsync(DateOnly date, TimeOnly time, int guests, int durationMinutes, ReservationSource channel,
        Guid? tableId, Guid? ignoreReservationId = null, bool checkPast = true, CancellationToken cancellationToken = default);

    /// <summary>
    /// The largest party that can be booked online: the seats of the largest table that can be booked online (0 if none),
    /// limited by <see cref="ReservationSettings.MaxOnlinePartySize"/>.
    /// </summary>
    Task<int> GetMaxOnlinePartySizeAsync(CancellationToken cancellationToken = default);
}

public class AvailabilityService(AppDbContext db, ITenantContext tenantContext, IOpeningCalendar openingCalendar, TimeProvider timeProvider) : IAvailabilityService
{
    private record TableInfo(Table Table, Area Area);

    private record BusyTable(Guid TableId, Guid AreaId, int Seats, DateTime Start, DateTime End, ReservationSource Source);

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
        var tables = await LoadTablesAsync(cancellationToken);
        var online = channel == ReservationSource.Online;
        var notBookable = online && (IsTooFarAhead(date, now, settings) || guests > MaxPartySize(tables, channel, settings));
        // Online, the first possible start is now plus the lead time; staff can book any time after now.
        var earliestOnline = now.AddMinutes(online ? settings.MinLeadTimeMinutes : 0);
        var busy = await LoadBusyTablesAsync(date, settings.BufferMinutes, ignoreReservationId, cancellationToken);

        var result = new List<PeriodSlots>();
        foreach (var period in periods)
        {
            var slots = new List<TimeSlot>();
            foreach (var start in StartTimes(date, period, durationMinutes))
            {
                var free = start <= now || start < earliestOnline || notBookable
                    ? []
                    : FreeTables(tables, busy, start, start.AddMinutes(durationMinutes), settings.BufferMinutes, guests, channel);
                slots.Add(new TimeSlot(TimeOnly.FromDateTime(start), free));
            }
            result.Add(new PeriodSlots(period, slots));
        }
        return result;
    }

    public async Task<BookingCheck> CheckAsync(DateOnly date, TimeOnly time, int guests, int durationMinutes, ReservationSource channel,
        Guid? tableId, Guid? ignoreReservationId = null, bool checkPast = true, CancellationToken cancellationToken = default)
    {
        var settings = await LoadSettingsAsync(cancellationToken);
        var tables = await LoadTablesAsync(cancellationToken);
        if (guests < 1 || guests > MaxPartySize(tables, channel, settings))
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
        if (!periods.Any(period => StartTimes(date, period, durationMinutes).Contains(start)))
        {
            return Error("outside_opening_hours");
        }

        var busy = await LoadBusyTablesAsync(date, settings.BufferMinutes, ignoreReservationId, cancellationToken);
        var free = FreeTables(tables, busy, start, start.AddMinutes(durationMinutes), settings.BufferMinutes, guests, channel);
        if (tableId is not null)
        {
            var table = free.FirstOrDefault(t => t.Id == tableId);
            return table is null ? Error("table_unavailable") : new BookingCheck(null, table);
        }
        return free.Count == 0 ? Error("slot_unavailable") : new BookingCheck(null, free[0]);
    }

    public async Task<int> GetMaxOnlinePartySizeAsync(CancellationToken cancellationToken = default) =>
        MaxPartySize(await LoadTablesAsync(cancellationToken), ReservationSource.Online, await LoadSettingsAsync(cancellationToken));

    private static BookingCheck Error(string error) => new(error, null);

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

    /// <summary>The reservations that occupy their table on <paramref name="date"/>, including the buffer after them.</summary>
    private async Task<List<BusyTable>> LoadBusyTablesAsync(DateOnly date, int bufferMinutes, Guid? ignoreReservationId, CancellationToken cancellationToken)
    {
        var dayStart = date.ToDateTime(TimeOnly.MinValue);
        var dayEnd = dayStart.AddDays(1);
        // A reservation ending at midnight occupies its table into the next day by the buffer.
        var endsAfter = dayStart.AddMinutes(-bufferMinutes);
        return await db.Reservations
            .Where(r => r.StartLocal < dayEnd && r.EndLocal > endsAfter && r.Id != ignoreReservationId
                && ReservationRules.BlockingStatuses.Contains(r.Status))
            .Join(db.Tables, r => r.TableId, t => t.Id, (r, t) => new BusyTable(r.TableId, t.AreaId, t.Seats, r.StartLocal, r.EndLocal, r.Source))
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// The tables free from <paramref name="start"/> to <paramref name="end"/> that seat the party, smallest first. Every
    /// reservation, the new one as well, occupies its table for <paramref name="bufferMinutes"/> after its end.
    /// </summary>
    private static List<FreeTable> FreeTables(List<TableInfo> tables, List<BusyTable> busy, DateTime start, DateTime end, int bufferMinutes,
        int guests, ReservationSource channel)
    {
        var occupied = busy
            .Where(r => r.Start < end.AddMinutes(bufferMinutes) && r.End.AddMinutes(bufferMinutes) > start)
            .Select(r => r.TableId)
            .ToHashSet();
        // The online quota counts the guests at the table, so the buffer does not count for it.
        var overlapping = busy.Where(r => r.Start < end && r.End > start).ToList();

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

    /// <summary>
    /// The seats of the largest table the channel can book; online only tables that fit into their area's online quota,
    /// and at most <see cref="ReservationSettings.MaxOnlinePartySize"/> when it is set.
    /// </summary>
    private static int MaxPartySize(List<TableInfo> tables, ReservationSource channel, ReservationSettings settings)
    {
        var largestTable = tables
            .Where(t => channel == ReservationSource.Staff
                || (t.Area.OnlineBookingEnabled && t.Table.Seats <= OnlineSeatLimit(tables, t.Area)))
            .Select(t => t.Table.Seats)
            .DefaultIfEmpty(0)
            .Max();
        return channel == ReservationSource.Online && settings.MaxOnlinePartySize is { } limit ? Math.Min(largestTable, limit) : largestTable;
    }
}
