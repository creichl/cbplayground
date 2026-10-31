using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Endpoints.OpeningHoursEndpoints;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Closing days and special opening hours of the signed-in Tenant Admin's restaurant. They take precedence over public
/// holidays and the regular hours. Saving one never changes reservations: the answer lists the reservations it affects,
/// and the restaurant decides what to do with them.
/// </summary>
public static class SpecialDayEndpoints
{
    /// <summary>A time window of a day with special hours. Times are "HH:mm"; the end may be "24:00".</summary>
    public record SpecialDayPeriodDto(string Start, string End);

    /// <summary>
    /// A new or changed entry. <see cref="From"/> and <see cref="To"/> are "YYYY-MM-DD", both inclusive. <see cref="Periods"/> are
    /// required for special hours and ignored for a closing day. Errors (400): "invalid_date", "from_after_to", "range_too_long"
    /// (more than 366 days), "invalid_kind", "invalid_note" (more than 100 characters), "periods_required", "invalid_time",
    /// "start_not_before_end", "overlapping_periods"; (409): "overlapping_special_days".
    /// </summary>
    public record SpecialDayRequest(DateOnly? From, DateOnly? To, SpecialDayKind Kind, string? Note, IReadOnlyList<SpecialDayPeriodDto>? Periods);

    public record SpecialDayResponse(Guid Id, DateOnly From, DateOnly To, SpecialDayKind Kind, string? Note, IReadOnlyList<SpecialDayPeriodDto> Periods);

    /// <summary>A reservation that lies on a closing day or outside the special hours of an entry.</summary>
    public record AffectedReservation(Guid Id, string ReferenceCode, DateOnly Date, string Time, int Guests, string Name, string TableNumber, ReservationStatus Status);

    /// <summary>The saved entry and the reservations it affects, which stay unchanged.</summary>
    public record SpecialDaySaveResponse(SpecialDayResponse SpecialDay, int AffectedCount, IReadOnlyList<AffectedReservation> AffectedReservations);

    public static void MapSpecialDayEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/special-days").RequireAuthorization(Policies.RequireTenantAdmin);

        // The entries that have not ended yet (today in the restaurant's time zone; all of them without location), sorted by start.
        group.MapGet("/", async (AppDbContext db, IAvailabilityService availability) =>
        {
            var now = await availability.GetLocalNowAsync();
            var today = now is null ? DateOnly.MinValue : DateOnly.FromDateTime(now.Value);
            var specialDays = await db.SpecialDays
                .Include(d => d.Periods)
                .Where(d => d.To >= today)
                .OrderBy(d => d.From)
                .ToListAsync();
            return specialDays.Select(ToResponse).ToList();
        });

        group.MapPost("/", async (SpecialDayRequest request, AppDbContext db, IAvailabilityService availability) =>
        {
            var (input, error) = await ValidateAsync(request, null, db);
            if (input is null)
            {
                return error!;
            }

            db.SpecialDays.Add(input);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/special-days/{input.Id}", await SaveResponseAsync(input, db, availability));
        });

        group.MapPut("/{id:guid}", async (Guid id, SpecialDayRequest request, AppDbContext db, IAvailabilityService availability) =>
        {
            var specialDay = await db.SpecialDays.Include(d => d.Periods).SingleOrDefaultAsync(d => d.Id == id);
            if (specialDay is null)
            {
                return Results.NotFound();
            }
            var (input, error) = await ValidateAsync(request, id, db);
            if (input is null)
            {
                return error!;
            }

            specialDay.From = input.From;
            specialDay.To = input.To;
            specialDay.Kind = input.Kind;
            specialDay.Note = input.Note;
            // The periods are replaced as a whole.
            db.SpecialDayPeriods.RemoveRange(specialDay.Periods);
            specialDay.Periods = input.Periods;
            await db.SaveChangesAsync();
            return Results.Ok(await SaveResponseAsync(specialDay, db, availability));
        });

        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var specialDay = await db.SpecialDays.SingleOrDefaultAsync(d => d.Id == id);
            if (specialDay is null)
            {
                return Results.NotFound();
            }
            // The periods are deleted with it (cascade).
            db.SpecialDays.Remove(specialDay);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    /// <summary>The entry the request describes, or the error. <paramref name="ownId"/> is the entry being changed, so it does not overlap itself.</summary>
    private static async Task<(SpecialDay? Input, IResult? Error)> ValidateAsync(SpecialDayRequest request, Guid? ownId, AppDbContext db)
    {
        if (request.From is not { } from || request.To is not { } to)
        {
            return BadRequest("invalid_date");
        }
        if (from > to)
        {
            return BadRequest("from_after_to");
        }
        if (to.DayNumber - from.DayNumber + 1 > SpecialDay.MaxDays)
        {
            return BadRequest("range_too_long");
        }
        if (!Enum.IsDefined(request.Kind))
        {
            return BadRequest("invalid_kind");
        }
        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note is { Length: > SpecialDay.MaxNoteLength })
        {
            return BadRequest("invalid_note");
        }

