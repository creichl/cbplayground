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

    /// <summary>
    /// How long before its start a guest can still cancel a reservation through the link; zero: until the start.
    /// Default still to be confirmed by the CEO.
    /// </summary>
    public static readonly TimeSpan GuestCancellationDeadlineBeforeStart = TimeSpan.Zero;

    /// <summary>How long the online booking holds a table for the guest while they enter their contact details (<see cref="ReservationHold"/>).</summary>
    public static readonly TimeSpan HoldDuration = TimeSpan.FromMinutes(5);

    /// <summary>How long a repeated online booking with the same <c>Idempotency-Key</c> returns the reservation of the first one.</summary>
    public static readonly TimeSpan IdempotencyKeyLifetime = TimeSpan.FromHours(24);

    /// <summary>The statuses from which the guest can cancel through the link.</summary>
    public static readonly ReservationStatus[] GuestCancellableStatuses =
        [ReservationStatus.Requested, ReservationStatus.Confirmed, ReservationStatus.Late];

    /// <summary>Whether the guest can still cancel the reservation; <paramref name="localNow"/> is the restaurant's local time.</summary>
    public static bool CanGuestCancel(Reservation reservation, DateTime localNow) =>
        GuestCancellableStatuses.Contains(reservation.Status)
        && localNow < reservation.StartLocal - GuestCancellationDeadlineBeforeStart;

    /// <summary>The statuses from which the guest can change the day, time and party size through the link.</summary>
    public static readonly ReservationStatus[] GuestChangeableStatuses = [ReservationStatus.Requested, ReservationStatus.Confirmed];

    /// <summary>
    /// Whether the guest can still change the reservation: from <see cref="GuestChangeableStatuses"/>, until the deadline of
    /// the cancellation (<see cref="GuestCancellationDeadlineBeforeStart"/>); <paramref name="localNow"/> is the restaurant's local time.
    /// </summary>
    public static bool CanGuestChange(Reservation reservation, DateTime localNow) =>
        GuestChangeableStatuses.Contains(reservation.Status)
        && localNow < reservation.StartLocal - GuestCancellationDeadlineBeforeStart;

    /// <summary>The statuses in which a reservation occupies its table.</summary>
    public static readonly ReservationStatus[] BlockingStatuses = RequestsBlockTables
        ? [ReservationStatus.Requested, ReservationStatus.Confirmed, ReservationStatus.Arrived, ReservationStatus.Late]
        : [ReservationStatus.Confirmed, ReservationStatus.Arrived, ReservationStatus.Late];

    /// <summary>
    /// The status changes staff may make; every other change is refused. Some depend on the reservation
    /// (<see cref="IsTransitionAllowed"/>), a change back to a status that occupies the table (e.g. the undo of a cancellation)
    /// also needs the table to be free (<see cref="NeedsFreeTable"/>), and some changes are only possible at certain times
    /// (<see cref="IsAllowedNow"/>).
    /// </summary>
    public static readonly IReadOnlyDictionary<ReservationStatus, ReservationStatus[]> AllowedTransitions = new Dictionary<ReservationStatus, ReservationStatus[]>
    {
        [ReservationStatus.Requested] = [ReservationStatus.Confirmed, ReservationStatus.Declined],
        // Requested: undo of accepting a request, only for a reservation that was one (Reservation.WasRequested).
        [ReservationStatus.Confirmed] = [ReservationStatus.Arrived, ReservationStatus.Late, ReservationStatus.NoShow, ReservationStatus.Cancelled, ReservationStatus.Requested],
        // Confirmed: undo of a "late" set by mistake.
        [ReservationStatus.Late] = [ReservationStatus.Arrived, ReservationStatus.NoShow, ReservationStatus.Cancelled, ReservationStatus.Confirmed],
        // Confirmed: undo of an "arrived" set by mistake; not for a walk-in, which was never expected: its undo deletes it.
        [ReservationStatus.Arrived] = [ReservationStatus.Completed, ReservationStatus.Confirmed],
        // The undos of "guest left", "no-show", "cancelled" and "declined". Late: the undo of a no-show or cancellation of a late
        // guest, which the front desk sends when the reservation was late before; "late" is only possible on the reservation's day
        // (IsAllowedNow).
        [ReservationStatus.Completed] = [ReservationStatus.Arrived],
        [ReservationStatus.NoShow] = [ReservationStatus.Confirmed, ReservationStatus.Late],
        [ReservationStatus.Cancelled] = [ReservationStatus.Confirmed, ReservationStatus.Late],
        [ReservationStatus.Declined] = [ReservationStatus.Requested],
    };

    /// <summary>
    /// The statuses of a closed reservation: only the guest's name, contact details, notes and language can still be changed,
    /// not its date, time, party size, table or duration.
    /// </summary>
    public static readonly ReservationStatus[] ClosedStatuses =
        [ReservationStatus.Cancelled, ReservationStatus.Declined, ReservationStatus.NoShow, ReservationStatus.Completed];

    /// <summary>The languages of the user interface; a reservation stores the guest's one.</summary>
    public static readonly string[] Languages = ["en", "de", "sr-Latn", "sr-Cyrl"];

    /// <summary>
    /// Whether staff may change the reservation's status to <paramref name="to"/>: <see cref="AllowedTransitions"/>, except
    /// back to "requested" for a reservation that was never a request, and back to "confirmed" for an arrived walk-in.
    /// </summary>
    public static bool IsTransitionAllowed(Reservation reservation, ReservationStatus to) =>
        AllowedTransitions.TryGetValue(reservation.Status, out var targets) && targets.Contains(to)
        && !(reservation.Status == ReservationStatus.Confirmed && to == ReservationStatus.Requested && !reservation.WasRequested)
        && !(reservation.Status == ReservationStatus.Arrived && to == ReservationStatus.Confirmed && reservation.Source == ReservationSource.WalkIn);

    /// <summary>
    /// Whether the change makes the reservation occupy its table again (or longer, from <see cref="ReservationStatus.Completed"/>),
    /// so its table has to be free from its start to its end.
    /// </summary>
    public static bool NeedsFreeTable(ReservationStatus from, ReservationStatus to) =>
        (!BlockingStatuses.Contains(from) || from == ReservationStatus.Completed) && BlockingStatuses.Contains(to);

    /// <summary>
    /// Whether the change is possible at <paramref name="nowLocal"/>: "arrived" and "late" only on the day of the reservation,
    /// "no-show" only from its start, and the undo of a cancellation only until its end. The reservation's times and
    /// <paramref name="nowLocal"/> are in the restaurant's local time.
    /// </summary>
    public static bool IsAllowedNow(Reservation reservation, ReservationStatus to, DateTime nowLocal) =>
        !(reservation.Status == ReservationStatus.Cancelled && reservation.EndLocal <= nowLocal)
        && to switch
        {
            ReservationStatus.Arrived or ReservationStatus.Late => reservation.StartLocal.Date == nowLocal.Date,
            ReservationStatus.NoShow => reservation.StartLocal <= nowLocal,
            _ => true,
        };
}
