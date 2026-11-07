namespace Cbplayground.Api.Data;

/// <summary>
/// A table the online booking holds for a guest while they enter their contact details, for
/// <see cref="Reservations.ReservationRules.HoldDuration"/> from its creation. Until <see cref="ExpiresAtUtc"/> its tables are busy
/// for other online bookings and other holds, and it counts for the online quota and the pacing like an online reservation
/// (<see cref="Reservations.AvailabilityService"/>); staff bookings and walk-ins do not see it. Expired holds are ignored everywhere
/// and deleted on the next write of the restaurant's holds or online bookings.
/// </summary>
public class ReservationHold : ITenantOwned
{
    /// <summary>The longest client IP address, an IPv6 address with an IPv4 tail.</summary>
    public const int MaxClientIpLength = 45;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>The held table, or all tables of a combination, in number order.</summary>
    public List<Guid> TableIds { get; set; } = [];

    /// <summary>Start in the restaurant's local time, like <see cref="Reservation.StartLocal"/>.</summary>
    public DateTime StartLocal { get; set; }

    /// <summary><see cref="StartLocal"/> plus the duration for the party.</summary>
    public DateTime EndLocal { get; set; }

    public int PartySize { get; set; }

    /// <summary>SHA-256 of the hold token the guest's booking sends (<see cref="Reservations.ManageToken"/>); the token itself is never stored.</summary>
    public required byte[] TokenHash { get; set; }

    /// <summary>The client IP that made the hold, for the limit of active holds per client.</summary>
    public required string ClientIp { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime ExpiresAtUtc { get; set; }
}
