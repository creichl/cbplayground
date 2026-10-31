import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { currentUserKey } from './auth.ts'
import { apiGet, apiPost, apiPut } from './client.ts'

/** The roles a Tenant Admin can give to a staff user. */
export type StaffRole = 'TenantAdmin' | 'FrontDesk'

/** A user of the admin's restaurant, as returned by GET /api/admin/staff. */
export type StaffUser = {
  id: string
  email: string
  displayName: string
  role: StaffRole
  isActive: boolean
}

const staffKey = ['admin', 'staff'] as const

/** The users of the signed-in admin's restaurant, sorted by name. */
export function useStaff() {
  return useQuery({
    queryKey: staffKey,
    queryFn: () => apiGet<StaffUser[]>('/admin/staff'),
  })
}

/**
 * Reloads the list, and the signed-in user too: an admin who changes their own role
 * loses the admin area, and the route guard then sends them to their new start page.
 */
function useInvalidateStaff() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: staffKey }), queryClient.invalidateQueries({ queryKey: currentUserKey })])
}

export function useCreateStaff() {
  const invalidate = useInvalidateStaff()
  return useMutation({
    mutationFn: (user: { email: string; displayName: string; role: StaffRole; password: string }) => apiPost<StaffUser>('/admin/staff', user),
    onSuccess: invalidate,
  })
}

export function useUpdateStaff() {
  const invalidate = useInvalidateStaff()
  return useMutation({
    mutationFn: ({ id, ...user }: { id: string; displayName: string; role: StaffRole }) =>
      apiPut<StaffUser>(`/admin/staff/${encodeURIComponent(id)}`, user),
    onSuccess: invalidate,
  })
}

export function useSetStaffActive() {
  const invalidate = useInvalidateStaff()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiPost<StaffUser>(`/admin/staff/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: invalidate,
  })
}

export function useSetStaffPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiPost<void>(`/admin/staff/${encodeURIComponent(id)}/password`, { password }),
  })
}
