using Cbplayground.Api.Data;

namespace Cbplayground.Api.Reservations;

/// <summary>
/// The fixed rules of reservations, in one place so a change stays small. The rules a restaurant sets itself (lead time,
/// booking horizon, buffer, largest online party) are in <see cref="ReservationSettings"/>, with their defaults.
/// </summary>
public static class ReservationRules
{
    /// <summary>Reservations start on a grid of quarter hours (:00, :15, :30, :45).</summary>
    public const int SlotMinutes = 15;

    /// <summary>
    /// True: a reservation has to end by the end of its opening window (last start = end of the window − duration).
    /// False: it only has to start before the end of the window. Default still to be confirmed by the CEO.
    /// </summary>
    public const bool MustEndByClosingTime = true;

    /// <summary>
    /// True: a request (request mode) blocks its table until the restaurant confirms or declines it.
    /// Default still to be confirmed by the CEO.
    /// </summary>
    public const bool RequestsBlockTables = true;

    /// <summary>The statuses in which a reservation occupies its table.</summary>
    public static readonly ReservationStatus[] BlockingStatuses = RequestsBlockTables
        ? [ReservationStatus.Requested, ReservationStatus.Confirmed, ReservationStatus.Arrived, ReservationStatus.Late]
        : [ReservationStatus.Confirmed, ReservationStatus.Arrived, ReservationStatus.Late];

    /// <summary>The status changes staff may make; every other change is refused.</summary>
    public static readonly IReadOnlyDictionary<ReservationStatus, ReservationStatus[]> AllowedTransitions = new Dictionary<ReservationStatus, ReservationStatus[]>
    {
        [ReservationStatus.Requested] = [ReservationStatus.Confirmed, ReservationStatus.Declined],
        [ReservationStatus.Confirmed] = [ReservationStatus.Arrived, ReservationStatus.Late, ReservationStatus.Cancelled],
        [ReservationStatus.Late] = [ReservationStatus.Arrived, ReservationStatus.Cancelled],
        // Undo of an "arrived" set by mistake.
        [ReservationStatus.Arrived] = [ReservationStatus.Confirmed],
    };

    /// <summary>The languages of the user interface; a reservation stores the guest's one.</summary>
    public static readonly string[] Languages = ["en", "de", "sr-Latn", "sr-Cyrl"];

    public static bool IsTransitionAllowed(ReservationStatus from, ReservationStatus to) =>
        AllowedTransitions.TryGetValue(from, out var targets) && targets.Contains(to);
}
