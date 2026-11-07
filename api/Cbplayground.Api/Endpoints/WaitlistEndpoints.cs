using System.Security.Claims;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Endpoints.OpeningHoursEndpoints;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The waitlist of walk-ins for the restaurant's staff (Tenant Admins and Front desk users), always of the signed-in user's
/// restaurant: parties waiting for a table today, in the restaurant's time zone. Only today's waiting entries can be changed;
/// the entries of other days are read-only (409 "entry_not_today"), as are seated and left ones (409 "entry_not_waiting").
/// Entries of other restaurants are answered with 404.
/// </summary>
public static class WaitlistEndpoints
{
    /// <summary>
    /// An entry of the waitlist. <see cref="AddedTime"/> is "HH:mm" in the restaurant's local time, the waiting time counts from it.
    /// <see cref="NextFreeAt"/> ("HH:mm"), only of today's waiting entries: the earliest time today a single table for the party is
    /// free for the restaurant's duration, now when one is free now; null when none is free today (and for all other entries).
    /// </summary>
    public record WaitlistEntryResponse(
        Guid Id,
        DateOnly Date,
        string AddedTime,
        string Name,
        string? Phone,
        int Guests,
        int? QuotedWaitMinutes,
        string? Notes,
        WaitlistStatus Status,
        Guid? SeatedReservationId,
        string? NextFreeAt);

    /// <summary>
    /// A new or changed entry; <see cref="QuotedWaitMinutes"/> is optional (1 to <see cref="WaitlistEntry.MaxQuotedWaitMinutes"/>).
    /// Errors (400): "invalid_party_size", "invalid_name", "invalid_phone", "invalid_notes", "invalid_quoted_wait".
    /// </summary>
    public record WaitlistEntryRequest(string? Name, string? Phone, int Guests, int? QuotedWaitMinutes, string? Notes);

    /// <summary>
    /// Seats the party now as a walk-in, like <c>POST /api/staff/walk-ins</c> with the entry's party size, name, phone and notes:
    /// without <see cref="TableId"/> at the suggested table, without <see cref="DurationMinutes"/> for the restaurant's duration.
    /// Errors as there (e.g. 409 "table_unavailable"); the entry then stays waiting.
    /// </summary>
    public record SeatRequest(Guid? TableId, int? DurationMinutes);

    /// <summary>The seated entry and the walk-in it was seated as.</summary>
    public record SeatResponse(WaitlistEntryResponse Entry, StaffReservationEndpoints.ReservationResponse Reservation);

    public static void MapWaitlistEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/staff/waitlist").RequireAuthorization(Policies.RequireStaff);

        // Without date: today in the restaurant's time zone. In the order of arrival.
        group.MapGet("", async (DateOnly? date, AppDbContext db, IAvailabilityService availability, IReservationDurationPolicy durationPolicy,
            CancellationToken cancellationToken) =>
        {
            var now = await LocalNowAsync(availability, cancellationToken);
            var today = DateOnly.FromDateTime(now);
            var day = date ?? today;
            var entries = await db.WaitlistEntries.Where(e => e.Date == day).OrderBy(e => e.AddedAtLocal).ToListAsync(cancellationToken);

            // Per party size once: several parties of the same size wait for the same tables.
            var nextFreeAt = new Dictionary<int, string?>();
            foreach (var guests in entries.Where(e => e.Status == WaitlistStatus.Waiting && e.Date == today).Select(e => e.PartySize).Distinct())
            {
                nextFreeAt[guests] = await NextFreeAtAsync(guests, today, availability, durationPolicy, cancellationToken);
            }
            return Results.Ok(entries.Select(e => ToResponse(e, nextFreeAt.GetValueOrDefault(e.PartySize))).ToList());
        });