        // The same rules as the regular opening hours.
        var periods = new List<SpecialDayPeriod>();
        if (request.Kind == SpecialDayKind.SpecialHours)
        {
            if (request.Periods is not { Count: > 0 })
            {
                return BadRequest("periods_required");
            }
            foreach (var dto in request.Periods)
            {
                if (!TryParseTime(dto.Start, allowEndOfDay: false, out var start) || !TryParseTime(dto.End, allowEndOfDay: true, out var end))
                {
                    return BadRequest("invalid_time");
                }
                if (start >= end)
                {
                    return BadRequest("start_not_before_end");
                }
                periods.Add(new SpecialDayPeriod { Start = start, End = end });
            }
            periods = periods.OrderBy(p => p.Start).ToList();
            for (var i = 1; i < periods.Count; i++)
            {
                if (periods[i].Start < periods[i - 1].End)
                {
                    return BadRequest("overlapping_periods");
                }
            }
        }

        if (await db.SpecialDays.AnyAsync(d => d.Id != ownId && d.From <= to && d.To >= from))
        {
            return (null, ErrorResponse.Result("overlapping_special_days", StatusCodes.Status409Conflict));
        }

        return (new SpecialDay { From = from, To = to, Kind = request.Kind, Note = note, Periods = periods }, null);
    }

    /// <summary>
    /// The entry with the reservations it affects: those in a blocking status that have not ended yet and lie on its days,
    /// on a closing day all of them, with special hours those that do not fit into one of the windows.
    /// </summary>
    private static async Task<SpecialDaySaveResponse> SaveResponseAsync(SpecialDay specialDay, AppDbContext db, IAvailabilityService availability)
    {
        var now = await availability.GetLocalNowAsync() ?? DateTime.MinValue;
        var rangeStart = specialDay.From.ToDateTime(TimeOnly.MinValue);
        var rangeEnd = specialDay.To.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var rows = await db.Reservations
            .Where(r => r.StartLocal >= rangeStart && r.StartLocal < rangeEnd && r.EndLocal > now
                && ReservationRules.BlockingStatuses.Contains(r.Status))
            .Join(db.Tables, r => r.TableId, t => t.Id, (r, t) => new { Reservation = r, t.Number })
            .ToListAsync();

        var affected = rows
            .Where(row => !specialDay.Periods.Any(p => FitsInto(row.Reservation, p)))
            .OrderBy(row => row.Reservation.StartLocal)
            .ThenBy(row => row.Number.Length).ThenBy(row => row.Number, StringComparer.Ordinal)
            .Select(row => new AffectedReservation(
                row.Reservation.Id,
                row.Reservation.ReferenceCode,
                DateOnly.FromDateTime(row.Reservation.StartLocal),
                FormatTime(TimeOnly.FromDateTime(row.Reservation.StartLocal)),
                row.Reservation.PartySize,
                row.Reservation.GuestName,
                row.Number,
                row.Reservation.Status))
            .ToList();
        return new SpecialDaySaveResponse(ToResponse(specialDay), affected.Count, affected);
    }

    /// <summary>Whether the reservation lies completely within the window on its day.</summary>
    private static bool FitsInto(Reservation reservation, SpecialDayPeriod period)
    {
        var day = DateOnly.FromDateTime(reservation.StartLocal);
        var windowEnd = period.End == OpeningPeriod.EndOfDay ? day.AddDays(1).ToDateTime(TimeOnly.MinValue) : day.ToDateTime(period.End);
        return reservation.StartLocal >= day.ToDateTime(period.Start) && reservation.EndLocal <= windowEnd;
    }

    private static SpecialDayResponse ToResponse(SpecialDay specialDay) => new(
        specialDay.Id,
        specialDay.From,
        specialDay.To,
        specialDay.Kind,
        specialDay.Note,
        specialDay.Periods.OrderBy(p => p.Start).Select(p => new SpecialDayPeriodDto(FormatTime(p.Start), FormatTime(p.End))).ToList());

    private static (SpecialDay?, IResult?) BadRequest(string error) => (null, ErrorResponse.Result(error, StatusCodes.Status400BadRequest));
}
