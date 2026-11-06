import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut } from './client.ts'
import type { CountryCode, RegionCode } from './openingHours.ts'
import type { SetupStatus } from './profile.ts'

/** A restaurant with its key figures, as returned by GET /api/superadmin/tenants. */
export type SuperadminTenant = {
  id: string
  name: string
  slug: string
  countryCode: CountryCode | null
  regionCode: RegionCode | null
  isActive: boolean
  createdAt: string
  /** Active Tenant Admins. */
  adminCount: number
  /** Active staff users of all roles. */
  staffCount: number
  tableCount: number
  /** Reservations from now on that are not cancelled or declined. */
  upcomingReservationCount: number
  /** The steps of the restaurant's setup, as its admin sees them (GET /api/admin/setup-status). */
  setup: SetupStatus
  /** Reservations in the 7 days before now, not cancelled or declined (in the restaurant's time zone). */
  reservationsLast7Days: number
  /** Reservations in the 7 days from now, not cancelled or declined (in the restaurant's time zone). */
  reservationsNext7Days: number
  /** When the newest online booking was made (UTC), null if there is none. */
  lastOnlineBookingAtUtc: string | null
  /** When one of the restaurant's staff last signed in (UTC), null if nobody has yet. */
  lastStaffSignInAtUtc: string | null
}

/** The steps of the setup in the order of the admin's checklist. */
export const setupSteps = ['profile', 'location', 'openingHours', 'floorPlan', 'tables', 'reservationSettings'] as const satisfies readonly (keyof SetupStatus)[]

/** How many steps of the restaurant's setup are done. */
export function setupDoneCount(tenant: SuperadminTenant) {
  return setupSteps.filter((step) => tenant.setup[step]).length
}

/** The newest of the last online booking and the last staff sign-in (UTC), null if there was neither. */
export function lastActivityAtUtc(tenant: SuperadminTenant) {
  const times = [tenant.lastOnlineBookingAtUtc, tenant.lastStaffSignInAtUtc].filter((time) => time !== null)
  return times.length === 0 ? null : times.reduce((latest, time) => (Date.parse(time) > Date.parse(latest) ? time : latest))
}

/** A Tenant Admin of a restaurant, as returned by GET /api/superadmin/tenants/{id}/admins. */
export type TenantAdminUser = {
  id: string
  email: string
  displayName: string
  isActive: boolean
}

const tenantsKey = ['superadmin', 'tenants'] as const
const adminsKey = (tenantId: string) => ['superadmin', 'tenants', tenantId, 'admins'] as const

/** All restaurants, active or not, sorted by name. */
export function useSuperadminTenants() {
  return useQuery({
    queryKey: tenantsKey,
    queryFn: () => apiGet<SuperadminTenant[]>('/superadmin/tenants'),
  })
}

/** Reloads the restaurants, including the public list of the start page, which only shows the active ones. */
function useInvalidateTenants() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: tenantsKey }), queryClient.invalidateQueries({ queryKey: ['tenants'] })])
}

export function useCreateTenant() {
  const invalidate = useInvalidateTenants()
  return useMutation({
    mutationFn: (tenant: { name: string; slug: string; countryCode: CountryCode | null; regionCode: RegionCode | null }) =>
      apiPost<SuperadminTenant>('/superadmin/tenants', tenant),
    onSuccess: invalidate,
  })
}

export function useUpdateTenant() {
  const invalidate = useInvalidateTenants()
  return useMutation({
    mutationFn: ({ id, ...tenant }: { id: string; name: string; slug: string }) =>
      apiPut<SuperadminTenant>(`/superadmin/tenants/${encodeURIComponent(id)}`, tenant),
    onSuccess: invalidate,
  })
}

export function useSetTenantActive() {
  const invalidate = useInvalidateTenants()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiPost<SuperadminTenant>(`/superadmin/tenants/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: invalidate,
  })
}

/** The Tenant Admins of a restaurant, sorted by name. */
export function useTenantAdmins(tenantId: string) {
  return useQuery({
    queryKey: adminsKey(tenantId),
    queryFn: () => apiGet<TenantAdminUser[]>(`/superadmin/tenants/${encodeURIComponent(tenantId)}/admins`),
  })
}

export function useCreateTenantAdmin(tenantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (admin: { email: string; displayName: string; password: string }) =>
      apiPost<TenantAdminUser>(`/superadmin/tenants/${encodeURIComponent(tenantId)}/admins`, admin),
    // Reloads the restaurants (they show the number of admins) and, as the key starts the same, the admins.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tenantsKey }),
  })
}

export function useSetTenantAdminPassword(tenantId: string) {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiPost<void>(`/superadmin/tenants/${encodeURIComponent(tenantId)}/admins/${encodeURIComponent(id)}/password`, { password }),
  })
}
