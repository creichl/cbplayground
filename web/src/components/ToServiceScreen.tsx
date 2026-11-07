import { Navigate, useSearchParams } from 'react-router'

/**
 * The old addresses of the front desk's tabs and of the admin's reservations and table overview lead to the service screen
 * `/frontdesk` with their parameters (`?date`, `?view`). The old table overview showed the timeline unless `?view=floor`; the
 * service screen shows the floor plan unless `?view=timeline`.
 */
export function ToServiceScreen({ tableOverview = false }: { tableOverview?: boolean }) {
  const [searchParams] = useSearchParams()
  const params = new URLSearchParams(searchParams)
  if (tableOverview) {
    if (params.get('view') === 'floor') {
      params.delete('view')
    } else {
      params.set('view', 'timeline')
    }
  }
  const search = params.toString()
  return <Navigate to={search === '' ? '/frontdesk' : `/frontdesk?${search}`} replace />
}
