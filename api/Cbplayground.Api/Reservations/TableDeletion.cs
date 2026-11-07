using Cbplayground.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Cbplayground.Api.Reservations;

/// <summary>What <see cref="TableDeletion.TryDeleteAsync"/> did with the tables.</summary>
public enum TableDeletionResult
{
    /// <summary>Nothing: a reservation occupies one of the tables and has not ended yet.</summary>
    Blocked,

    /// <summary>Every table was deleted, none had a reservation.</summary>
    Deleted,

    /// <summary>At least one table had reservations and was archived (or already was); the others were deleted.</summary>
    Archived,
}

/// <summary>
/// Deleting tables never deletes reservations: a reservation always keeps its table (the foreign key is Restrict), so a table
/// with reservations is archived instead (<see cref="Table.ArchivedAtUtc"/>), and its past and cancelled reservations keep their
/// table number, their area and the guest's link. A reservation that occupies the table and has not ended yet prevents it.
/// </summary>
public static class TableDeletion
{
    /// <summary>
    /// Deletes the tables without reservations and archives those with reservations (not saved yet), or changes nothing when one
    /// of them has a reservation that occupies it and has not ended yet. A table that is archived already stays archived as it
    /// was. Call it in the transaction that saves the change.
    /// </summary>
    public static async Task<TableDeletionResult> TryDeleteAsync(AppDbContext db, IAvailabilityService availability, IReadOnlyCollection<Table> tables,
        DateTime archivedAtUtc, CancellationToken cancellationToken = default)
    {
        var now = await availability.GetLocalNowAsync(cancellationToken) ?? DateTime.UtcNow;
        var tableIds = tables.Select(t => t.Id).ToList();
        var reservations = await db.Reservations.Where(r => tableIds.Contains(r.TableId)).ToListAsync(cancellationToken);
        if (reservations.Any(r => r.EndLocal > now && ReservationRules.BlockingStatuses.Contains(r.Status)))
        {
            return TableDeletionResult.Blocked;
        }

        var result = TableDeletionResult.Deleted;
        foreach (var table in tables)
        {
            if (reservations.Any(r => r.TableId == table.Id))
            {
                table.ArchivedAtUtc ??= archivedAtUtc;
                result = TableDeletionResult.Archived;
            }
            else
            {
                db.Tables.Remove(table);
            }
        }
        return result;
    }
}
