using System.Text.Json.Serialization;

namespace Cbplayground.Api.Data;

/// <summary>How a new reservation is confirmed.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ConfirmationMode>))]
public enum ConfirmationMode
{
    /// <summary>The reservation is confirmed right away.</summary>
    Instant,

    /// <summary>The reservation is a request that the restaurant has to approve.</summary>
    Request,
}

/// <summary>Who picks the table of a reservation.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<TableSelectionMode>))]
public enum TableSelectionMode
{
    GuestChooses,
    SystemAssigns,
}

/// <summary>
/// The reservation settings of one restaurant (1:1 to the tenant). A restaurant without a stored row
/// uses the defaults of a new instance.
/// </summary>
public class ReservationSettings : ITenantOwned
{
    /// <summary>Default of <see cref="MinLeadTimeMinutes"/>. Still to be confirmed by the CEO; a change only needs this value.</summary>
    public const int DefaultMinLeadTimeMinutes = 60;

    /// <summary>Default of <see cref="BookingHorizonDays"/>.</summary>
    public const int DefaultBookingHorizonDays = 90;

    /// <summary>Default of <see cref="BufferMinutes"/>.</summary>
    public const int DefaultBufferMinutes = 0;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public ConfirmationMode ConfirmationMode { get; set; } = ConfirmationMode.Instant;

    public TableSelectionMode TableSelectionMode { get; set; } = TableSelectionMode.SystemAssigns;

    /// <summary>Duration of a reservation when no <see cref="DurationRule"/> matches its party size.</summary>
    public int DefaultDurationMinutes { get; set; } = 120;

    /// <summary>Online, a reservation has to start at least this many minutes from now. Staff are not bound to it.</summary>
    public int MinLeadTimeMinutes { get; set; } = DefaultMinLeadTimeMinutes;

    /// <summary>Online, a reservation can start at most this many days after today. Staff are not bound to it.</summary>
    public int BookingHorizonDays { get; set; } = DefaultBookingHorizonDays;

    /// <summary>After every reservation its table stays occupied for this many minutes, for every channel.</summary>
    public int BufferMinutes { get; set; } = DefaultBufferMinutes;

    /// <summary>The largest party that can book online; null: the seats of the largest table that can be booked online.</summary>
    public int? MaxOnlinePartySize { get; set; }
}

/// <summary>Duration of a reservation for a range of party sizes, e.g. 1–2 guests 90 minutes. The ranges of a restaurant do not overlap.</summary>
public class DurationRule : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public int MinGuests { get; set; }

    public int MaxGuests { get; set; }

    public int DurationMinutes { get; set; }
}
