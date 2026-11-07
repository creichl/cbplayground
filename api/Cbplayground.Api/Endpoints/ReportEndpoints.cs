using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The reports of a restaurant over a period, for Tenant Admins, always of the signed-in admin's restaurant. The days are those of
/// the restaurant's time zone: a reservation counts on the day and in the hour it starts there (<see cref="Reservation.StartLocal"/>).
/// </summary>
public static class ReportEndpoints
{
    /// <summary>The longest period of a report, in days.</summary>
    public const int MaxDays = 366;

    /// <summary>The days of the period without <c>from</c>: the last 30 days up to <c>to</c>.</summary>
    public const int DefaultDays = 30;

    /// <summary>
    /// The figures of the period. <see cref="Reservations"/> and <see cref="Covers"/> (their guests) count the reservations that are
    /// expected or were there: all except cancelled ones, declined requests and no-shows, as the key figures of the front desk.
    /// <see cref="NoShowRate"/> is the share of the no-shows among these reservations and the no-shows (0–1, 0 without any).
    /// </summary>
    public record ReportTotals(
        int Reservations,
        int Covers,
        double AveragePartySize,
        int NoShows,
        double NoShowRate,
        int Cancellations,
        int CancelledByGuest,
        int CancelledByRestaurant,
        int DeclinedRequests);

    /// <summary>The counted reservations and their covers of a booking channel.</summary>
    public record ReportSource(ReservationSource Source, int Reservations, int Covers);

    /// <summary>The covers of a weekday, 1 (Monday) to 7 (Sunday) as in ISO 8601.</summary>
    public record ReportWeekday(int Weekday, int Covers);

    /// <summary>The covers of the reservations starting in an hour, 0–23.</summary>
    public record ReportHour(int Hour, int Covers);

    public record ReportDay(DateOnly Date, int Reservations, int Covers);

    /// <summary>
    /// A report of the days <see cref="From"/> to <see cref="To"/> (both inclusive): every channel, every weekday, every hour and every
    /// day of the period, also those without reservations.
    /// </summary>
    public record ReportResponse(
        DateOnly From,
        DateOnly To,
        ReportTotals Totals,
        IReadOnlyList<ReportSource> BySource,
        IReadOnlyList<ReportWeekday> ByWeekday,
        IReadOnlyList<ReportHour> ByHour,
        IReadOnlyList<ReportDay> Days);

    public static void MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin").RequireAuthorization(Policies.RequireTenantAdmin);

        // Without to: today in the restaurant's time zone; without from: the last 30 days up to to. At most 366 days.
        group.MapGet("/reports", async (DateOnly? from, DateOnly? to, AppDbContext db, IAvailabilityService availability, CancellationToken cancellationToken) =>
        {
            var end = to ?? DateOnly.FromDateTime(await availability.GetLocalNowAsync(cancellationToken) ?? DateTime.UtcNow);
            var start = from ?? end.AddDays(1 - DefaultDays);
            if (end < start || end.DayNumber - start.DayNumber >= MaxDays)
            {
                return ErrorResponse.Result("invalid_range", StatusCodes.Status400BadRequest);
            }

            var startLocal = start.ToDateTime(TimeOnly.MinValue);
            var endLocal = end.AddDays(1).ToDateTime(TimeOnly.MinValue);
            var reservations = await db.Reservations
                .Where(r => r.StartLocal >= startLocal && r.StartLocal < endLocal)
                .Select(r => new { r.StartLocal, r.PartySize, r.Status, r.Source, r.CancelledByGuest })
                .ToListAsync(cancellationToken);

            var counted = reservations.Where(r => r.Status is not (ReservationStatus.Cancelled or ReservationStatus.Declined or ReservationStatus.NoShow)).ToList();
            var cancelled = reservations.Where(r => r.Status == ReservationStatus.Cancelled).ToList();
            var noShows = reservations.Count(r => r.Status == ReservationStatus.NoShow);
            var covers = counted.Sum(r => r.PartySize);
            var totals = new ReportTotals(
                counted.Count,
                covers,
                counted.Count == 0 ? 0 : (double)covers / counted.Count,
                noShows,
                counted.Count + noShows == 0 ? 0 : (double)noShows / (counted.Count + noShows),
                cancelled.Count,
                cancelled.Count(r => r.CancelledByGuest),
                cancelled.Count(r => !r.CancelledByGuest),
                reservations.Count(r => r.Status == ReservationStatus.Declined));

            var bySource = Enum.GetValues<ReservationSource>()
                .Select(source => new ReportSource(source, counted.Count(r => r.Source == source), counted.Where(r => r.Source == source).Sum(r => r.PartySize)))
                .ToList();
            var byWeekday = Enumerable.Range(1, 7)
                .Select(weekday => new ReportWeekday(weekday, counted.Where(r => IsoWeekday(r.StartLocal) == weekday).Sum(r => r.PartySize)))
                .ToList();
            var byHour = Enumerable.Range(0, 24)
                .Select(hour => new ReportHour(hour, counted.Where(r => r.StartLocal.Hour == hour).Sum(r => r.PartySize)))
                .ToList();
            var days = Enumerable.Range(0, end.DayNumber - start.DayNumber + 1)
                .Select(offset =>
                {
                    var date = start.AddDays(offset);
                    var ofDay = counted.Where(r => DateOnly.FromDateTime(r.StartLocal) == date).ToList();
                    return new ReportDay(date, ofDay.Count, ofDay.Sum(r => r.PartySize));
                })
                .ToList();

            return Results.Ok(new ReportResponse(start, end, totals, bySource, byWeekday, byHour, days));
        });
    }

    private static int IsoWeekday(DateTime date) => date.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)date.DayOfWeek;
}
