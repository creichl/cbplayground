using System.Globalization;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Endpoints.OpeningHoursEndpoints;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The guest booking of a restaurant, without sign-in. The restaurant comes from the slug in the URL and is set as the
/// tenant of the request (<see cref="TenantScope"/>), also for a signed-in user of another restaurant.
/// Failed requests are answered with <c>{ "error": "..." }</c>; the codes are listed at the request types.
/// </summary>
public static class PublicRestaurantEndpoints
{
    /// <summary>The rate limiter policy of the online booking, see Program.cs.</summary>
    public const string BookingRateLimitPolicy = "public-booking";

    /// <summary>The rate limiter policy of the guest's reservation link (view and cancel), with the limit of the booking; see Program.cs.</summary>
    public const string ManageRateLimitPolicy = "public-manage";

    /// <summary>The restaurant for the booking page: its profile (every field null when empty) and how it is booked.</summary>
    public record RestaurantResponse(
        string Name,
        string? Street,
        string? PostalCode,
        string? City,
        string? Phone,
        string? Email,
        string? Website,
        string? Description,
        string? TimeZoneId,
        ConfirmationMode ConfirmationMode,
        TableSelectionMode TableSelectionMode,
        int MaxOnlinePartySize,
        IReadOnlyList<PeriodDto> OpeningHours,
        bool Bookable);

    /// <summary><see cref="Status"/>: "closed", "full" or "available".</summary>
    public record CalendarDay(DateOnly Date, string Status);

    public record AvailabilityTime(string Time, bool Available);

    public record AvailabilityPeriod(string Start, string End, IReadOnlyList<AvailabilityTime> Times);

    public record AvailabilityResponse(DateOnly Date, int Guests, int DurationMinutes, IReadOnlyList<AvailabilityPeriod> Periods);

    public record PublicTable(Guid Id, string Number, int Seats, double PosX, double PosY, bool Available);

    public record PublicArea(Guid Id, string Name, string? FloorPlanUrl, IReadOnlyList<PublicTable> Tables);

    /// <summary>
    /// An online booking. <see cref="Date"/> is "YYYY-MM-DD", <see cref="Time"/> "HH:mm". <see cref="TableId"/> is required when
    /// the guest chooses the table and ignored otherwise. Errors (400): "invalid_date", "invalid_time", "invalid_party_size",
    /// "invalid_name", "contact_required", "invalid_phone", "invalid_email", "invalid_notes", "invalid_language", "table_required",
    /// "outside_opening_hours", "too_far_ahead", "in_the_past"; (409): "slot_unavailable", "table_unavailable".
    /// </summary>
    public record BookingRequest(
        string? Date,
        string? Time,
        int Guests,
        Guid? TableId,
        string? Name,
        string? Phone,
        string? Email,
        string? Notes,
        string? Language);

    /// <summary>A booked table. <see cref="ManageToken"/> belongs in the guest's link to view and cancel the reservation; it is only returned here.</summary>
    public record BookingResponse(
        string ReferenceCode,
        ReservationStatus Status,
        DateOnly Date,
        string Time,
        int Guests,
        int DurationMinutes,
        string Area,
        string TableNumber,
        string ManageToken);

    /// <summary>
    /// A reservation as the guest sees it through the link. <see cref="CanCancel"/> tells whether the guest can still cancel it
    /// (<see cref="ReservationRules.CanGuestCancel"/>).
    /// </summary>
    public record GuestReservationResponse(
        string ReferenceCode,
        ReservationStatus Status,
        DateOnly Date,
        string Time,
        string EndTime,
        int Guests,
        int DurationMinutes,
        string Area,
        string TableNumber,
        string Name,
        bool CancelledByGuest,
        bool CanCancel);

    /// <summary>The guest cancels with the token of the link. Errors: 404 (wrong code or token), 409 "cancellation_not_possible".</summary>
    public record CancelRequest(string? Token);

