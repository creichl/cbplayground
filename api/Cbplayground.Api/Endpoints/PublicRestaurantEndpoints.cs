using System.Globalization;
using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.AspNetCore.Mvc;
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

    /// <summary>The rate limiter policy of the calendar, the availability, the tables and the holds, see Program.cs.</summary>
    public const string ReadRateLimitPolicy = "public-read";

    /// <summary>The setting of the most active holds (<see cref="ReservationHold"/>) per client IP, across all restaurants.</summary>
    public const string HoldLimitSetting = "RateLimiting:PublicHolds:PermitLimit";

    /// <summary>The default of <see cref="HoldLimitSetting"/>.</summary>
    public const int DefaultHoldLimit = 3;

    /// <summary>The header with which the online booking makes a repeated request book only once.</summary>
    public const string IdempotencyKeyHeader = "Idempotency-Key";

    /// <summary>
    /// The restaurant for the booking page: its profile (every field null when empty), how it is booked, its branding, its
    /// areas open for online booking (to describe the place, also when the system assigns the tables), its photo gallery in
    /// its order (empty without photos), its details (cuisines, price level, features and house rules, see
    /// <see cref="RestaurantDetailsEndpoints.DetailsResponse"/>), its frequently asked questions in their order (empty without) and its
    /// country ("DE", "AT", "RS"; null without location), whose calling code the booking form suggests for the phone number.
    /// </summary>
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
        int BookingHorizonDays,
        IReadOnlyList<PeriodDto> OpeningHours,
        bool Bookable,
        BrandingEndpoints.BrandingResponse Branding,
        IReadOnlyList<RestaurantArea> Areas,
        IReadOnlyList<GalleryEndpoints.GalleryPhotoResponse> Gallery,
        IReadOnlyList<Cuisine> Cuisines,
        int? PriceLevel,
        IReadOnlyList<RestaurantFeature> Features,
        string? HouseRules,
        IReadOnlyList<RestaurantDetailsEndpoints.PublicFaq> Faq,
        string? CountryCode);

    /// <summary>An area open for online booking, in the order of the areas; description and photo are null when not given.</summary>
    public record RestaurantArea(string Name, string? Description, string? PhotoUrl);

    /// <summary><see cref="Status"/>: "closed", "full" or "available".</summary>
    public record CalendarDay(DateOnly Date, string Status);

    /// <summary>
    /// <see cref="Combined"/>: the time is available, but only for a combination of tables (no single table seats the party then),
    /// which the system assigns; so where the guest chooses the table, the booking skips that step.
    /// </summary>
    public record AvailabilityTime(string Time, bool Available, bool Combined);

    public record AvailabilityPeriod(string Start, string End, IReadOnlyList<AvailabilityTime> Times);

    public record AvailabilityResponse(DateOnly Date, int Guests, int DurationMinutes, IReadOnlyList<AvailabilityPeriod> Periods);

    public record PublicTable(Guid Id, string Number, int Seats, int MinGuests, double PosX, double PosY, TableShape Shape, int Rotation, bool Available);

    public record PublicArea(Guid Id, string Name, string? FloorPlanUrl, string? Description, string? PhotoUrl, int TableScale, IReadOnlyList<PublicTable> Tables, RoomStyle RoomStyle, IReadOnlyList<AreaEndpoints.RoomElementResponse> RoomElements, double? WidthMeters);

    /// <summary>
    /// An online booking. <see cref="Date"/> is "YYYY-MM-DD", <see cref="Time"/> "HH:mm". <see cref="TableId"/> is required when
    /// the guest chooses the table, unless only a combination of tables is free for the party then (<see cref="AvailabilityTime.Combined"/>),
    /// and ignored otherwise. <see cref="Occasion"/> is optional, e.g. "Birthday" (<see cref="Data.Occasion"/>). Errors (400): "invalid_date",
    /// "invalid_time", "invalid_party_size", "invalid_name", "contact_required", "invalid_phone", "invalid_email", "invalid_notes",
    /// "invalid_language", "invalid_occasion", "table_required",
    /// "outside_opening_hours", "too_short_notice", "too_far_ahead", "in_the_past", "invalid_idempotency_key"; (409): "slot_unavailable",
    /// "table_unavailable". <see cref="HoldToken"/> is the token of the guest's hold (<see cref="HoldResponse"/>), optional: an
    /// unexpired hold of the same date, time, party and table is booked on its tables and deleted; any other is ignored.
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
        string? Language,
        string? Occasion = null,
        string? HoldToken = null);

    /// <summary>
    /// A hold of a table while the guest enters the contact details: <see cref="TableId"/> as in <see cref="BookingRequest"/>. Errors as
    /// the booking's: (400) "invalid_date", "invalid_time", "invalid_party_size", "table_required", "outside_opening_hours",
    /// "too_short_notice", "too_far_ahead", "in_the_past"; (409) "slot_unavailable", "table_unavailable"; (429) "too_many_holds".
    /// </summary>
    public record HoldRequest(string? Date, string? Time, int Guests, Guid? TableId);

    /// <summary>
    /// A held table or combination of tables until <see cref="ExpiresAtUtc"/>. <see cref="HoldToken"/> (32 random bytes, URL-safe Base64)
    /// goes with the booking and releases the hold; only its SHA-256 is stored, so it is returned only here.
    /// </summary>
    public record HoldResponse(string HoldToken, DateTime ExpiresAtUtc, string TableNumber, string Area);

    /// <summary>
    /// A booked table or combination of tables. <see cref="TableNumber"/> is the joined label of <see cref="TableNumbers"/>, e.g. "4 + 5".
    /// <see cref="ManageToken"/> belongs in the guest's link to view and cancel the reservation; it is only returned here.
    /// </summary>
    public record BookingResponse(
        string ReferenceCode,
        ReservationStatus Status,
        DateOnly Date,
        string Time,
        int Guests,
        int DurationMinutes,
        string Area,
        string TableNumber,
        IReadOnlyList<Guid> TableIds,
        IReadOnlyList<string> TableNumbers,
        string ManageToken);

    /// <summary>
    /// A reservation as the guest sees it through the link. <see cref="CanCancel"/> tells whether the guest can still cancel it
    /// (<see cref="ReservationRules.CanGuestCancel"/>). <see cref="TableNumber"/> is the joined label of <see cref="TableNumbers"/>, e.g. "4 + 5".
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
        IReadOnlyList<Guid> TableIds,
        IReadOnlyList<string> TableNumbers,
        string Name,
        bool CancelledByGuest,
        bool CanCancel);

    /// <summary>The guest cancels with the token of the link. Errors: 404 (wrong code or token), 409 "cancellation_not_possible".</summary>
    public record CancelRequest(string? Token);

    public static void MapPublicRestaurantEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/public/restaurants/{slug}").AddEndpointFilter(RestaurantFromSlug);

        group.MapGet("/", async (ITenantContext tenantContext, AppDbContext db, IAvailabilityService availability) =>
        {
            var tenant = await db.Tenants.SingleAsync(t => t.Id == tenantContext.TenantId);
            var settings = await LoadSettingsAsync(db);
            var openingHours = (await db.OpeningPeriods.OrderBy(p => p.DayOfWeek).ThenBy(p => p.Start).ToListAsync())
                .Select(p => new PeriodDto(p.DayOfWeek, FormatTime(p.Start), FormatTime(p.End)))
                .ToList();
            var maxOnlinePartySize = await availability.GetMaxOnlinePartySizeAsync();
            var areas = (await db.Areas.Where(a => a.OnlineBookingEnabled && a.ArchivedAtUtc == null).OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync())
                .Select(a => new RestaurantArea(a.Name, a.Description, AreaEndpoints.PhotoUrl(a)))
                .ToList();
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
                settings.BookingHorizonDays,
                openingHours,
                Bookable: tenant.TimeZoneId is not null && openingHours.Count > 0 && maxOnlinePartySize > 0,
                Branding: BrandingEndpoints.ToResponse(tenant),
                Areas: areas,
                Gallery: await GalleryEndpoints.ListAsync(db, tenant.Slug),
                Cuisines: tenant.Cuisines,
                PriceLevel: tenant.PriceLevel,
                Features: tenant.Features,
                HouseRules: tenant.HouseRules,
                Faq: await RestaurantDetailsEndpoints.PublicListAsync(db),
                CountryCode: tenant.CountryCode);
        });

        group.MapGet("/logo", async (string? v, HttpContext httpContext, ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var fileName = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.LogoFileName).SingleAsync();
            return ImageUploads.Read(httpContext, configuration, environment, fileName, ImageUploads.CacheControl(fileName, v));
        });

        group.MapGet("/cover", async (string? v, HttpContext httpContext, ITenantContext tenantContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var fileName = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.CoverFileName).SingleAsync();
            return ImageUploads.Read(httpContext, configuration, environment, fileName, ImageUploads.CacheControl(fileName, v));
        });

        // A photo of the gallery; one of another restaurant is not found, because the tenant filter hides it.
        group.MapGet("/gallery/{id:guid}", async (Guid id, string? v, HttpContext httpContext, AppDbContext db, IConfiguration configuration, IWebHostEnvironment environment) =>
        {
            var fileName = await db.GalleryPhotos.Where(p => p.Id == id).Select(p => p.FileName).SingleOrDefaultAsync();
            return ImageUploads.Read(httpContext, configuration, environment, fileName, ImageUploads.CacheControl(fileName, v));
        });

        // One entry per day of the month. Days in the past and beyond the booking horizon are "closed", like closing days.
        group.MapGet("/calendar", async (string? month, int guests, AppDbContext db, IAvailabilityService availability, IReservationDurationPolicy durationPolicy) =>
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
            var horizonDays = (await LoadSettingsAsync(db)).BookingHorizonDays;
            var days = new List<CalendarDay>();
            for (var date = first; date.Month == first.Month; date = date.AddDays(1))
            {
                var status = "closed";
                if (today is not null && date >= today && date <= today.Value.AddDays(horizonDays))
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
        }).RequireRateLimiting(ReadRateLimitPolicy);

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
                    p.Slots.Select(s => new AvailabilityTime(FormatTime(s.Time), s.FreeTables.Count > 0,
                        s.FreeTables.Count > 0 && s.FreeTables.All(t => t.Kind == FreeTable.CombinationKind))).ToList()))
                .ToList()));
        }).RequireRateLimiting(ReadRateLimitPolicy);

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
            var freeTableIds = slot?.FreeTables.Where(t => t.Kind == FreeTable.TableKind).Select(t => t.Id).ToHashSet() ?? [];

            var areas = await db.Areas.Where(a => a.OnlineBookingEnabled && a.ArchivedAtUtc == null).OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync();
            var tables = (await db.Tables.Where(t => t.ArchivedAtUtc == null).ToListAsync())
                .OrderBy(t => t.Number.Length).ThenBy(t => t.Number, StringComparer.Ordinal)
                .ToList();
            var elements = await db.RoomElements.OrderBy(e => e.SortOrder).ToListAsync();
            return Results.Ok(areas.Select(area => new PublicArea(
                area.Id,
                area.Name,
                AreaEndpoints.FloorPlanUrl(area),
                area.Description,
                AreaEndpoints.PhotoUrl(area),
                area.TableScale,
                tables
                    .Where(t => t.AreaId == area.Id)
                    .Select(t => new PublicTable(t.Id, t.Number, t.Seats, t.MinGuests, t.PosX, t.PosY, t.Shape, t.Rotation, freeTableIds.Contains(t.Id)))
                    .ToList(),
                area.RoomStyle,
                elements.Where(e => e.AreaId == area.Id).Select(AreaEndpoints.ToResponse).ToList(),
                area.WidthMeters))
                .ToList());
        }).RequireRateLimiting(ReadRateLimitPolicy);

        group.MapPost("/reservations", async (BookingRequest request, [FromHeader(Name = IdempotencyKeyHeader)] string? idempotencyKey, ITenantContext tenantContext,
            AppDbContext db, IAvailabilityService availability, IReservationDurationPolicy durationPolicy, TimeProvider timeProvider, CancellationToken cancellationToken) =>
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
            if (!StaffReservationEndpoints.TryParseOccasion(request.Occasion, out var occasion))
            {
                return Error("invalid_occasion");
            }
            idempotencyKey = string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey.Trim();
            if (idempotencyKey?.Length > Reservation.MaxIdempotencyKeyLength)
            {
                return Error("invalid_idempotency_key");
            }

            var settings = await LoadSettingsAsync(db);
            var guestChooses = settings.TableSelectionMode == TableSelectionMode.GuestChooses;
            var duration = await durationPolicy.GetDurationAsync(request.Guests, cancellationToken);

            // Check and insert in one transaction (SQLite: BEGIN IMMEDIATE), so two bookings of the last table cannot both succeed,
            // nor two bookings with the same idempotency key.
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var now = timeProvider.GetUtcNow().UtcDateTime;
            await DeleteExpiredHoldsAsync(db, now, cancellationToken);

            // A repeated booking (e.g. after a lost answer) gets the reservation of the first one, with a new token for its link,
            // as only the hash of the first one is stored.
            if (idempotencyKey is not null)
            {
                var since = now - ReservationRules.IdempotencyKeyLifetime;
                var booked = await db.Reservations.Include(r => r.Tables)
                    .Where(r => r.IdempotencyKey == idempotencyKey && r.Source == ReservationSource.Online && r.CreatedAtUtc > since)
                    .OrderByDescending(r => r.CreatedAtUtc)
                    .FirstOrDefaultAsync(cancellationToken);
                if (booked is not null)
                {
                    var newToken = ManageToken.Create();
                    booked.ManageTokenHash = newToken.Hash;
                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    var bookedTableIds = booked.Tables.Select(t => t.TableId).ToList();
                    var bookedTables = StaffReservationEndpoints.InNumberOrder(await db.Tables.Where(t => bookedTableIds.Contains(t.Id)).ToListAsync(cancellationToken));
                    var bookedArea = await db.Areas.Where(a => a.Id == bookedTables[0].AreaId).Select(a => a.Name).SingleAsync(cancellationToken);
                    return Results.Json(
                        new BookingResponse(booked.ReferenceCode, booked.Status, DateOnly.FromDateTime(booked.StartLocal), FormatTime(TimeOnly.FromDateTime(booked.StartLocal)),
                            booked.PartySize, booked.DurationMinutes, bookedArea, AvailabilityService.CombinedLabel(bookedTables), bookedTables.Select(t => t.Id).ToList(),
                            bookedTables.Select(t => t.Number).ToList(), newToken.Token),
                        statusCode: StatusCodes.Status201Created);
                }
            }

            // The guest's hold of this date, time, party and table: its tables are booked, and it does not stand in the way itself.
            ReservationHold? hold = null;
            if (request.HoldToken is not null)
            {
                var holdHash = ManageToken.Hash(request.HoldToken);
                hold = await db.ReservationHolds.SingleOrDefaultAsync(h => h.TokenHash == holdHash && h.ExpiresAtUtc > now, cancellationToken);
                var sameTable = !guestChooses || (request.TableId is { } chosen ? hold?.TableIds is [var held] && held == chosen : hold?.TableIds.Count > 1);
                if (hold is not null && (hold.StartLocal != date.ToDateTime(time) || hold.PartySize != request.Guests || !sameTable))
                {
                    hold = null;
                }
            }
            var check = await availability.CheckAsync(date, time, request.Guests, duration, ReservationSource.Online,
                hold?.TableIds ?? (guestChooses && request.TableId is { } tableId ? [tableId] : null), ignoreHoldId: hold?.Id, cancellationToken: cancellationToken);
            // Where the guest chooses, the system only assigns when no single table is free for the party, only a combination.
            if (guestChooses && request.TableId is null && check.Table?.Kind != FreeTable.CombinationKind)
            {
                return Error("table_required");
            }
            if (check.Table is not { } table)
            {
                return CheckError(check.Error!);
            }

            var manageToken = ManageToken.Create();
            var reservation = new Reservation
            {
                TableId = table.TableIds[0],
                Tables = table.TableIds.Select(id => new ReservationTable { TableId = id }).ToList(),
                StartLocal = date.ToDateTime(time),
                EndLocal = date.ToDateTime(time).AddMinutes(duration),
                DurationMinutes = duration,
                PartySize = request.Guests,
                GuestName = guest.Name,
                GuestPhone = guest.Phone,
                GuestEmail = guest.Email,
                Notes = guest.Notes,
                Occasion = occasion ?? Occasion.None,
                Status = settings.ConfirmationMode == ConfirmationMode.Request ? ReservationStatus.Requested : ReservationStatus.Confirmed,
                WasRequested = settings.ConfirmationMode == ConfirmationMode.Request,
                Source = ReservationSource.Online,
                ReferenceCode = await ReferenceCode.GenerateUniqueAsync(db, cancellationToken),
                Language = request.Language,
                ManageTokenHash = manageToken.Hash,
                IdempotencyKey = idempotencyKey,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
            };
            if (hold is not null)
            {
                db.ReservationHolds.Remove(hold);
            }
            var countryCode = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.CountryCode).SingleAsync(cancellationToken);
            await GuestProfiles.LinkAsync(db, reservation, countryCode, now, cancellationToken);
            db.Reservations.Add(reservation);
            ReservationHistory.Record(db, reservation, ReservationEventKind.Created, ReservationEditor.Guest, now);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            var tables = StaffReservationEndpoints.InNumberOrder(await db.Tables.Where(t => table.TableIds.Contains(t.Id)).ToListAsync(cancellationToken));
            return Results.Json(
                new BookingResponse(reservation.ReferenceCode, reservation.Status, date, FormatTime(time), reservation.PartySize, duration, table.AreaName,
                    table.Number, tables.Select(t => t.Id).ToList(), tables.Select(t => t.Number).ToList(), manageToken.Token),
                statusCode: StatusCodes.Status201Created);
        }).RequireRateLimiting(BookingRateLimitPolicy);

        // Holds the table (or the one the system assigns) for the guest while they enter their contact details: checked like the
        // booking and stored in the same transaction, so of two guests holding the last table only one gets it.
        group.MapPost("/holds", async (HoldRequest request, HttpContext httpContext, AppDbContext db, IAvailabilityService availability,
            IReservationDurationPolicy durationPolicy, IConfiguration configuration, TimeProvider timeProvider, CancellationToken cancellationToken) =>
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

            var guestChooses = (await LoadSettingsAsync(db)).TableSelectionMode == TableSelectionMode.GuestChooses;
            var duration = await durationPolicy.GetDurationAsync(request.Guests, cancellationToken);
            var clientIp = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var now = timeProvider.GetUtcNow().UtcDateTime;
            await DeleteExpiredHoldsAsync(db, now, cancellationToken);
            // Across all restaurants, so one client cannot hold the tables of many.
            var activeHolds = await db.ReservationHolds.IgnoreQueryFilters().CountAsync(h => h.ClientIp == clientIp && h.ExpiresAtUtc > now, cancellationToken);
            if (activeHolds >= configuration.GetValue(HoldLimitSetting, DefaultHoldLimit))
            {
                return ErrorResponse.Result("too_many_holds", StatusCodes.Status429TooManyRequests);
            }

            var check = await availability.CheckAsync(date, time, request.Guests, duration, ReservationSource.Online,
                guestChooses && request.TableId is { } tableId ? [tableId] : null, cancellationToken: cancellationToken);
            if (guestChooses && request.TableId is null && check.Table?.Kind != FreeTable.CombinationKind)
            {
                return Error("table_required");
            }
            if (check.Table is not { } table)
            {
                return CheckError(check.Error!);
            }

            var token = ManageToken.Create();
            var hold = new ReservationHold
            {
                TableIds = table.TableIds.ToList(),
                StartLocal = date.ToDateTime(time),
                EndLocal = date.ToDateTime(time).AddMinutes(duration),
                PartySize = request.Guests,
                TokenHash = token.Hash,
                ClientIp = clientIp,
                CreatedAtUtc = now,
                ExpiresAtUtc = now + ReservationRules.HoldDuration,
            };
            db.ReservationHolds.Add(hold);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Json(new HoldResponse(token.Token, hold.ExpiresAtUtc, table.Number, table.AreaName), statusCode: StatusCodes.Status201Created);
        }).RequireRateLimiting(ReadRateLimitPolicy);

        // Releases the hold, e.g. when the guest closes the dialog; 404 for an unknown or expired one.
        group.MapDelete("/holds/{token}", async (string token, AppDbContext db, TimeProvider timeProvider, CancellationToken cancellationToken) =>
        {
            var now = timeProvider.GetUtcNow().UtcDateTime;
            var hash = ManageToken.Hash(token);
            var deleted = await db.ReservationHolds.Where(h => h.TokenHash == hash && h.ExpiresAtUtc > now).ExecuteDeleteAsync(cancellationToken);
            await DeleteExpiredHoldsAsync(db, now, cancellationToken);
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        }).RequireRateLimiting(ReadRateLimitPolicy);

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

        group.MapPost("/reservations/{referenceCode}/cancel", async (string referenceCode, CancelRequest request, AppDbContext db, IAvailabilityService availability,
            TimeProvider timeProvider) =>
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

            var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
            // Saved together with the cancellation.
            ReservationHistory.Record(db, reservation, ReservationEventKind.CancelledByGuest, ReservationEditor.Guest, nowUtc,
                ReservationHistory.StatusChange(reservation.Status, ReservationStatus.Cancelled));
            reservation.Status = ReservationStatus.Cancelled;
            reservation.CancelledByGuest = true;
            reservation.UpdatedAtUtc = nowUtc;
            await db.SaveChangesAsync();
            return Results.Ok(await ToGuestResponseAsync(db, availability, reservation));
        }).RequireRateLimiting(ManageRateLimitPolicy);
    }

    /// <summary>
    /// The endpoint filter of the routes under <c>/api/public/restaurants/{slug}</c>: sets the restaurant of the slug as the
    /// tenant of the request; unknown and deactivated restaurants are both "not found" for guests.
    /// </summary>
    internal static async ValueTask<object?> RestaurantFromSlug(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var services = context.HttpContext.RequestServices;
        var slug = context.HttpContext.GetRouteValue("slug") as string;
        var tenantId = await services.GetRequiredService<AppDbContext>().Tenants
            .Where(t => t.Slug == slug && t.IsActive)
            .Select(t => (Guid?)t.Id)
            .SingleOrDefaultAsync();
        if (tenantId is null)
        {
            return Results.NotFound();
        }
        services.GetRequiredService<TenantScope>().TenantId = tenantId;
        return await next(context);
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

    /// <summary>The guest's view of the reservation, with its table and area also when they are archived.</summary>
    private static async Task<GuestReservationResponse> ToGuestResponseAsync(AppDbContext db, IAvailabilityService availability, Reservation reservation)
    {
        var tableIds = await db.ReservationTables.Where(t => t.ReservationId == reservation.Id).Select(t => t.TableId).ToListAsync();
        var tables = StaffReservationEndpoints.InNumberOrder(await db.Tables.Where(t => tableIds.Contains(t.Id)).ToListAsync());
        var area = await db.Areas.SingleAsync(a => a.Id == tables[0].AreaId);
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
            AvailabilityService.CombinedLabel(tables),
            tables.Select(t => t.Id).ToList(),
            tables.Select(t => t.Number).ToList(),
            reservation.GuestName,
            reservation.CancelledByGuest,
            now is not null && ReservationRules.CanGuestCancel(reservation, now.Value));
    }

    /// <summary>Deletes the expired holds of the current restaurant; they are ignored everywhere already.</summary>
    private static Task<int> DeleteExpiredHoldsAsync(AppDbContext db, DateTime nowUtc, CancellationToken cancellationToken) =>
        db.ReservationHolds.Where(h => h.ExpiresAtUtc <= nowUtc).ExecuteDeleteAsync(cancellationToken);

    private static async Task<ReservationSettings> LoadSettingsAsync(AppDbContext db) =>
        await db.ReservationSettings.AsNoTracking().SingleOrDefaultAsync() ?? new ReservationSettings();

    private static IResult Error(string error) => ErrorResponse.Result(error, StatusCodes.Status400BadRequest);

    /// <summary>A failed <see cref="IAvailabilityService.CheckAsync"/>: 409 when the time or table is taken, otherwise 400.</summary>
    private static IResult CheckError(string error) =>
        ErrorResponse.Result(error, error is "slot_unavailable" or "table_unavailable" ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest);
}