        group.MapPost("", async (WaitlistEntryRequest request, AppDbContext db, IAvailabilityService availability,
            IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            var (input, error) = Validate(request);
            if (input is null)
            {
                return error!;
            }

            var now = await LocalNowAsync(availability, cancellationToken);
            var nowUtc = DateTime.UtcNow;
            var entry = new WaitlistEntry
            {
                Date = DateOnly.FromDateTime(now),
                AddedAtLocal = new DateTime(now.Year, now.Month, now.Day, now.Hour, now.Minute, now.Second),
                Name = input.Name,
                Status = WaitlistStatus.Waiting,
                CreatedAtUtc = nowUtc,
            };
            Apply(entry, input, request, nowUtc);
            db.WaitlistEntries.Add(entry);
            await db.SaveChangesAsync(cancellationToken);

            return Results.Created($"/api/staff/waitlist/{entry.Id}", await ResponseAsync(entry, availability, durationPolicy, cancellationToken));
        });

        group.MapPut("/{id:guid}", async (Guid id, WaitlistEntryRequest request, AppDbContext db, IAvailabilityService availability,
            IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            var (input, error) = Validate(request);
            if (input is null)
            {
                return error!;
            }
            var (entry, refusal) = await WaitingEntryAsync(id, db, availability, cancellationToken);
            if (entry is null)
            {
                return refusal!;
            }

            entry.Name = input.Name;
            Apply(entry, input, request, DateTime.UtcNow);
            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(await ResponseAsync(entry, availability, durationPolicy, cancellationToken));
        });

        // The walk-in and the seated entry are saved together, or neither of them.
        group.MapPost("/{id:guid}/seat", async (Guid id, SeatRequest request, ClaimsPrincipal user, ITenantContext tenantContext, AppDbContext db,
            IAvailabilityService availability, IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var (entry, refusal) = await WaitingEntryAsync(id, db, availability, cancellationToken);
            if (entry is null)
            {
                return refusal!;
            }
            var walkInRequest = new StaffReservationEndpoints.WalkInRequest(entry.PartySize, request.TableId, request.DurationMinutes, entry.Name,
                entry.Phone, entry.Notes);
            var (walkIn, error) = await StaffReservationEndpoints.AddWalkInAsync(walkInRequest, user, tenantContext, db, availability, durationPolicy,
                cancellationToken);
            if (walkIn is null)
            {
                return error!;
            }

            entry.Status = WaitlistStatus.Seated;
            entry.SeatedReservationId = walkIn.Id;
            entry.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Ok(new SeatResponse(ToResponse(entry, null), await StaffReservationEndpoints.LoadResponseAsync(db, walkIn.Id)));
        });

        group.MapPost("/{id:guid}/left", async (Guid id, AppDbContext db, IAvailabilityService availability, CancellationToken cancellationToken) =>
        {
            var (entry, refusal) = await WaitingEntryAsync(id, db, availability, cancellationToken);
            if (entry is null)
            {
                return refusal!;
            }

            entry.Status = WaitlistStatus.Left;
            entry.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(ToResponse(entry, null));
        });

