using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>The status of a reservation. Which ones block the table: <see cref="Reservations.ReservationRules.BlockingStatuses"/>.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ReservationStatus>))]
public enum ReservationStatus
{
    /// <summary>Booked online in the request mode; waits for the restaurant's approval.</summary>
    Requested,
    Confirmed,
    Arrived,
    Late,
    Cancelled,

    /// <summary>A request the restaurant did not approve.</summary>
    Declined,
}

/// <summary>Who entered the reservation.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ReservationSource>))]
public enum ReservationSource
{
    /// <summary>The guest, on the booking page.</summary>
    Online,

    /// <summary>A Tenant Admin or Front desk user on the guest's behalf, e.g. for a phone reservation.</summary>
    Staff,
}

/// <summary>A table reservation. Times are local times of the restaurant (<see cref="Tenant.TimeZoneId"/>), like the opening hours.</summary>
public class Reservation : ITenantOwned
{
    public const int MaxNameLength = 100;
    public const int MaxPhoneLength = 30;
    public const int MaxEmailLength = 254;
    public const int MaxNotesLength = 500;
    public const int ReferenceCodeLength = 6;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid TableId { get; set; }

    /// <summary>Start in the restaurant's local time. DateTime instead of DateTimeOffset, so SQLite can sort and compare it.</summary>
    public DateTime StartLocal { get; set; }

    /// <summary><see cref="StartLocal"/> plus <see cref="DurationMinutes"/>.</summary>
    public DateTime EndLocal { get; set; }

    public int DurationMinutes { get; set; }

    public int PartySize { get; set; }

    public required string GuestName { get; set; }

    public string? GuestPhone { get; set; }

    public string? GuestEmail { get; set; }

    public string? Notes { get; set; }

    public ReservationStatus Status { get; set; }

    public ReservationSource Source { get; set; }

    /// <summary>Short code the guest can read out on the phone, e.g. "K7MX3P". Unique across all restaurants.</summary>
    public required string ReferenceCode { get; set; }

    /// <summary>The guest's language (e.g. "de", "sr-Latn"), for the emails to the guest.</summary>
    public required string Language { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
}
