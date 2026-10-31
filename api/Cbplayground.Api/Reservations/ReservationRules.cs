using Cbplayground.Api.Data;

namespace Cbplayground.Api.Reservations;

/// <summary>The fixed rules of reservations, in one place so a change stays small.</summary>
public static class ReservationRules
{
    /// <summary>Reservations start on a grid of quarter hours (:00, :15, :30, :45).</summary>
    public const int SlotMinutes = 15;

    /// <summary>Guests can book online at most this many days ahead (today plus 90 days). Staff have no limit.</summary>
    public const int MaxOnlineDaysAhead = 90;

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

    /// <summary>
    /// How long before its start a guest can still cancel a reservation through the link; zero: until the start.
    /// Default still to be confirmed by the CEO.
    /// </summary>
    public static readonly TimeSpan GuestCancellationDeadlineBeforeStart = TimeSpan.Zero;

    /// <summary>The statuses from which the guest can cancel through the link.</summary>
    public static readonly ReservationStatus[] GuestCancellableStatuses =
        [ReservationStatus.Requested, ReservationStatus.Confirmed, ReservationStatus.Late];

    /// <summary>Whether the guest can still cancel the reservation; <paramref name="localNow"/> is the restaurant's local time.</summary>
    public static bool CanGuestCancel(Reservation reservation, DateTime localNow) =>
        GuestCancellableStatuses.Contains(reservation.Status)
        && localNow < reservation.StartLocal - GuestCancellationDeadlineBeforeStart;

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
