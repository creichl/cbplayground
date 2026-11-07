using Cbplayground.Api.Auth;
using Cbplayground.Api.Data;
using Cbplayground.Api.Reservations;
using Microsoft.EntityFrameworkCore;
using static Cbplayground.Api.Endpoints.StaffReservationEndpoints;

namespace Cbplayground.Api.Endpoints;

/// <summary>
/// The guest profiles of the signed-in user's restaurant (<see cref="Guest"/>) for its staff; guests of other restaurants are
/// answered with 404. Only Tenant Admins delete a guest's data.
/// </summary>
public static class GuestEndpoints
{
    /// <summary>The guests per page of <c>GET /api/staff/guests</c>.</summary>
    public const int PageSize = 50;

    /// <summary>The statuses of a reservation at which the guest came: seated, or seated and left.</summary>
    private static readonly ReservationStatus[] VisitStatuses = [ReservationStatus.Arrived, ReservationStatus.Completed];

    /// <summary>The statuses of a reservation that is still to come.</summary>
    private static readonly ReservationStatus[] UpcomingStatuses = [ReservationStatus.Requested, ReservationStatus.Confirmed];

    /// <summary>The fields of a reservation's history that hold the guest's personal data.</summary>
    private static readonly ReservationField[] PersonalFields = [ReservationField.Name, ReservationField.Phone, ReservationField.Email, ReservationField.Notes];

    /// <summary>
    /// What the front desk sees of the guest at a reservation. <see cref="Visits"/>: the guest's reservations at which they came
    /// (arrived or left), this one included.
    /// </summary>
    public record GuestSummary(IReadOnlyList<GuestTag> Tags, bool HasAllergies, int Visits, int NoShows);

    /// <summary>A guest in the directory; <see cref="LastVisit"/> is null when the guest has not come yet.</summary>
    public record GuestListItem(Guid Id, string Name, string? Phone, string? Email, IReadOnlyList<GuestTag> Tags, bool HasAllergies,
        int Visits, int NoShows, DateOnly? LastVisit);

    /// <summary>A page of the directory: the guests sorted by name; <see cref="Total"/> is the number of all matching guests.</summary>
    public record GuestPage(IReadOnlyList<GuestListItem> Items, int Total, int Page, int PageSize);

    /// <summary>
    /// The guest's figures: visits (arrived or left), no-shows and cancellations; the day of the last visit and of the next
    /// reservation (requested or confirmed, from today on), null when there is none.
    /// </summary>
    public record GuestFigures(int Visits, int NoShows, int Cancellations, DateOnly? LastVisit, DateOnly? NextVisit);

    /// <summary>A guest's profile with the figures and all reservations, the newest first.</summary>
    public record GuestDetail(Guid Id, string Name, string? Phone, string? Email, string? Notes, string? AllergyNotes, IReadOnlyList<GuestTag> Tags,
        GuestFigures Figures, IReadOnlyList<ReservationResponse> Reservations, DateTime CreatedAtUtc, DateTime UpdatedAtUtc);

    /// <summary>
    /// The changed profile; every field is replaced, an empty one is removed. Errors (400): "invalid_name", "invalid_phone",
    /// "invalid_email", "invalid_notes" (more than <see cref="Guest.MaxNotesLength"/>), "invalid_allergy_notes" (more than
    /// <see cref="Guest.MaxAllergyNotesLength"/>), "invalid_tags" (a tag outside <see cref="GuestTag"/>); (409) "guest_contact_taken"
    /// (another guest of the restaurant has the phone number or email address).
    /// </summary>
    public record GuestRequest(string? Name, string? Phone, string? Email, string? Notes, string? AllergyNotes, List<string>? Tags);

    public static void MapGuestEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/staff/guests").RequireAuthorization(Policies.RequireStaff);

        // Search: part of the name or email address (case does not matter for Latin letters), or of the phone number's digits.
        group.MapGet("/", async (string? search, int? page, AppDbContext db, CancellationToken cancellationToken) =>
        {
            var pageNumber = Math.Max(page ?? 1, 1);
            var guests = db.Guests.AsQueryable();
            var text = search?.Trim() ?? "";
            if (text.Length > 0)
            {
                var pattern = $"%{EscapeLike(text)}%";
                var emailPattern = $"%{EscapeLike(text.ToLowerInvariant())}%";
                // The stored numbers have the country code instead of the national "0", so the digits are searched without it.
                var digits = new string(text.Where(char.IsAsciiDigit).ToArray()).TrimStart('0');
                var phonePattern = digits.Length >= 3 ? $"%{digits}%" : null;
                guests = guests.Where(g => EF.Functions.Like(g.Name, pattern, "\\")
                    || (g.Email != null && EF.Functions.Like(g.Email, emailPattern, "\\"))
                    || (phonePattern != null && g.Phone != null && EF.Functions.Like(g.Phone, phonePattern)));
            }

            var total = await guests.CountAsync(cancellationToken);
            var items = await guests.OrderBy(g => g.Name).ThenBy(g => g.Id)
                .Skip((pageNumber - 1) * PageSize).Take(PageSize)
                .ToListAsync(cancellationToken);
            var visits = await StatusCountsAsync(db, items.Select(g => g.Id).ToList(), cancellationToken);
            var lastVisits = await LastVisitsAsync(db, items.Select(g => g.Id).ToList(), cancellationToken);
            return Results.Ok(new GuestPage(
                items.Select(g => new GuestListItem(g.Id, g.Name, g.Phone, g.Email, g.Tags, g.AllergyNotes is not null,
                    Count(visits, g.Id, VisitStatuses), Count(visits, g.Id, [ReservationStatus.NoShow]), lastVisits.TryGetValue(g.Id, out var lastVisit) ? lastVisit : null)).ToList(),
                total,
                pageNumber,
                PageSize));
        });

