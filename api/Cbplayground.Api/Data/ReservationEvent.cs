using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>Who made a change to a reservation.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ReservationActor>))]
public enum ReservationActor
{
    /// <summary>The guest, on the booking page or through the link of their booking.</summary>
    Guest,

    /// <summary>A Tenant Admin or Front desk user; <see cref="ReservationEvent.UserId"/> and <see cref="ReservationEvent.UserDisplayName"/> say who.</summary>
    Staff,

    /// <summary>The application itself, e.g. the demo reservations of the development seed.</summary>
    System,
}

/// <summary>What happened to a reservation.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ReservationEventKind>))]
public enum ReservationEventKind
{
    /// <summary>The reservation was entered: booked online, by the staff, as a walk-in or by the seed. Without changes.</summary>
    Created,

    /// <summary>The staff changed the booking or the guest's details (<c>PUT</c>).</summary>
    Updated,

    /// <summary>The staff set a status.</summary>
    StatusChanged,

    /// <summary>The guest cancelled through the link of their booking.</summary>
    CancelledByGuest,
}

/// <summary>A field of a reservation whose changes the history records.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ReservationField>))]
public enum ReservationField
{
    Date,
    Time,
    PartySize,
    Table,
    Duration,
    Name,
    Phone,
    Email,
    Notes,
    Status,
}

/// <summary>
/// One entry of a reservation's history: who changed what and when. Written in the same save as the change itself and
/// deleted with its reservation.
/// </summary>
public class ReservationEvent : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid ReservationId { get; set; }

    public DateTime AtUtc { get; set; }

    public ReservationActor Actor { get; set; }

    /// <summary>The staff user's id (<see cref="ApplicationUser"/>); null for the guest and the system.</summary>
    public string? UserId { get; set; }

    /// <summary>The staff user's display name at the time of the change, so the history keeps it when the name changes.</summary>
    public string? UserDisplayName { get; set; }

    public ReservationEventKind Kind { get; set; }

    /// <summary>The fields that changed, in the order of <see cref="ReservationField"/>; empty for <see cref="ReservationEventKind.Created"/>.</summary>
    public List<ReservationChange> Changes { get; set; } = [];
}

/// <summary>
/// A changed field with its old and new value as text, as the history shows them: date "yyyy-MM-dd", time "HH:mm", party size and
/// duration (minutes) as numbers, the table's number, the status's name; null for an empty value.
/// </summary>
public class ReservationChange
{
    public ReservationField Field { get; set; }

    public string? From { get; set; }

    public string? To { get; set; }
}
