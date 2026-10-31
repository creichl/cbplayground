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
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public ConfirmationMode ConfirmationMode { get; set; } = ConfirmationMode.Instant;

    public TableSelectionMode TableSelectionMode { get; set; } = TableSelectionMode.SystemAssigns;

    /// <summary>Duration of a reservation when no <see cref="DurationRule"/> matches its party size.</summary>
    public int DefaultDurationMinutes { get; set; } = 120;
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
