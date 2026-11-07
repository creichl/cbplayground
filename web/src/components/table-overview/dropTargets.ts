import type { FreeTable, Reservation } from '../../api/reservations.ts'

/** Whether both are the same tables, in any order. */
export function sameTables(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/**
 * Where a reservation dropped on the table `tableId` goes, of the free tables and combinations `free` (in the order the system
 * assigns them): its own tables if they are free and contain that table, otherwise the table itself if it seats the party, otherwise
 * the smallest free combination with it. Undefined when none of them contains the table.
 */
export function dropTarget(free: readonly FreeTable[], tableId: string, reservation: Pick<Reservation, 'tableIds'>) {
  const containing = free.filter((candidate) => candidate.tableIds.includes(tableId))
  return (
    containing.find((candidate) => sameTables(candidate.tableIds, reservation.tableIds)) ??
    containing.find((candidate) => candidate.kind === 'table') ??
    containing.at(0)
  )
}
