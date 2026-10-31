using System.Globalization;
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

    public record FloorTable(Guid Id, string Number, int Seats, double PosX, double PosY);

    public record FloorArea(Guid Id, string Name, int SortOrder, string? FloorPlanUrl, IReadOnlyList<FloorTable> Tables);

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
        Guid AreaId,
        string AreaName,
        string Name,
        string? Phone,
        string? Email,
        string? Notes,
        string Language,
        string? CompletedTime,
        DateTime CreatedAtUtc,
        DateTime UpdatedAtUtc);

    /// <summary>
    /// A new or changed reservation. <see cref="Date"/> is "YYYY-MM-DD", <see cref="Time"/> "HH:mm". Without <see cref="TableId"/>
    /// the system assigns a table, without <see cref="DurationMinutes"/> the restaurant's duration for the party size applies,
    /// without <see cref="Language"/> the language of the restaurant's country. Errors (400): "invalid_date", "invalid_time",
    /// "invalid_party_size", "invalid_duration", "invalid_name", "invalid_phone", "invalid_email", "invalid_notes",
    /// "invalid_language", "outside_opening_hours", "in_the_past"; (409): "slot_unavailable", "table_unavailable".
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
        string? Language);

    /// <summary>
    /// Errors: "invalid_status" (400); (409): "invalid_status_transition", "status_not_allowed_now" ("arrived" and "late" only on
    /// the day of the reservation, "no-show" only from its start), "table_unavailable" (an undo while the table is taken).
    /// </summary>
    public record StatusRequest(string? Status);

    /// <summary>
    /// A guest without a reservation, seated now. Without <see cref="TableId"/> the system assigns a table, without
    /// <see cref="DurationMinutes"/> the restaurant's duration for the party size applies, without <see cref="Name"/> it is
    /// <see cref="Reservation.WalkInName"/>. Errors (400): "invalid_party_size", "invalid_duration", "invalid_name", "invalid_phone",
    /// "invalid_notes", "outside_opening_hours"; (409): "slot_unavailable", "table_unavailable".
    /// </summary>
    public record WalkInRequest(int Guests, Guid? TableId, int? DurationMinutes, string? Name, string? Phone, string? Notes);

    /// <summary>The tables free for a walk-in from <see cref="Time"/> (now) for <see cref="DurationMinutes"/>, the suggested one first.</summary>
    public record WalkInTablesResponse(string Time, int DurationMinutes, IReadOnlyList<FreeTable> Tables);

    public record StaffAvailabilityTime(string Time, IReadOnlyList<FreeTable> Tables);

    public record StaffAvailabilityPeriod(string Start, string End, IReadOnlyList<StaffAvailabilityTime> Times);

    public record StaffAvailabilityResponse(DateOnly Date, int Guests, int DurationMinutes, IReadOnlyList<StaffAvailabilityPeriod> Periods);

    public static void MapStaffReservationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/staff").RequireAuthorization(Policies.RequireStaff);

        // Areas and tables for the front desk; the admin endpoints are for Tenant Admins only.
        group.MapGet("/floor", async (AppDbContext db) =>
        {
            var areas = await db.Areas.OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync();
            var tables = (await db.Tables.ToListAsync())
                .OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal)
                .ToList();
            return areas.Select(area => new FloorArea(
                area.Id,
                area.Name,
                area.SortOrder,
                AreaEndpoints.FloorPlanUrl(area),
                tables.Where(t => t.AreaId == area.Id).Select(t => new FloorTable(t.Id, t.Number, t.Seats, t.PosX, t.PosY)).ToList()));
        });

        // Without from/to: today in the restaurant's time zone.
        group.MapGet("/reservations", async (DateOnly? from, DateOnly? to, AppDbContext db, IAvailabilityService availability) =>
        {
            var start = from ?? DateOnly.FromDateTime(await availability.GetLocalNowAsync() ?? DateTime.UtcNow);
            var end = to ?? start;
            if (end < start || end.DayNumber - start.DayNumber >= MaxListDays)
            {
                return ErrorResponse.Result("invalid_range", StatusCodes.Status400BadRequest);
            }

            var startLocal = start.ToDateTime(TimeOnly.MinValue);
            var endLocal = end.AddDays(1).ToDateTime(TimeOnly.MinValue);
            return Results.Ok(await LoadResponsesAsync(db, db.Reservations.Where(r => r.StartLocal >= startLocal && r.StartLocal < endLocal)));
        });

        group.MapGet("/availability", async (DateOnly date, int guests, int? durationMinutes, IAvailabilityService availability, IReservationDurationPolicy durationPolicy) =>
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
            var periods = await availability.GetSlotsAsync(date, guests, duration, ReservationSource.Staff);
            return Results.Ok(new StaffAvailabilityResponse(date, guests, duration, periods
                .Select(p => new StaffAvailabilityPeriod(
                    FormatTime(p.Period.Start),
                    FormatTime(p.Period.End),
                    p.Slots.Select(s => new StaffAvailabilityTime(FormatTime(s.Time), s.FreeTables)).ToList()))
                .ToList()));
        });

        // A reservation on the guest's behalf, e.g. by phone: always confirmed.
        group.MapPost("/reservations", async (ReservationRequest request, ITenantContext tenantContext, AppDbContext db, IAvailabilityService availability,
            IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            var input = await ValidateAsync(request, tenantContext, db, durationPolicy, cancellationToken);
            if (input.Error is not null)
            {
                return input.Error;
            }

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var check = await availability.CheckAsync(input.Date, input.Time, request.Guests, input.Duration, ReservationSource.Staff,
                request.TableId, cancellationToken: cancellationToken);
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
            Apply(reservation, input, request.Guests, table.Id, now);
            db.Reservations.Add(reservation);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Created($"/api/staff/reservations/{reservation.Id}", await LoadResponseAsync(db, reservation.Id));
        });

        // Same checks as a new reservation; the reservation does not collide with itself. A start that is not changed
        // may lie in the past, so a running reservation can still be changed (e.g. its notes or duration).
        group.MapPut("/reservations/{id:guid}", async (Guid id, ReservationRequest request, ITenantContext tenantContext, AppDbContext db,
            IAvailabilityService availability, IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            var input = await ValidateAsync(request, tenantContext, db, durationPolicy, cancellationToken);
            if (input.Error is not null)
            {
                return input.Error;
            }

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var reservation = await db.Reservations.SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (reservation is null)
            {
                return Results.NotFound();
            }

            var startChanged = input.Date.ToDateTime(input.Time) != reservation.StartLocal;
            var check = await availability.CheckAsync(input.Date, input.Time, request.Guests, input.Duration, ReservationSource.Staff,
                request.TableId, ignoreReservationId: reservation.Id, checkPast: startChanged, cancellationToken: cancellationToken);
            if (check.Table is not { } table)
            {
                return CheckError(check.Error!);
            }

            reservation.GuestName = input.Guest!.Name;
            reservation.Language = request.Language is null ? reservation.Language : input.Language!;
            Apply(reservation, input, request.Guests, table.Id, DateTime.UtcNow);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Ok(await LoadResponseAsync(db, reservation.Id));
        });

        group.MapPost("/reservations/{id:guid}/status", async (Guid id, StatusRequest request, AppDbContext db, IAvailabilityService availability,
            CancellationToken cancellationToken) =>
        {
            if (request.Status is null || !Enum.GetNames<ReservationStatus>().Contains(request.Status))
            {
                return ErrorResponse.Result("invalid_status", StatusCodes.Status400BadRequest);
            }
            var status = Enum.Parse<ReservationStatus>(request.Status);

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var reservation = await db.Reservations.SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (reservation is null)
            {
                return Results.NotFound();
            }
            if (!ReservationRules.IsTransitionAllowed(reservation.Status, status))
            {
                return ErrorResponse.Result("invalid_status_transition", StatusCodes.Status409Conflict);
            }
            var now = await availability.GetLocalNowAsync(cancellationToken) ?? DateTime.UtcNow;
            if (!ReservationRules.IsAllowedNow(status, reservation.StartLocal, now))
            {
                return ErrorResponse.Result("status_not_allowed_now", StatusCodes.Status409Conflict);
            }
            if (ReservationRules.NeedsFreeTable(reservation.Status, status)
                && !await availability.IsTableFreeAsync(reservation.TableId, reservation.StartLocal, reservation.EndLocal, reservation.Id, cancellationToken))
            {
                return ErrorResponse.Result("table_unavailable", StatusCodes.Status409Conflict);
            }

            reservation.CompletedAtLocal = status == ReservationStatus.Completed ? TruncateToMinute(now) : null;
            reservation.Status = status;
            reservation.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(await LoadResponseAsync(db, reservation.Id));
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
        group.MapPost("/walk-ins", async (WalkInRequest request, ITenantContext tenantContext, AppDbContext db, IAvailabilityService availability,
            IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            if (request.Guests < 1)
            {
                return BadRequest("invalid_party_size");
            }
            if (request.DurationMinutes is { } minutes && !ReservationSettingsEndpoints.IsValidDuration(minutes))
            {
                return BadRequest("invalid_duration");
            }
            var name = string.IsNullOrWhiteSpace(request.Name) ? Reservation.WalkInName : request.Name;
            var (guest, guestError) = GuestDetails.Parse(name, request.Phone, null, request.Notes, contactRequired: false);
            if (guest is null)
            {
                return BadRequest(guestError!);
            }
            var duration = request.DurationMinutes ?? await durationPolicy.GetDurationAsync(request.Guests, cancellationToken);
            var countryCode = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.CountryCode).SingleAsync(cancellationToken);

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var check = await availability.CheckWalkInAsync(request.Guests, duration, cancellationToken);
            if (check.Error is not null)
            {
                return BadRequest(check.Error);
            }
            var table = request.TableId is null ? check.FreeTables.FirstOrDefault() : check.FreeTables.FirstOrDefault(t => t.Id == request.TableId);
            if (table is null)
            {
                return CheckError(request.TableId is null ? "slot_unavailable" : "table_unavailable");
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
                StartLocal = check.Start,
                EndLocal = check.Start.AddMinutes(duration),
                DurationMinutes = duration,
                PartySize = request.Guests,
                GuestPhone = guest.Phone,
                Notes = guest.Notes,
                UpdatedAtUtc = now,
            };
            db.Reservations.Add(reservation);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Created($"/api/staff/reservations/{reservation.Id}", await LoadResponseAsync(db, reservation.Id));
        });
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

    private static void Apply(Reservation reservation, ValidatedInput input, int guests, Guid tableId, DateTime nowUtc)
    {
        reservation.TableId = tableId;
        reservation.StartLocal = input.Date.ToDateTime(input.Time);
        reservation.EndLocal = reservation.StartLocal.AddMinutes(input.Duration);
        reservation.DurationMinutes = input.Duration;
        reservation.PartySize = guests;
        reservation.GuestPhone = input.Guest!.Phone;
        reservation.GuestEmail = input.Guest.Email;
        reservation.Notes = input.Guest.Notes;
        reservation.UpdatedAtUtc = nowUtc;
    }

    /// <summary>The reservations with their table and area, sorted by start and table number.</summary>
    private static async Task<List<ReservationResponse>> LoadResponsesAsync(AppDbContext db, IQueryable<Reservation> reservations)
    {
        var rows = await reservations
            .Join(db.Tables, r => r.TableId, t => t.Id, (r, t) => new { Reservation = r, Table = t })
            .Join(db.Areas, x => x.Table.AreaId, a => a.Id, (x, a) => new { x.Reservation, x.Table, Area = a })
            .ToListAsync();
        return rows
            .OrderBy(r => r.Reservation.StartLocal)
            .ThenBy(r => r.Table.Number.Length).ThenBy(r => r.Table.Number, StringComparer.Ordinal)
            .Select(r => ToResponse(r.Reservation, r.Table, r.Area))
            .ToList();
    }

    private static async Task<ReservationResponse> LoadResponseAsync(AppDbContext db, Guid id) =>
        (await LoadResponsesAsync(db, db.Reservations.Where(r => r.Id == id))).Single();

    private static ReservationResponse ToResponse(Reservation reservation, Table table, Area area) => new(
        reservation.Id,
        reservation.ReferenceCode,
        DateOnly.FromDateTime(reservation.StartLocal),
        FormatTime(TimeOnly.FromDateTime(reservation.StartLocal)),
        FormatLocalTime(reservation.EndLocal, reservation.StartLocal),
        reservation.DurationMinutes,
        reservation.PartySize,
        reservation.Status,
        reservation.Source,
        table.Id,
        table.Number,
        area.Id,
        area.Name,
        reservation.GuestName,
        reservation.GuestPhone,
        reservation.GuestEmail,
        reservation.Notes,
        reservation.Language,
        reservation.CompletedAtLocal is { } completed ? FormatLocalTime(completed, reservation.StartLocal) : null,
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