    public static void MapPublicRestaurantEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/public/restaurants/{slug}").AddEndpointFilter(async (context, next) =>
        {
            var services = context.HttpContext.RequestServices;
            var slug = context.HttpContext.GetRouteValue("slug") as string;
            var tenantId = await services.GetRequiredService<AppDbContext>().Tenants
                .Where(t => t.Slug == slug)
                .Select(t => (Guid?)t.Id)
                .SingleOrDefaultAsync();
            if (tenantId is null)
            {
                return Results.NotFound();
            }
            services.GetRequiredService<TenantScope>().TenantId = tenantId;
            return await next(context);
        });

        group.MapGet("/", async (ITenantContext tenantContext, AppDbContext db, IAvailabilityService availability) =>
        {
            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            var settings = await LoadSettingsAsync(db);
            var openingHours = (await db.OpeningPeriods.OrderBy(p => p.DayOfWeek).ThenBy(p => p.Start).ToListAsync())
                .Select(p => new PeriodDto(p.DayOfWeek, FormatTime(p.Start), FormatTime(p.End)))
                .ToList();
            var maxOnlinePartySize = await availability.GetMaxOnlinePartySizeAsync();
            return new RestaurantResponse(
                tenant.Name,
                tenant.Street,
                tenant.PostalCode,
                tenant.City,
                tenant.Phone,
                tenant.Email,
                tenant.Website,
                tenant.Description,
                tenant.TimeZoneId,
                settings.ConfirmationMode,
                settings.TableSelectionMode,
                maxOnlinePartySize,
                openingHours,
                Bookable: tenant.TimeZoneId is not null && openingHours.Count > 0 && maxOnlinePartySize > 0);
        });

        // One entry per day of the month. Days in the past and more than 90 days ahead are "closed", like closing days.
        group.MapGet("/calendar", async (string? month, int guests, IAvailabilityService availability, IReservationDurationPolicy durationPolicy) =>
        {
            if (!DateOnly.TryParseExact($"{month}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var first))
            {
                return Error("invalid_month");
            }
            if (guests < 1)
            {
                return Error("invalid_party_size");
            }

            var now = await availability.GetLocalNowAsync();
            var today = now is null ? (DateOnly?)null : DateOnly.FromDateTime(now.Value);
            var duration = await durationPolicy.GetDurationAsync(guests);
            var days = new List<CalendarDay>();
            for (var date = first; date.Month == first.Month; date = date.AddDays(1))
            {
                var status = "closed";
                if (today is not null && date >= today && date <= today.Value.AddDays(ReservationRules.MaxOnlineDaysAhead))
                {
                    var periods = await availability.GetSlotsAsync(date, guests, duration, ReservationSource.Online);
                    if (periods.Count > 0)
                    {
                        status = periods.Any(p => p.Slots.Any(s => s.FreeTables.Count > 0)) ? "available" : "full";
                    }
                }
                days.Add(new CalendarDay(date, status));
            }
            return Results.Ok(days);
        });

        group.MapGet("/availability", async (DateOnly date, int guests, IAvailabilityService availability, IReservationDurationPolicy durationPolicy) =>
        {
            if (guests < 1)
            {
                return Error("invalid_party_size");
            }

            var duration = await durationPolicy.GetDurationAsync(guests);
            var periods = await availability.GetSlotsAsync(date, guests, duration, ReservationSource.Online);
            return Results.Ok(new AvailabilityResponse(date, guests, duration, periods
                .Select(p => new AvailabilityPeriod(
                    FormatTime(p.Period.Start),
                    FormatTime(p.Period.End),
                    p.Slots.Select(s => new AvailabilityTime(FormatTime(s.Time), s.FreeTables.Count > 0)).ToList()))
                .ToList()));
        });

        // The online areas with all their tables; "available" tells which ones the guest can pick for this time.
        group.MapGet("/tables", async (DateOnly date, string? time, int guests, AppDbContext db, IAvailabilityService availability, IReservationDurationPolicy durationPolicy) =>
        {
            if ((await LoadSettingsAsync(db)).TableSelectionMode != TableSelectionMode.GuestChooses)
            {
                return Error("table_selection_disabled");
            }
            if (!TryParseTime(time, allowEndOfDay: false, out var startTime))
            {
                return Error("invalid_time");
            }
            if (guests < 1)
            {
                return Error("invalid_party_size");
            }

            var duration = await durationPolicy.GetDurationAsync(guests);
            var slot = (await availability.GetSlotsAsync(date, guests, duration, ReservationSource.Online))
                .SelectMany(p => p.Slots)
                .FirstOrDefault(s => s.Time == startTime);
            var freeTableIds = slot?.FreeTables.Select(t => t.Id).ToHashSet() ?? [];

            var areas = await db.Areas.Where(a => a.OnlineBookingEnabled).OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync();
            var tables = (await db.Tables.ToListAsync())
                .OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal)
                .ToList();
            return Results.Ok(areas.Select(area => new PublicArea(
                area.Id,
                area.Name,
                AreaEndpoints.FloorPlanUrl(area),
                tables
                    .Where(t => t.AreaId == area.Id)
                    .Select(t => new PublicTable(t.Id, t.Number, t.Seats, t.PosX, t.PosY, freeTableIds.Contains(t.Id)))
                    .ToList()))
                .ToList());
        });

        group.MapPost("/reservations", async (BookingRequest request, AppDbContext db, IAvailabilityService availability, IReservationDurationPolicy durationPolicy, CancellationToken cancellationToken) =>
        {
            if (!DateOnly.TryParseExact(request.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                return Error("invalid_date");
            }
            if (!TryParseTime(request.Time, allowEndOfDay: false, out var time))
            {
                return Error("invalid_time");
            }
            if (request.Guests < 1)
            {
                return Error("invalid_party_size");
            }
            var (guest, guestError) = GuestDetails.Parse(request.Name, request.Phone, request.Email, request.Notes, contactRequired: true);
            if (guest is null)
            {
                return Error(guestError!);
            }
            if (request.Language is null || !ReservationRules.Languages.Contains(request.Language))
            {
                return Error("invalid_language");
            }

            var settings = await LoadSettingsAsync(db);
            var guestChooses = settings.TableSelectionMode == TableSelectionMode.GuestChooses;
            if (guestChooses && request.TableId is null)
            {
                return Error("table_required");
            }
            var duration = await durationPolicy.GetDurationAsync(request.Guests, cancellationToken);

            // Check and insert in one transaction (SQLite: BEGIN IMMEDIATE), so two bookings of the last table cannot both succeed.
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var check = await availability.CheckAsync(date, time, request.Guests, duration, ReservationSource.Online,
                guestChooses ? request.TableId : null, cancellationToken: cancellationToken);
            if (check.Table is not { } table)
            {
                return CheckError(check.Error!);
            }

            var now = DateTime.UtcNow;
            var manageToken = ManageToken.Create();
            var reservation = new Reservation
            {
                TableId = table.Id,
                StartLocal = date.ToDateTime(time),
                EndLocal = date.ToDateTime(time).AddMinutes(duration),
                DurationMinutes = duration,
                PartySize = request.Guests,
                GuestName = guest.Name,
                GuestPhone = guest.Phone,
                GuestEmail = guest.Email,
                Notes = guest.Notes,
                Status = settings.ConfirmationMode == ConfirmationMode.Request ? ReservationStatus.Requested : ReservationStatus.Confirmed,
                Source = ReservationSource.Online,
                ReferenceCode = await ReferenceCode.GenerateUniqueAsync(db, cancellationToken),
                Language = request.Language,
                ManageTokenHash = manageToken.Hash,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
            };
            db.Reservations.Add(reservation);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Json(
                new BookingResponse(reservation.ReferenceCode, reservation.Status, date, FormatTime(time), reservation.PartySize, duration, table.AreaName,
                    table.Number, manageToken.Token),
                statusCode: StatusCodes.Status201Created);
        }).RequireRateLimiting(BookingRateLimitPolicy);

        // The guest's link. A wrong code and a wrong token are both 404, so neither tells which one is wrong.
        group.MapGet("/reservations/{referenceCode}", async (string referenceCode, string? token, AppDbContext db, IAvailabilityService availability) =>
        {
            var reservation = await FindForGuestAsync(db, referenceCode, token);
            if (reservation is null)
            {
                return Results.NotFound();
            }
            return Results.Ok(await ToGuestResponseAsync(db, availability, reservation));
        }).RequireRateLimiting(ManageRateLimitPolicy);

        group.MapPost("/reservations/{referenceCode}/cancel", async (string referenceCode, CancelRequest request, AppDbContext db, IAvailabilityService availability) =>
        {
            var reservation = await FindForGuestAsync(db, referenceCode, request.Token);
            if (reservation is null)
            {
                return Results.NotFound();
            }
            if (await availability.GetLocalNowAsync() is not { } now || !ReservationRules.CanGuestCancel(reservation, now))
            {
                return ErrorResponse.Result("cancellation_not_possible", StatusCodes.Status409Conflict);
            }

            reservation.Status = ReservationStatus.Cancelled;
            reservation.CancelledByGuest = true;
            reservation.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(await ToGuestResponseAsync(db, availability, reservation));
        }).RequireRateLimiting(ManageRateLimitPolicy);
    }

    /// <summary>
    /// The reservation of the current restaurant with this reference code, if the token matches its stored hash (compared in
    /// constant time); otherwise null. Reservations without a token (entered by staff) are never found.
    /// </summary>
    private static async Task<Reservation?> FindForGuestAsync(AppDbContext db, string referenceCode, string? token)
    {
        var hash = ManageToken.Hash(token);
        var code = referenceCode.ToUpperInvariant();
        var reservation = await db.Reservations.SingleOrDefaultAsync(r => r.ReferenceCode == code);
        return reservation is not null && ManageToken.Matches(reservation.ManageTokenHash, hash) ? reservation : null;
    }

    private static async Task<GuestReservationResponse> ToGuestResponseAsync(AppDbContext db, IAvailabilityService availability, Reservation reservation)
    {
        var table = await db.Tables.SingleAsync(t => t.Id == reservation.TableId);
        var area = await db.Areas.SingleAsync(a => a.Id == table.AreaId);
        var now = await availability.GetLocalNowAsync();
        return new GuestReservationResponse(
            reservation.ReferenceCode,
            reservation.Status,
            DateOnly.FromDateTime(reservation.StartLocal),
            FormatTime(TimeOnly.FromDateTime(reservation.StartLocal)),
            // A reservation can end at midnight at the latest (no reservations over midnight).
            reservation.EndLocal.Date > reservation.StartLocal.Date ? FormatTime(OpeningPeriod.EndOfDay) : FormatTime(TimeOnly.FromDateTime(reservation.EndLocal)),
            reservation.PartySize,
            reservation.DurationMinutes,
            area.Name,
            table.Number,
            reservation.GuestName,
            reservation.CancelledByGuest,
            now is not null && ReservationRules.CanGuestCancel(reservation, now.Value));
    }

    private static async Task<ReservationSettings> LoadSettingsAsync(AppDbContext db) =>
        await db.ReservationSettings.AsNoTracking().SingleOrDefaultAsync() ?? new ReservationSettings();

    private static IResult Error(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);

    /// <summary>A failed <see cref="IAvailabilityService.CheckAsync"/>: 409 when the time or table is taken, otherwise 400.</summary>
    private static IResult CheckError(string error) =>
        ErrorResponse.Result(error, error is "slot_unavailable" or "table_unavailable" ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest);
}
