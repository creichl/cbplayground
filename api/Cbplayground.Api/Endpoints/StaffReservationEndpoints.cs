using System.Globalization;
using System.Security.Claims;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Endpoints.OpeningHoursEndpoints;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// Reservations for the restaurant's staff (Tenant Admins and Front desk users), always of the signed-in user's restaurant.
/// Staff book every table: the online quota and the online block do not apply, the opening hours do.
/// Reservations of other restaurants are answered with 404.
/// </summary>
public static class StaffReservationEndpoints
{
    /// <summary>The longest range <c>GET /api/staff/reservations</c> returns.</summary>
    public const int MaxListDays = 366;

    public record FloorTable(Guid Id, string Number, int Seats, double PosX, double PosY, TableShape Shape, int Rotation);

    public record FloorArea(Guid Id, string Name, int SortOrder, string? FloorPlanUrl, string? Description, string? PhotoUrl, int TableScale, IReadOnlyList<FloorTable> Tables, RoomStyle RoomStyle, IReadOnlyList<AreaEndpoints.RoomElementResponse> RoomElements);

    public record ReservationResponse(
        Guid Id,
        string ReferenceCode,
        DateOnly Date,
        string Time,
        string EndTime,
        int DurationMinutes,
        int Guests,
        ReservationStatus Status,
        ReservationSource Source,
        Guid TableId,
        string TableNumber,
        bool TableArchived,
        IReadOnlyList<Guid> TableIds,
        IReadOnlyList<string> TableNumbers,
        Guid AreaId,
        string AreaName,
        string Name,
        string? Phone,
        string? Email,
        string? Notes,
        string Language,
        string? CompletedTime,
        bool CancelledByGuest,
        DateTime CreatedAtUtc,
        DateTime UpdatedAtUtc);

    /// <summary>
    /// A new or changed reservation. <see cref="Date"/> is "YYYY-MM-DD", <see cref="Time"/> "HH:mm". <see cref="TableIds"/> are one
    /// table or exactly the tables of one combination; <see cref="TableId"/> (one table) is the older form of it and only used
    /// without <see cref="TableIds"/>. Without both the system assigns a table or, when none fits, a combination. Without
    /// <see cref="DurationMinutes"/> the restaurant's duration for the party size applies, without <see cref="Language"/> the language
    /// of the restaurant's country. Errors (400): "invalid_date", "invalid_time", "invalid_party_size", "invalid_duration",
    /// "invalid_name", "invalid_phone", "invalid_email", "invalid_notes", "invalid_language", "invalid_tables", "outside_opening_hours",
    /// "in_the_past"; (409): "slot_unavailable", "table_unavailable", "reservation_closed" (a change of date, time, party size,
    /// tables or duration of a reservation in one of the <see cref="ReservationRules.ClosedStatuses"/>).
    /// </summary>
    public record ReservationRequest(
        string? Date,
        string? Time,
        int Guests,
        Guid? TableId,
        int? DurationMinutes,
        string? Name,
        string? Phone,
        string? Email,
        string? Notes,
        string? Language,
        List<Guid>? TableIds = null)
    {
        /// <summary>The requested tables; null: the system assigns them.</summary>
        public IReadOnlyCollection<Guid>? RequestedTableIds => TableIds ?? (TableId is { } id ? [id] : null);
    }

    /// <summary>
    /// Errors: "invalid_status" (400); (409): "invalid_status_transition", "status_not_allowed_now" ("arrived" and "late" only on
    /// the day of the reservation, "no-show" only from its start, the undo of a cancellation only until its end),
    /// "table_unavailable" (an undo while the table is taken).
    /// </summary>
    public record StatusRequest(string? Status);

