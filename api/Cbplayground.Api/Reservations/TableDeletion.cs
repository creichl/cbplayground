using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>
/// Reservations keep their tables (the foreign keys are Restrict). Before tables are deleted, their reservations that no longer
/// matter are removed: past ones and cancelled or declined ones, also the combined ones of which the table is only one. A
/// reservation that occupies one of the tables and has not ended yet prevents the deletion. The combinations with one of the
/// tables are deleted with them.
/// </summary>
public static class TableDeletion
{
    /// <summary>
    /// Removes the reservations and the combinations of the tables (not saved yet), or returns false when a reservation occupies one
    /// of them and has not ended yet. Call it in the transaction that deletes the tables.
    /// </summary>
    public static async Task<bool> TryRemoveReservationsAsync(AppDbContext db, IAvailabilityService availability, IReadOnlyCollection<Guid> tableIds,
        CancellationToken cancellationToken = default)
    {
        var now = await availability.GetLocalNowAsync(cancellationToken) ?? DateTime.UtcNow;
        var reservations = await db.Reservations
            .Where(r => tableIds.Contains(r.TableId) || r.Tables.Any(t => tableIds.Contains(t.TableId)))
            .ToListAsync(cancellationToken);
        if (reservations.Any(r => r.EndLocal > now && ReservationRules.BlockingStatuses.Contains(r.Status)))
        {
            return false;
        }
        db.Reservations.RemoveRange(reservations);
        db.TableCombinations.RemoveRange(await db.TableCombinations
            .Where(c => c.Tables.Any(t => tableIds.Contains(t.TableId)))
            .ToListAsync(cancellationToken));
        return true;
    }
}
