namespace Cbplayground.Api.Data;

/// <summary>
/// Tables of one area that the restaurant pushes together for a larger group, e.g. tables 4 + 5 for 8 people. The system only
/// gives a combination when no single table fits the party (<see cref="Reservations.AvailabilityService"/>); a reservation on it
/// occupies all its tables (<see cref="ReservationTable"/>).
/// </summary>
public class TableCombination : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid AreaId { get; set; }

    /// <summary>Guests at the pushed-together tables; at least the seats of its largest table + 1. Default: the sum of its tables' seats.</summary>
    public int Seats { get; set; }

    /// <summary>The smallest party it is given to online, 1 to <see cref="Seats"/>. Default: the seats of its largest table + 1.</summary>
    public int MinGuests { get; set; }

    /// <summary>False: only staff can give it, e.g. for a phone reservation.</summary>
    public bool OnlineBookable { get; set; } = true;

    /// <summary>Its tables, at least 2, all of <see cref="AreaId"/>.</summary>
    public List<TableCombinationTable> Tables { get; set; } = [];
}

/// <summary>A table of a <see cref="TableCombination"/>.</summary>
public class TableCombinationTable : ITenantOwned
{
    public Guid TenantId { get; set; }

    public Guid CombinationId { get; set; }

    public Guid TableId { get; set; }
}

/// <summary>
/// A table of a <see cref="Reservation"/>: one for a single table, all tables of the combination for a combined one. The first
/// table (in number order) is also <see cref="Reservation.TableId"/>.
/// </summary>
public class ReservationTable : ITenantOwned
{
    public Guid TenantId { get; set; }

    public Guid ReservationId { get; set; }

    public Guid TableId { get; set; }
}
