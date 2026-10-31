using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>
/// Reservations keep their table (the foreign key is Restrict). Before tables are deleted, their reservations that no longer
/// matter are removed: past ones and cancelled or declined ones. A reservation that occupies the table and has not ended yet
/// prevents the deletion.
/// </summary>
public static class TableDeletion
{
    /// <summary>
    /// Removes the reservations of the tables (not saved yet), or returns false when one of them occupies its table and
    /// has not ended yet. Call it in the transaction that deletes the tables.
    /// </summary>
    public static async Task<bool> TryRemoveReservationsAsync(AppDbContext db, IAvailabilityService availability, IReadOnlyCollection<Guid> tableIds,
        CancellationToken cancellationToken = default)
    {
        var now = await availability.GetLocalNowAsync(cancellationToken) ?? DateTime.UtcNow;
        var reservations = await db.Reservations.Where(r => tableIds.Contains(r.TableId)).ToListAsync(cancellationToken);
        if (reservations.Any(r => r.EndLocal > now && ReservationRules.BlockingStatuses.Contains(r.Status)))
        {
            return false;
        }
        db.Reservations.RemoveRange(reservations);
        return true;
    }
}