        // The undo of "left": the party waits again, with the waiting time since it was added. Only a party that left (409
        // "entry_not_left"), and only today.
        group.MapPost("/{id:guid}/waiting", async (Guid id, AppDbContext db, IAvailabilityService availability, IReservationDurationPolicy durationPolicy,
            CancellationToken cancellationToken) =>
        {
            var entry = await db.WaitlistEntries.SingleOrDefaultAsync(e => e.Id == id, cancellationToken);
            if (entry is null)
            {
                return Results.NotFound();
            }
            if (entry.Date != DateOnly.FromDateTime(await LocalNowAsync(availability, cancellationToken)))
            {
                return Conflict("entry_not_today");
            }
            if (entry.Status != WaitlistStatus.Left)
            {
                return Conflict("entry_not_left");
            }

            entry.Status = WaitlistStatus.Waiting;
            entry.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(await ResponseAsync(entry, availability, durationPolicy, cancellationToken));
        });
    }

    /// <summary>
    /// The earliest time today a single table (seating, like a walk-in, only gets single tables) is free for <paramref name="guests"/>
    /// for the restaurant's duration: now when the walk-in check finds one, otherwise the first start time of the staff
    /// availability with one; null when there is none.
    /// </summary>
    private static async Task<string?> NextFreeAtAsync(int guests, DateOnly today, IAvailabilityService availability,
        IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken)
    {
        var duration = await durationPolicy.GetDurationAsync(guests, cancellationToken);
        var walkIn = await availability.CheckWalkInAsync(guests, duration, cancellationToken);
        if (walkIn.Error is null && walkIn.FreeTables.Count > 0)
        {
            return FormatTime(TimeOnly.FromDateTime(walkIn.Start));
        }
        var periods = await availability.GetSlotsAsync(today, guests, duration, ReservationSource.Staff, cancellationToken: cancellationToken);
        var slot = periods
            .SelectMany(p => p.Slots)
            .FirstOrDefault(s => s.FreeTables.Any(t => t.Kind == FreeTable.TableKind));
        return slot is null ? null : FormatTime(slot.Time);
    }

    /// <summary>The checked name, phone and notes of a request; the error otherwise.</summary>
    private static (GuestDetails? Input, IResult? Error) Validate(WaitlistEntryRequest request)
    {
        if (request.Guests < 1)
        {
            return (null, BadRequest("invalid_party_size"));
        }
        if (request.QuotedWaitMinutes is { } quoted && (quoted < 1 || quoted > WaitlistEntry.MaxQuotedWaitMinutes))
        {
            return (null, BadRequest("invalid_quoted_wait"));
        }
        var (guest, error) = GuestDetails.Parse(request.Name, request.Phone, null, request.Notes, contactRequired: false);
        return guest is null ? (null, BadRequest(error!)) : (guest, null);
    }

    private static void Apply(WaitlistEntry entry, GuestDetails input, WaitlistEntryRequest request, DateTime nowUtc)
    {
        entry.Phone = input.Phone;
        entry.Notes = input.Notes;
        entry.PartySize = request.Guests;
        entry.QuotedWaitMinutes = request.QuotedWaitMinutes;
        entry.UpdatedAtUtc = nowUtc;
    }

    /// <summary>The entry when it is today's and waiting; otherwise 404, "entry_not_today" or "entry_not_waiting".</summary>
    private static async Task<(WaitlistEntry? Entry, IResult? Refusal)> WaitingEntryAsync(Guid id, AppDbContext db, IAvailabilityService availability,
        CancellationToken cancellationToken)
    {
        var entry = await db.WaitlistEntries.SingleOrDefaultAsync(e => e.Id == id, cancellationToken);
        if (entry is null)
        {
            return (null, Results.NotFound());
        }
        if (entry.Date != DateOnly.FromDateTime(await LocalNowAsync(availability, cancellationToken)))
        {
            return (null, Conflict("entry_not_today"));
        }
        return entry.Status == WaitlistStatus.Waiting ? (entry, null) : (null, Conflict("entry_not_waiting"));
    }

    /// <summary>The restaurant's local time; without a location (and thus a time zone) UTC, as for the reservation lists.</summary>
    private static async Task<DateTime> LocalNowAsync(IAvailabilityService availability, CancellationToken cancellationToken) =>
        await availability.GetLocalNowAsync(cancellationToken) ?? DateTime.UtcNow;

    private static async Task<WaitlistEntryResponse> ResponseAsync(WaitlistEntry entry, IAvailabilityService availability,
        IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(await LocalNowAsync(availability, cancellationToken));
        var nextFreeAt = entry.Status == WaitlistStatus.Waiting && entry.Date == today
            ? await NextFreeAtAsync(entry.PartySize, today, availability, durationPolicy, cancellationToken)
            : null;
        return ToResponse(entry, nextFreeAt);
    }

    private static WaitlistEntryResponse ToResponse(WaitlistEntry entry, string? nextFreeAt) => new(
        entry.Id,
        entry.Date,
        FormatTime(TimeOnly.FromDateTime(entry.AddedAtLocal)),
        entry.Name,
        entry.Phone,
        entry.PartySize,
        entry.QuotedWaitMinutes,
        entry.Notes,
        entry.Status,
        entry.SeatedReservationId,
        nextFreeAt);

    private static IResult BadRequest(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);

    private static IResult Conflict(string error) => ErrorResponse.Result(error, StatusCodes.Status409Conflict);
}
