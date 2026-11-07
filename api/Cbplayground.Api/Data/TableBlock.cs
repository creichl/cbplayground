namespace Cbplayground.Api.Data;

/// <summary>
/// A table the front desk takes out of service for a time of one day, e.g. table 7 from 18:00 to 20:00 because it wobbles or is
/// kept for the owner. While it lasts, nobody can book the table, online, by phone or as a walk-in, nor a combination with it
/// (<see cref="Reservations.AvailabilityService"/>); it adds no buffer. Deleting the table deletes its blocks.
/// </summary>
public class TableBlock : ITenantOwned
{
    public const int MaxReasonLength = 100;

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid TableId { get; set; }

    /// <summary>Start in the restaurant's local time, on a quarter hour.</summary>
    public DateTime StartLocal { get; set; }

    /// <summary>
    /// End in the restaurant's local time, on a quarter hour, after <see cref="StartLocal"/> and on the same day; midnight of the next
    /// day for "24:00".
    /// </summary>
    public DateTime EndLocal { get; set; }

    /// <summary>Why the table is blocked, e.g. "wobbly, being repaired"; null without a reason.</summary>
    public string? Reason { get; set; }

    /// <summary>The staff user who created the block (<see cref="ApplicationUser"/>).</summary>
    public string? CreatedByUserId { get; set; }

    /// <summary>The staff user's display name at the time, so the block keeps it when the name changes.</summary>
    public string? CreatedByDisplayName { get; set; }

    public DateTime CreatedAtUtc { get; set; }
}