    /// <summary>
    /// A guest without a reservation, seated now, at a single table. Without <see cref="TableId"/> the system assigns a table, without
    /// <see cref="DurationMinutes"/> the restaurant's duration for the party size applies, without <see cref="Name"/> it is
    /// <see cref="Reservation.WalkInName"/>. Errors (400): "invalid_party_size", "invalid_duration", "invalid_name", "invalid_phone",
    /// "invalid_notes", "outside_opening_hours"; (409): "slot_unavailable", "table_unavailable".
    /// </summary>
    public record WalkInRequest(int Guests, Guid? TableId, int? DurationMinutes, string? Name, string? Phone, string? Notes);

    /// <summary>
    /// An entry of a reservation's history. <see cref="Date"/> and <see cref="Time"/> ("HH:mm") are in the restaurant's time zone;
    /// <see cref="UserName"/> is the staff user's display name at the time of the change, null for the guest and the system.
    /// </summary>
    public record ReservationEventResponse(DateOnly Date, string Time, ReservationActor Actor, string? UserName, ReservationEventKind Kind,
        IReadOnlyList<ReservationChangeResponse> Changes);

    /// <summary>A changed field with its old and new value (see <see cref="ReservationChange"/>).</summary>
    public record ReservationChangeResponse(ReservationField Field, string? From, string? To);

    /// <summary>The tables free for a walk-in from <see cref="Time"/> (now) for <see cref="DurationMinutes"/>, the suggested one first.</summary>
    public record WalkInTablesResponse(string Time, int DurationMinutes, IReadOnlyList<FreeTable> Tables);

    /// <summary>
    /// The free tables and combinations (<see cref="FreeTable.Kind"/>) of a start time, the one the system would assign first;
    /// <see cref="Pacing"/> is null when no pacing rule applies to it.
    /// </summary>
    public record StaffAvailabilityTime(string Time, IReadOnlyList<FreeTable> Tables, SlotPacing? Pacing);

    public record StaffAvailabilityPeriod(string Start, string End, IReadOnlyList<StaffAvailabilityTime> Times);

    public record StaffAvailabilityResponse(DateOnly Date, int Guests, int DurationMinutes, IReadOnlyList<StaffAvailabilityPeriod> Periods);

    public static void MapStaffReservationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/staff").RequireAuthorization(Policies.RequireStaff);