        group.MapGet("/{id:guid}", async (Guid id, AppDbContext db, IAvailabilityService availability, CancellationToken cancellationToken) =>
        {
            var guest = await db.Guests.SingleOrDefaultAsync(g => g.Id == id, cancellationToken);
            return guest is null ? Results.NotFound() : Results.Ok(await ToDetailAsync(db, availability, guest, cancellationToken));
        });

        group.MapPut("/{id:guid}", async (Guid id, GuestRequest request, ITenantContext tenantContext, AppDbContext db, IAvailabilityService availability,
            CancellationToken cancellationToken) =>
        {
            var (details, error) = GuestDetails.Parse(request.Name, request.Phone, request.Email, null, contactRequired: false);
            if (details is null)
            {
                return ErrorResponse.Result(error!, StatusCodes.Status400BadRequest);
            }
            var notes = EmptyToNull(request.Notes);
            if (notes?.Length > Guest.MaxNotesLength)
            {
                return ErrorResponse.Result("invalid_notes", StatusCodes.Status400BadRequest);
            }
            var allergyNotes = EmptyToNull(request.AllergyNotes);
            if (allergyNotes?.Length > Guest.MaxAllergyNotesLength)
            {
                return ErrorResponse.Result("invalid_allergy_notes", StatusCodes.Status400BadRequest);
            }
            var tagNames = request.Tags ?? [];
            if (tagNames.Any(tag => !Enum.GetNames<GuestTag>().Contains(tag)))
            {
                return ErrorResponse.Result("invalid_tags", StatusCodes.Status400BadRequest);
            }

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var guest = await db.Guests.SingleOrDefaultAsync(g => g.Id == id, cancellationToken);
            if (guest is null)
            {
                return Results.NotFound();
            }
            var countryCode = await db.Tenants.Where(t => t.Id == tenantContext.TenantId).Select(t => t.CountryCode).SingleAsync(cancellationToken);
            var phone = GuestProfiles.NormalizePhone(details.Phone, countryCode);
            var email = GuestProfiles.NormalizeEmail(details.Email);
            if ((phone is not null && await db.Guests.AnyAsync(g => g.Id != id && g.Phone == phone, cancellationToken))
                || (email is not null && await db.Guests.AnyAsync(g => g.Id != id && g.Email == email, cancellationToken)))
            {
                return ErrorResponse.Result("guest_contact_taken", StatusCodes.Status409Conflict);
            }

            guest.Name = details.Name;
            guest.Phone = phone;
            guest.Email = email;
            guest.Notes = notes;
            guest.AllergyNotes = allergyNotes;
            // In the order of the fixed set, each once.
            guest.Tags = Enum.GetValues<GuestTag>().Where(tag => tagNames.Contains(tag.ToString())).ToList();
            guest.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(await ToDetailAsync(db, availability, guest, cancellationToken));
        });

