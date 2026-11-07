using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>Where a party on the waitlist stands.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<WaitlistStatus>))]
public enum WaitlistStatus
{
    /// <summary>Waits for a table.</summary>
    Waiting,

    /// <summary>Got a table: seated as a walk-in (<see cref="WaitlistEntry.SeatedReservationId"/>).</summary>
    Seated,

    /// <summary>Left without a table.</summary>
    Left,
}

/// <summary>
/// A walk-in party waiting for a table, on the waitlist of one day (today in the restaurant's time zone when it was added).
/// Times are local times of the restaurant (<see cref="Tenant.TimeZoneId"/>), like those of the reservations.
/// </summary>
public class WaitlistEntry : ITenantOwned
{
    /// <summary>The longest quoted waiting time staff can enter.</summary>
    public const int MaxQuotedWaitMinutes = 240;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>The day of the waitlist.</summary>
    public DateOnly Date { get; set; }

    /// <summary>When the party was put on the waitlist, in the restaurant's local time; the waiting time counts from it.</summary>
    public DateTime AddedAtLocal { get; set; }

    /// <summary>At most <see cref="Reservation.MaxNameLength"/> characters.</summary>
    public required string Name { get; set; }

    public string? Phone { get; set; }

    public int PartySize { get; set; }

    /// <summary>The waiting time quoted to the guests, in minutes; null when none was quoted.</summary>
    public int? QuotedWaitMinutes { get; set; }

    /// <summary>At most <see cref="Reservation.MaxNotesLength"/> characters.</summary>
    public string? Notes { get; set; }

    public WaitlistStatus Status { get; set; }

    /// <summary>The walk-in the party was seated as (status <see cref="WaitlistStatus.Seated"/>); null otherwise.</summary>
    public Guid? SeatedReservationId { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
}
