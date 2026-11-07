import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { ApiError, apiDelete, apiGet, apiPost, httpErrorMessage } from './client.ts'
import { availabilityKey, walkInTablesKey } from './reservations.ts'

/**
 * A table blocked for a time of one day, as returned by /api/staff/table-blocks: nobody can book it then. Times are "HH:mm" in
 * the restaurant's local time on the quarter hour; the end may be "24:00". `createdBy` is the staff user's name at the time.
 */
export type TableBlock = {
  id: string
  tableId: string
  tableNumber: string
  areaId: string
  date: string
  start: string
  end: string
  reason: string | null
  createdBy: string | null
  createdAtUtc: string
}

/** A new block of one table; without a reason `reason` is null. */
export type TableBlockInput = { tableId: string; date: string; start: string; end: string; reason: string | null }

/** The longest reason the server accepts. */
export const maxBlockReasonLength = 100

const tableBlocksKey = ['staff', 'table-blocks'] as const

/** The front desk sees blocks entered at another desk without reloading the page, like the reservations. */
const refreshIntervalMs = 60_000

/** The blocked tables of `date`, by start and table number. Reloaded every minute. */
export function useTableBlocks(date: string | null) {
  return useQuery({
    queryKey: [...tableBlocksKey, date],
    queryFn: () => apiGet<TableBlock[]>(`/staff/table-blocks?date=${date}`),
    enabled: date !== null,
    refetchInterval: refreshIntervalMs,
  })
}

/** A block changes which tables are free, so the free times and the walk-in tables are loaded again with the blocks. */
function useRefreshAfterBlockChange() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tableBlocksKey }),
      queryClient.invalidateQueries({ queryKey: availabilityKey }),
      queryClient.invalidateQueries({ queryKey: walkInTablesKey }),
    ])
}

/** Blocks a table; a reservation that occupies it in that time refuses it ("table_has_reservations"). */
export function useCreateTableBlock() {
  const refresh = useRefreshAfterBlockChange()
  return useMutation({
    mutationFn: (block: TableBlockInput) => apiPost<TableBlock>('/staff/table-blocks', block),
    onSuccess: refresh,
  })
}

/** Removes a block, which frees the table again. */
export function useDeleteTableBlock() {
  const refresh = useRefreshAfterBlockChange()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/staff/table-blocks/${encodeURIComponent(id)}`),
    onSuccess: refresh,
    // Usually removed at another desk in the meantime: show the current blocks.
    onError: refresh,
  })
}

const errorKeys = {
  invalid_date: 'tableBlocks.errors.invalidDate',
  invalid_time: 'tableBlocks.errors.invalidTime',
  start_not_before_end: 'tableBlocks.errors.startNotBeforeEnd',
  invalid_reason: 'tableBlocks.errors.invalidReason',
  table_has_reservations: 'tableBlocks.errors.tableHasReservations',
} as const

/** A failed request of the blocks in the user's language. */
export function tableBlockErrorMessage(error: unknown, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in errorKeys) {
      return t(errorKeys[error.code as keyof typeof errorKeys])
    }
    if (error.status === 404) {
      return t('tableBlocks.errors.notFound')
    }
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.kind === 'http') {
      return httpErrorMessage(error, t)
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}