        // Areas and tables for the front desk, without the archived ones; the admin endpoints are for Tenant Admins only.
        group.MapGet("/floor", async (AppDbContext db) =>
        {
            var areas = await db.Areas.Where(a => a.ArchivedAtUtc == null).OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync();
            var tables = (await db.Tables.Where(t => t.ArchivedAtUtc == null).ToListAsync())
                .OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal)
                .ToList();
            var elements = await db.RoomElements.OrderBy(e => e.SortOrder).ToListAsync();
            return areas.Select(area => new FloorArea(
                area.Id,
                area.Name,
                area.SortOrder,
                AreaEndpoints.FloorPlanUrl(area),
                area.Description,
                AreaEndpoints.PhotoUrl(area),
                area.TableScale,
                tables.Where(t => t.AreaId == area.Id).Select(t => new FloorTable(t.Id, t.Number, t.Seats, t.PosX, t.PosY, t.Shape, t.Rotation)).ToList(),
                area.RoomStyle,
                elements.Where(e => e.AreaId == area.Id).Select(AreaEndpoints.ToResponse).ToList()));
        });

        // Without from/to: today in the restaurant's time zone. With status: only the reservations in that status, e.g. the open
        // requests ("Requested") of the whole booking horizon.
        group.MapGet("/reservations", async (DateOnly? from, DateOnly? to, string? status, AppDbContext db, IAvailabilityService availability) =>
        {
            var start = from ?? DateOnly.FromDateTime(await availability.GetLocalNowAsync() ?? DateTime.UtcNow);
            var end = to ?? start;
            if (end < start || end.DayNumber - start.DayNumber >= MaxListDays)
            {
                return ErrorResponse.Result("invalid_range", StatusCodes.Status400BadRequest);
            }
            if (status is not null && !Enum.GetNames<ReservationStatus>().Contains(status))
            {
                return ErrorResponse.Result("invalid_status", StatusCodes.Status400BadRequest);
            }

            var startLocal = start.ToDateTime(TimeOnly.MinValue);
            var endLocal = end.AddDays(1).ToDateTime(TimeOnly.MinValue);
            var reservations = db.Reservations.Where(r => r.StartLocal >= startLocal && r.StartLocal < endLocal);
            if (status is not null)
            {
                var wanted = Enum.Parse<ReservationStatus>(status);
                reservations = reservations.Where(r => r.Status == wanted);
            }
            return Results.Ok(await LoadResponsesAsync(db, reservations));
        });

        // With reservationId the reservation being moved (e.g. dragged on the timeline) does not count, as when it is changed.
        group.MapGet("/availability", async (DateOnly date, int guests, int? durationMinutes, Guid? reservationId, IAvailabilityService availability,
            IReservationDurationPolicy durationPolicy) =>
        {
            if (guests < 1)
            {
                return ErrorResponse.Result("invalid_party_size", StatusCodes.Status400BadRequest);
            }
            if (durationMinutes is { } minutes && !ReservationSettingsEndpoints.IsValidDuration(minutes))
            {
                return ErrorResponse.Result("invalid_duration", StatusCodes.Status400BadRequest);
            }

            var duration = durationMinutes ?? await durationPolicy.GetDurationAsync(guests);
            var periods = await availability.GetSlotsAsync(date, guests, duration, ReservationSource.Staff, reservationId);
            return Results.Ok(new StaffAvailabilityResponse(date, guests, duration, periods
                .Select(p => new StaffAvailabilityPeriod(
                    FormatTime(p.Period.Start),
                    FormatTime(p.Period.End),
                    p.Slots.Select(s => new StaffAvailabilityTime(FormatTime(s.Time), s.FreeTables, s.Pacing)).ToList()))
                .ToList()));
        });

        // A reservation on the guest's behalf, e.g. by phone: always confirmed.
        group.MapPost("/reservations", async (ReservationRequest request, ClaimsPrincipal user, ITenantContext tenantContext, AppDbContext db,
            IAvailabilityService availability, IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            var input = await ValidateAsync(request, tenantContext, db, durationPolicy, cancellationToken);
            if (input.Error is not null)
            {
                return input.Error;
            }

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var check = await availability.CheckAsync(input.Date, input.Time, request.Guests, input.Duration, ReservationSource.Staff,
                request.RequestedTableIds, cancellationToken: cancellationToken);
            if (check.Table is not { } table)
            {
                return CheckError(check.Error!);
            }

            var now = DateTime.UtcNow;
            var reservation = new Reservation
            {
                GuestName = input.Guest!.Name,
                Status = ReservationStatus.Confirmed,
                Source = ReservationSource.Staff,
                ReferenceCode = await ReferenceCode.GenerateUniqueAsync(db, cancellationToken),
                Language = input.Language!,
                CreatedAtUtc = now,
            };
            Apply(reservation, input, request.Guests, table.TableIds, now);
            db.Reservations.Add(reservation);
            ReservationHistory.Record(db, reservation, ReservationEventKind.Created, await ReservationEditor.StaffAsync(user, db, cancellationToken), now);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Created($"/api/staff/reservations/{reservation.Id}", await LoadResponseAsync(db, reservation.Id));
        });

        // Same checks as a new reservation; the reservation does not collide with itself. A start that is not changed
        // may lie in the past, so a running reservation can still be changed (e.g. its notes or duration). A walk-in starts
        // off the quarter-hour grid and may end after closing time: as long as its start is kept, the opening hours do not apply.
        // The opening hours, the availability and the table are only checked when the booking itself changes (date, time,
        // duration, party size or table; no table means the system assigns one), so the guest's details and notes can
        // still be changed after the opening hours or the tables have changed. A closed reservation (cancelled, declined, no-show,
        // guest left) keeps its booking: only the guest's details, notes and language can still be changed.
        group.MapPut("/reservations/{id:guid}", async (Guid id, ReservationRequest request, ClaimsPrincipal user, ITenantContext tenantContext,
            AppDbContext db, IAvailabilityService availability, IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            var input = await ValidateAsync(request, tenantContext, db, durationPolicy, cancellationToken);
            if (input.Error is not null)
            {
                return input.Error;
            }

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var reservation = await db.Reservations.Include(r => r.Tables).SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (reservation is null)
            {
                return Results.NotFound();
            }

            // The first table stays the first one while the tables do not change.
            var currentTableIds = reservation.Tables.Select(t => t.TableId).OrderBy(t => t != reservation.TableId).ToList();
            var requestedTableIds = request.RequestedTableIds;
            var startChanged = input.Date.ToDateTime(input.Time) != reservation.StartLocal;
            var bookingChanged = startChanged
                || input.Duration != reservation.DurationMinutes
                || request.Guests != reservation.PartySize
                || requestedTableIds is null
                || requestedTableIds.Count != currentTableIds.Count || !requestedTableIds.All(currentTableIds.Contains);
            if (bookingChanged && ReservationRules.ClosedStatuses.Contains(reservation.Status))
            {
                return ErrorResponse.Result("reservation_closed", StatusCodes.Status409Conflict);
            }
            IReadOnlyList<Guid> tableIds = currentTableIds;
            if (bookingChanged)
            {
                var check = await availability.CheckAsync(input.Date, input.Time, request.Guests, input.Duration, ReservationSource.Staff,
                    requestedTableIds, ignoreReservationId: reservation.Id, checkPast: startChanged,
                    checkOpeningHours: startChanged || reservation.Source != ReservationSource.WalkIn, cancellationToken: cancellationToken);
                if (check.Table is not { } table)
                {
                    return CheckError(check.Error!);
                }
                tableIds = table.TableIds;
            }

            var before = ReservationHistory.Snapshot(reservation, await TableNumbersAsync(db, currentTableIds, cancellationToken));
            var now = DateTime.UtcNow;
            reservation.GuestName = input.Guest!.Name;
            reservation.Language = request.Language is null ? reservation.Language : input.Language!;
            Apply(reservation, input, request.Guests, tableIds, now);
            // Only the changed fields; a PUT that changes none of them leaves no entry.
            var changes = ReservationHistory.Changes(before, ReservationHistory.Snapshot(reservation, await TableNumbersAsync(db, tableIds, cancellationToken)));
            if (changes.Count > 0)
            {
                ReservationHistory.Record(db, reservation, ReservationEventKind.Updated, await ReservationEditor.StaffAsync(user, db, cancellationToken), now, changes);
            }
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Ok(await LoadResponseAsync(db, reservation.Id));
        });

        group.MapPost("/reservations/{id:guid}/status", async (Guid id, StatusRequest request, ClaimsPrincipal user, AppDbContext db,
            IAvailabilityService availability, CancellationToken cancellationToken) =>
        {
            if (request.Status is null || !Enum.GetNames<ReservationStatus>().Contains(request.Status))
            {
                return ErrorResponse.Result("invalid_status", StatusCodes.Status400BadRequest);
            }
            var status = Enum.Parse<ReservationStatus>(request.Status);

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var reservation = await db.Reservations.Include(r => r.Tables).SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (reservation is null)
            {
                return Results.NotFound();
            }
            if (!ReservationRules.IsTransitionAllowed(reservation, status))
            {
                return ErrorResponse.Result("invalid_status_transition", StatusCodes.Status409Conflict);
            }
            var now = await availability.GetLocalNowAsync(cancellationToken) ?? DateTime.UtcNow;
            if (!ReservationRules.IsAllowedNow(reservation, status, now))
            {
                return ErrorResponse.Result("status_not_allowed_now", StatusCodes.Status409Conflict);
            }
            if (ReservationRules.NeedsFreeTable(reservation.Status, status)
                && !await availability.AreTablesFreeAsync(reservation.Tables.Select(t => t.TableId).ToList(), reservation.StartLocal,
                    reservation.EndLocal, reservation.Id, cancellationToken))
            {
                return ErrorResponse.Result("table_unavailable", StatusCodes.Status409Conflict);
            }

            reservation.CompletedAtLocal = status == ReservationStatus.Completed ? TruncateToMinute(now) : null;
            // A status set by the staff, e.g. the undo of a guest's cancellation, is no longer the guest's cancellation.
            reservation.CancelledByGuest = false;
            var nowUtc = DateTime.UtcNow;
            ReservationHistory.Record(db, reservation, ReservationEventKind.StatusChanged, await ReservationEditor.StaffAsync(user, db, cancellationToken),
                nowUtc, ReservationHistory.StatusChange(reservation.Status, status));
            reservation.Status = status;
            reservation.UpdatedAtUtc = nowUtc;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(await LoadResponseAsync(db, reservation.Id));
        });

        // The undo of a walk-in's arrival: a walk-in was never expected, so it is removed instead of becoming a confirmed
        // reservation; a party seated from the waitlist is back on it. Only an arrived walk-in can be deleted; every other
        // reservation keeps its history (409).
        group.MapDelete("/reservations/{id:guid}", async (Guid id, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var reservation = await db.Reservations.SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (reservation is null)
            {
                return Results.NotFound();
            }
            if (reservation.Source != ReservationSource.WalkIn || reservation.Status != ReservationStatus.Arrived)
            {
                return ErrorResponse.Result("cannot_delete_reservation", StatusCodes.Status409Conflict);
            }

            // A party seated from the waitlist waits again.
            var waitlistEntry = await db.WaitlistEntries.SingleOrDefaultAsync(e => e.SeatedReservationId == id, cancellationToken);
            if (waitlistEntry is not null)
            {
                waitlistEntry.Status = WaitlistStatus.Waiting;
                waitlistEntry.SeatedReservationId = null;
                waitlistEntry.UpdatedAtUtc = DateTime.UtcNow;
            }
            db.Reservations.Remove(reservation);
            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        });

        // The tables and combinations the reservation can change to at its booked time, for its party and duration, as a change of
        // only its tables checks them (without the opening hours and "in the past"): e.g. a guest who arrives and sits down elsewhere.
        group.MapGet("/reservations/{id:guid}/free-tables", async (Guid id, AppDbContext db, IAvailabilityService availability, CancellationToken cancellationToken) =>
        {
            var reservation = await db.Reservations.AsNoTracking().SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
            return reservation is null
                ? Results.NotFound()
                : Results.Ok(await availability.GetFreeTablesAsync(reservation.StartLocal, reservation.EndLocal, reservation.PartySize, reservation.Id,
                    cancellationToken));
        });

        // Who changed what and when, newest first.
        group.MapGet("/reservations/{id:guid}/history", async (Guid id, ITenantContext tenantContext, AppDbContext db, CancellationToken cancellationToken) =>
        {
            if (!await db.Reservations.AnyAsync(r => r.Id == id, cancellationToken))
            {
                return Results.NotFound();
            }
            var timeZoneId = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.TimeZoneId).SingleAsync(cancellationToken);
            var timeZone = timeZoneId is null ? TimeZoneInfo.Utc : TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            var events = await db.ReservationEvents
                .Where(e => e.ReservationId == id)
                .OrderByDescending(e => e.AtUtc)
                .ToListAsync(cancellationToken);
            return Results.Ok(events.Select(e =>
            {
                var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(e.AtUtc, DateTimeKind.Utc), timeZone);
                return new ReservationEventResponse(
                    DateOnly.FromDateTime(local),
                    FormatTime(TimeOnly.FromDateTime(local)),
                    e.Actor,
                    e.UserDisplayName,
                    e.Kind,
                    e.Changes.Select(c => new ReservationChangeResponse(c.Field, c.From, c.To)).ToList());
            }).ToList());
        });

        group.MapGet("/walk-in-tables", async (int guests, IAvailabilityService availability, IReservationDurationPolicy durationPolicy,
            CancellationToken cancellationToken) =>
        {
            if (guests < 1)
            {
                return ErrorResponse.Result("invalid_party_size", StatusCodes.Status400BadRequest);
            }
            var duration = await durationPolicy.GetDurationAsync(guests, cancellationToken);
            var check = await availability.CheckWalkInAsync(guests, duration, cancellationToken);
            if (check.Error is not null)
            {
                return BadRequest(check.Error);
            }
            return Results.Ok(new WalkInTablesResponse(FormatTime(TimeOnly.FromDateTime(check.Start)), duration, check.FreeTables));
        });

        // A guest without a reservation: seated now, so the reservation starts as arrived.
        group.MapPost("/walk-ins", async (WalkInRequest request, ClaimsPrincipal user, ITenantContext tenantContext, AppDbContext db,
            IAvailabilityService availability, IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var (walkIn, error) = await AddWalkInAsync(request, user, tenantContext, db, availability, durationPolicy, cancellationToken);
            if (walkIn is null)
            {
                return error!;
            }
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Created($"/api/staff/reservations/{walkIn.Id}", await LoadResponseAsync(db, walkIn.Id));
        });
    }

    /// <summary>
    /// Checks a walk-in (see <see cref="WalkInRequest"/>) and adds it with its history to <paramref name="db"/>, not saved yet, so
    /// the caller saves it in its transaction together with its own changes (e.g. the waitlist). Returns the error otherwise.
    /// </summary>
    internal static async Task<(Reservation? WalkIn, IResult? Error)> AddWalkInAsync(WalkInRequest request, ClaimsPrincipal user,
        ITenantContext tenantContext, AppDbContext db, IAvailabilityService availability, IReservationDurationPolicy durationPolicy,
        CancellationToken cancellationToken)
    {
        if (request.Guests < 1)
        {
            return (null, BadRequest("invalid_party_size"));
        }
        if (request.DurationMinutes is { } minutes && !ReservationSettingsEndpoints.IsValidDuration(minutes))
        {
            return (null, BadRequest("invalid_duration"));
        }
        var name = string.IsNullOrWhiteSpace(request.Name) ? Reservation.WalkInName : request.Name;
        var (guest, guestError) = GuestDetails.Parse(name, request.Phone, null, request.Notes, contactRequired: false);
        if (guest is null)
        {
            return (null, BadRequest(guestError!));
        }
        var duration = request.DurationMinutes ?? await durationPolicy.GetDurationAsync(request.Guests, cancellationToken);
        var countryCode = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.CountryCode).SingleAsync(cancellationToken);

        var check = await availability.CheckWalkInAsync(request.Guests, duration, cancellationToken);
        if (check.Error is not null)
        {
            return (null, BadRequest(check.Error));
        }
        var table = request.TableId is null ? check.FreeTables.FirstOrDefault() : check.FreeTables.FirstOrDefault(t => t.Id == request.TableId);
        if (table is null)
        {
            return (null, CheckError(request.TableId is null ? "slot_unavailable" : "table_unavailable"));
        }

        var now = DateTime.UtcNow;
        var reservation = new Reservation
        {
            GuestName = guest.Name,
            Status = ReservationStatus.Arrived,
            Source = ReservationSource.WalkIn,
            ReferenceCode = await ReferenceCode.GenerateUniqueAsync(db, cancellationToken),
            Language = DefaultLanguage(countryCode),
            CreatedAtUtc = now,
            TableId = table.Id,
            Tables = [new ReservationTable { TableId = table.Id }],
            StartLocal = check.Start,
            EndLocal = check.Start.AddMinutes(duration),
            DurationMinutes = duration,
            PartySize = request.Guests,
            GuestPhone = guest.Phone,
            Notes = guest.Notes,
            UpdatedAtUtc = now,
        };
        db.Reservations.Add(reservation);
        ReservationHistory.Record(db, reservation, ReservationEventKind.Created, await ReservationEditor.StaffAsync(user, db, cancellationToken), now);
        return (reservation, null);
    }

    /// <summary>The checked input of a request; <see cref="Error"/> is set when it is invalid.</summary>
    private record ValidatedInput(IResult? Error, DateOnly Date = default, TimeOnly Time = default, int Duration = 0, GuestDetails? Guest = null, string? Language = null);

    private static async Task<ValidatedInput> ValidateAsync(ReservationRequest request, ITenantContext tenantContext, AppDbContext db,
        IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken)
    {
        if (!DateOnly.TryParseExact(request.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            return new ValidatedInput(BadRequest("invalid_date"));
        }
        if (!TryParseTime(request.Time, allowEndOfDay: false, out var time))
        {
            return new ValidatedInput(BadRequest("invalid_time"));
        }
        if (request.Guests < 1)
        {
            return new ValidatedInput(BadRequest("invalid_party_size"));
        }
        if (request.DurationMinutes is { } minutes && !ReservationSettingsEndpoints.IsValidDuration(minutes))
        {
            return new ValidatedInput(BadRequest("invalid_duration"));
        }
        var (guest, guestError) = GuestDetails.Parse(request.Name, request.Phone, request.Email, request.Notes, contactRequired: false);
        if (guest is null)
        {
            return new ValidatedInput(BadRequest(guestError!));
        }

        var language = request.Language;
        if (language is null)
        {
            var countryCode = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.CountryCode).SingleAsync(cancellationToken);
            language = DefaultLanguage(countryCode);
        }
        else if (!ReservationRules.Languages.Contains(language))
        {
            return new ValidatedInput(BadRequest("invalid_language"));
        }

        var duration = request.DurationMinutes ?? await durationPolicy.GetDurationAsync(request.Guests, cancellationToken);
        return new ValidatedInput(null, date, time, duration, guest, language);
    }

    /// <summary>The guest's language when staff do not give one: the language of the restaurant's country.</summary>
    private static string DefaultLanguage(string? countryCode) => countryCode switch
    {
        "DE" or "AT" => "de",
        "RS" => "sr-Latn",
        _ => "en",
    };

    /// <summary>
    /// Sets the input and the tables: <paramref name="tableIds"/> in number order (<see cref="FreeTable.TableIds"/>), the first
    /// one also as <see cref="Reservation.TableId"/>. The table rows that stay are kept, so <see cref="Reservation.Tables"/> must be loaded.
    /// </summary>
    private static void Apply(Reservation reservation, ValidatedInput input, int guests, IReadOnlyList<Guid> tableIds, DateTime nowUtc)
    {
        reservation.TableId = tableIds[0];
        reservation.Tables.RemoveAll(t => !tableIds.Contains(t.TableId));
        reservation.Tables.AddRange(tableIds.Where(id => reservation.Tables.All(t => t.TableId != id)).Select(id => new ReservationTable { TableId = id }));
        reservation.StartLocal = input.Date.ToDateTime(input.Time);
        reservation.EndLocal = reservation.StartLocal.AddMinutes(input.Duration);
        reservation.DurationMinutes = input.Duration;
        reservation.PartySize = guests;
        reservation.GuestPhone = input.Guest!.Phone;
        reservation.GuestEmail = input.Guest.Email;
        reservation.Notes = input.Guest.Notes;
        reservation.UpdatedAtUtc = nowUtc;
    }

    /// <summary>The numbers of the tables as the history shows them: "4", or "4 + 5" for a combination.</summary>
    private static async Task<string> TableNumbersAsync(AppDbContext db, IReadOnlyCollection<Guid> tableIds, CancellationToken cancellationToken) =>
        AvailabilityService.CombinedLabel(InNumberOrder(await db.Tables.Where(t => tableIds.Contains(t.Id)).ToListAsync(cancellationToken)));

    /// <summary>The reservations with their tables and area, archived ones included, sorted by start and (first) table number.</summary>
    internal static async Task<List<ReservationResponse>> LoadResponsesAsync(AppDbContext db, IQueryable<Reservation> reservations)
    {
        var rows = await reservations
            .Include(r => r.Tables)
            .Join(db.Tables, r => r.TableId, t => t.Id, (r, t) => new { Reservation = r, Table = t })
            .Join(db.Areas, x => x.Table.AreaId, a => a.Id, (x, a) => new { x.Reservation, x.Table, Area = a })
            .ToListAsync();
        var tableIds = rows.SelectMany(r => r.Reservation.Tables.Select(t => t.TableId)).Distinct().ToList();
        var tables = await db.Tables.Where(t => tableIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id);
        return rows
            .OrderBy(r => r.Reservation.StartLocal)
            .ThenBy(r => r.Table.Number.Length).ThenBy(r => r.Table.Number, StringComparer.Ordinal)
            .Select(r => ToResponse(r.Reservation, InNumberOrder(r.Reservation.Tables.Select(t => tables[t.TableId])), r.Area))
            .ToList();
    }

    /// <summary>Tables by number, as everywhere: "2" before "10".</summary>
    internal static List<Table> InNumberOrder(IEnumerable<Table> tables) =>
        tables.OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal).ToList();

    internal static async Task<ReservationResponse> LoadResponseAsync(AppDbContext db, Guid id) =>
        (await LoadResponsesAsync(db, db.Reservations.Where(r => r.Id == id))).Single();

    /// <summary><paramref name="tables"/> are all tables of the reservation in number order; the table number is their joined label, e.g. "4 + 5".</summary>
    private static ReservationResponse ToResponse(Reservation reservation, List<Table> tables, Area area) => new(
        reservation.Id,
        reservation.ReferenceCode,
        DateOnly.FromDateTime(reservation.StartLocal),
        FormatTime(TimeOnly.FromDateTime(reservation.StartLocal)),
        FormatLocalTime(reservation.EndLocal, reservation.StartLocal),
        reservation.DurationMinutes,
        reservation.PartySize,
        reservation.Status,
        reservation.Source,
        reservation.TableId,
        AvailabilityService.CombinedLabel(tables),
        tables.Any(t => t.ArchivedAtUtc is not null),
        tables.Select(t => t.Id).ToList(),
        tables.Select(t => t.Number).ToList(),
        area.Id,
        area.Name,
        reservation.GuestName,
        reservation.GuestPhone,
        reservation.GuestEmail,
        reservation.Notes,
        reservation.Language,
        reservation.CompletedAtLocal is { } completed ? FormatLocalTime(completed, reservation.StartLocal) : null,
        reservation.CancelledByGuest,
        reservation.CreatedAtUtc,
        reservation.UpdatedAtUtc);

    /// <summary>"HH:mm" of a time on the day of <paramref name="startLocal"/>; a later day is shown as "24:00" (the day's lists end at midnight).</summary>
    private static string FormatLocalTime(DateTime local, DateTime startLocal) =>
        local.Date > startLocal.Date ? FormatTime(OpeningPeriod.EndOfDay) : FormatTime(TimeOnly.FromDateTime(local));

    private static DateTime TruncateToMinute(DateTime value) => new(value.Year, value.Month, value.Day, value.Hour, value.Minute, 0);

    private static IResult BadRequest(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);

    /// <summary>A failed <see cref="IAvailabilityService.CheckAsync"/>: 409 when the time or table is taken, otherwise 400.</summary>
    private static IResult CheckError(string error) =>
        ErrorResponse.Result(error, error is "slot_unavailable" or "table_unavailable" ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest);
}
