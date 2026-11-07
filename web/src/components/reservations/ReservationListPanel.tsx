import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Reservation } from '../../api/reservations.ts'
import { cn } from '../../lib/utils.ts'
import { Skeleton } from '../../ui/skeleton.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx'
import { RequestError } from '../booking/RequestError.tsx'
import { PendingRequests } from './PendingRequests.tsx'
import { ReservationList } from './ReservationList.tsx'
import { type ListTab, listTabOf } from './status.ts'

type ReservationListPanelProps = {
  tab: ListTab
  onTabChange: (tab: ListTab) => void
  /** The reservations of the day (of the chosen service, matching the search); undefined while they load. */
  reservations: Reservation[] | undefined
  /** Why the day's reservations could not be loaded; a failed reload in the background keeps the last list. */
  error: Error | null
  onRetry: () => void
  /** The open requests from today on (matching the search); undefined while they load. */
  requests: Reservation[] | undefined
  requestsError: Error | null
  onRetryRequests: () => void
  /** Why the day's lists are empty before the search: no reservations at all, or the restaurant is closed. */
  emptyText: string
  /** Whether a search is entered: an empty tab then says that nothing matches. */
  searching: boolean
  selectedId: string | null
  /** Opens a reservation: selects it and opens the edit drawer. */
  onOpen: (reservation: Reservation) => void
  className?: string
}

/**
 * The list panel of the front desk: the tabs "Upcoming", "Seated", "Finished" and "Requests" with their numbers, each with
 * the reservations grouped by start time and their quick actions. The selected reservation is scrolled into view.
 */
export function ReservationListPanel({
  tab,
  onTabChange,
  reservations,
  error,
  onRetry,
  requests,
  requestsError,
  onRetryRequests,
  emptyText,
  searching,
  selectedId,
  onOpen,
  className,
}: ReservationListPanelProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const byTab = (shown: Exclude<ListTab, 'requests'>) => (reservations ?? []).filter((reservation) => listTabOf(reservation) === shown)
  const lists = { upcoming: byTab('upcoming'), seated: byTab('seated'), finished: byTab('finished') }
  const count = (shown: ListTab) => (shown === 'requests' ? requests?.length : reservations === undefined ? undefined : lists[shown].length)

  // A reservation selected elsewhere (the plan) is brought into view.
  useEffect(() => {
    if (selectedId === null) {
      return
    }
    scrollRef.current?.querySelector(`[data-reservation-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId, tab])

  const tabs: { value: ListTab; label: string }[] = [
    { value: 'upcoming', label: t('frontdesk.tabs.upcoming') },
    { value: 'seated', label: t('frontdesk.tabs.seated') },
    { value: 'finished', label: t('frontdesk.tabs.finished') },
    { value: 'requests', label: t('frontdesk.tabs.requests') },
  ]

  const emptyOf = (shown: Exclude<ListTab, 'requests'>) =>
    searching ? t('reservations.list.noMatches') : (reservations ?? []).length === 0 ? emptyText : t(`frontdesk.empty.${shown}`)

  return (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as ListTab)} className={cn('min-h-0 gap-0', className)}>
      <div className="border-b border-border px-3 py-2">
        {/* Four equal columns, the number below the label, so the longer labels (de, sr) fit the 400 px panel too. */}
        <TabsList className="grid h-auto w-full grid-cols-4">
          {tabs.map(({ value, label }) => {
            const number = count(value)
            return (
              <TabsTrigger key={value} value={value} className="h-auto min-h-11 min-w-0 flex-col gap-0.5 px-1 py-1 text-[0.8125rem] leading-tight touch:h-auto">
                <span className="max-w-full truncate">{label}</span>
                {number !== undefined && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs leading-4 tabular-nums',
                      value === 'requests' && number > 0 ? 'bg-status-requested-surface text-status-requested-text' : 'bg-background/70',
                    )}
                  >
                    {number}
                  </span>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-6">
        {(['upcoming', 'seated', 'finished'] as const).map((shown) => (
          <TabsContent key={shown} value={shown} className="pt-2">
            {reservations === undefined ? (
              error !== null ? (
                <RequestError error={error} onRetry={onRetry} />
              ) : (
                <ListSkeleton />
              )
            ) : (
              <ReservationList reservations={lists[shown]} onOpen={onOpen} selectedId={selectedId} emptyText={emptyOf(shown)} />
            )}
          </TabsContent>
        ))}
        <TabsContent value="requests" className="pt-2">
          {requests === undefined && requestsError === null ? (
            <ListSkeleton />
          ) : (
            <PendingRequests
              requests={requests}
              error={requestsError}
              onRetry={onRetryRequests}
              onOpen={onOpen}
              selectedId={selectedId}
              emptyText={searching ? t('reservations.list.noMatches') : t('frontdesk.empty.requests')}
            />
          )}
        </TabsContent>
      </div>
    </Tabs>
  )
}

/** The list while it loads: a group heading and rows in their shape. */
export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-5 w-24" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <div className="flex gap-3">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="ml-15 h-8 w-48" />
        </div>
      ))}
    </div>
  )
}
