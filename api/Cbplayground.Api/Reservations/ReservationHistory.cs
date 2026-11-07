using System.Globalization;
using System.Security.Claims;
using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>Who changes a reservation, as the history stores it.</summary>
public record ReservationEditor(ReservationActor Actor, string? UserId, string? DisplayName)
{
    public static readonly ReservationEditor Guest = new(ReservationActor.Guest, null, null);

    public static readonly ReservationEditor System = new(ReservationActor.System, null, null);

    /// <summary>The signed-in staff user, with their display name of now.</summary>
    public static async Task<ReservationEditor> StaffAsync(ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken = default)
    {
        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
        var displayName = await db.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).SingleOrDefaultAsync(cancellationToken);
        return new ReservationEditor(ReservationActor.Staff, userId, displayName);
    }
}

/// <summary>
/// Writes the history of the reservations (<see cref="ReservationEvent"/>). The callers add the event before they save the
/// change, so both are written in the same transaction.
/// </summary>
public static class ReservationHistory
{
    /// <summary>The values of the recorded fields, as <see cref="ReservationChange"/> stores them.</summary>
    public static Dictionary<ReservationField, string?> Snapshot(Reservation reservation, string tableNumber) => new()
    {
        [ReservationField.Date] = reservation.StartLocal.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        [ReservationField.Time] = reservation.StartLocal.ToString("HH:mm", CultureInfo.InvariantCulture),
        [ReservationField.PartySize] = reservation.PartySize.ToString(CultureInfo.InvariantCulture),
        [ReservationField.Table] = tableNumber,
        [ReservationField.Duration] = reservation.DurationMinutes.ToString(CultureInfo.InvariantCulture),
        [ReservationField.Name] = reservation.GuestName,
        [ReservationField.Phone] = reservation.GuestPhone,
        [ReservationField.Email] = reservation.GuestEmail,
        [ReservationField.Notes] = reservation.Notes,
        [ReservationField.Occasion] = reservation.Occasion == Occasion.None ? null : reservation.Occasion.ToString(),
        [ReservationField.Status] = reservation.Status.ToString(),
    };

    /// <summary>The fields whose value differs between the two snapshots, in the order of <see cref="ReservationField"/>.</summary>
    public static List<ReservationChange> Changes(Dictionary<ReservationField, string?> before, Dictionary<ReservationField, string?> after) =>
        Enum.GetValues<ReservationField>()
            .Where(field => before[field] != after[field])
            .Select(field => new ReservationChange { Field = field, From = before[field], To = after[field] })
            .ToList();

    /// <summary>The change of the status from <paramref name="from"/> to <paramref name="to"/>.</summary>
    public static List<ReservationChange> StatusChange(ReservationStatus from, ReservationStatus to) =>
        [new ReservationChange { Field = ReservationField.Status, From = from.ToString(), To = to.ToString() }];

    /// <summary>Adds the event to the context (not saved yet). The reservation must have its id, i.e. be added or loaded.</summary>
    public static void Record(AppDbContext db, Reservation reservation, ReservationEventKind kind, ReservationEditor editor, DateTime atUtc,
        List<ReservationChange>? changes = null)
    {
        db.ReservationEvents.Add(new ReservationEvent
        {
            ReservationId = reservation.Id,
            AtUtc = atUtc,
            Actor = editor.Actor,
            UserId = editor.UserId,
            UserDisplayName = editor.DisplayName,
            Kind = kind,
            Changes = changes ?? [],
        });
    }
}