        // On the guest's request (GDPR): the profile goes, and its reservations keep only what the restaurant needs for its figures
        // (date, time, party, table, status, occasion). Their history loses the changes of the guest's personal data, and the
        // waitlist entries the guest was seated from lose name, phone number and notes as well.
        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, CancellationToken cancellationToken) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var guest = await db.Guests.SingleOrDefaultAsync(g => g.Id == id, cancellationToken);
            if (guest is null)
            {
                return Results.NotFound();
            }

            var now = DateTime.UtcNow;
            var reservations = await db.Reservations.Where(r => r.GuestId == id).ToListAsync(cancellationToken);
            foreach (var reservation in reservations)
            {
                reservation.GuestName = Reservation.DeletedGuestName;
                reservation.GuestPhone = null;
                reservation.GuestEmail = null;
                reservation.Notes = null;
                reservation.GuestId = null;
                reservation.UpdatedAtUtc = now;
            }
            var reservationIds = reservations.Select(r => r.Id).ToList();
            // A party seated from the waitlist keeps its name, phone number and notes on its waitlist entry too.
            var waitlistEntries = await db.WaitlistEntries
                .Where(e => e.SeatedReservationId != null && reservationIds.Contains(e.SeatedReservationId.Value))
                .ToListAsync(cancellationToken);
            foreach (var entry in waitlistEntries)
            {
                entry.Name = Reservation.DeletedGuestName;
                entry.Phone = null;
                entry.Notes = null;
                entry.UpdatedAtUtc = now;
            }
            var events = await db.ReservationEvents.Where(e => reservationIds.Contains(e.ReservationId)).ToListAsync(cancellationToken);
            foreach (var reservationEvent in events)
            {
                reservationEvent.Changes.RemoveAll(change => PersonalFields.Contains(change.Field));
                // A change of nothing but the guest's details leaves nothing to show.
                if (reservationEvent.Kind == ReservationEventKind.Updated && reservationEvent.Changes.Count == 0)
                {
                    db.ReservationEvents.Remove(reservationEvent);
                }
            }
            db.Guests.Remove(guest);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.NoContent();
        }).RequireAuthorization(Policies.RequireTenantAdmin);
    }

    /// <summary>The summaries of the guests with these ids, for the reservation responses.</summary>
    internal static async Task<Dictionary<Guid, GuestSummary>> SummariesAsync(AppDbContext db, List<Guid> guestIds, CancellationToken cancellationToken = default)
    {
        if (guestIds.Count == 0)
        {
            return [];
        }
        var guests = await db.Guests.Where(g => guestIds.Contains(g.Id)).ToListAsync(cancellationToken);
        var counts = await StatusCountsAsync(db, guestIds, cancellationToken);
        return guests.ToDictionary(g => g.Id, g => new GuestSummary(g.Tags, g.AllergyNotes is not null,
            Count(counts, g.Id, VisitStatuses), Count(counts, g.Id, [ReservationStatus.NoShow])));
    }

    private static async Task<GuestDetail> ToDetailAsync(AppDbContext db, IAvailabilityService availability, Guest guest, CancellationToken cancellationToken)
    {
        var reservations = await LoadResponsesAsync(db, db.Reservations.Where(r => r.GuestId == guest.Id));
        var today = DateOnly.FromDateTime(await availability.GetLocalNowAsync(cancellationToken) ?? DateTime.UtcNow);
        var visits = reservations.Where(r => VisitStatuses.Contains(r.Status)).ToList();
        var figures = new GuestFigures(
            visits.Count,
            reservations.Count(r => r.Status == ReservationStatus.NoShow),
            reservations.Count(r => r.Status == ReservationStatus.Cancelled),
            visits.Count == 0 ? null : visits.Max(r => r.Date),
            reservations.Where(r => UpcomingStatuses.Contains(r.Status) && r.Date >= today).Select(r => (DateOnly?)r.Date).Min());
        reservations.Reverse();
        return new GuestDetail(guest.Id, guest.Name, guest.Phone, guest.Email, guest.Notes, guest.AllergyNotes, guest.Tags, figures, reservations,
            guest.CreatedAtUtc, guest.UpdatedAtUtc);
    }

    /// <summary>The number of reservations per guest and status.</summary>
    private static async Task<Dictionary<(Guid GuestId, ReservationStatus Status), int>> StatusCountsAsync(AppDbContext db, List<Guid> guestIds,
        CancellationToken cancellationToken)
    {
        var counts = await db.Reservations
            .Where(r => r.GuestId != null && guestIds.Contains(r.GuestId.Value))
            .GroupBy(r => new { GuestId = r.GuestId!.Value, r.Status })
            .Select(g => new { g.Key.GuestId, g.Key.Status, Count = g.Count() })
            .ToListAsync(cancellationToken);
        return counts.ToDictionary(c => (c.GuestId, c.Status), c => c.Count);
    }

    /// <summary>The day of each guest's last visit; guests without a visit are missing.</summary>
    private static async Task<Dictionary<Guid, DateOnly>> LastVisitsAsync(AppDbContext db, List<Guid> guestIds, CancellationToken cancellationToken)
    {
        var starts = await db.Reservations
            .Where(r => r.GuestId != null && guestIds.Contains(r.GuestId.Value) && VisitStatuses.Contains(r.Status))
            .GroupBy(r => r.GuestId!.Value)
            .Select(g => new { GuestId = g.Key, Start = g.Max(r => r.StartLocal) })
            .ToListAsync(cancellationToken);
        return starts.ToDictionary(s => s.GuestId, s => DateOnly.FromDateTime(s.Start));
    }

    private static int Count(Dictionary<(Guid GuestId, ReservationStatus Status), int> counts, Guid guestId, ReservationStatus[] statuses) =>
        statuses.Sum(status => counts.GetValueOrDefault((guestId, status)));

    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>The text for a LIKE pattern with "\" as the escape character.</summary>
    private static string EscapeLike(string text) => text.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}
