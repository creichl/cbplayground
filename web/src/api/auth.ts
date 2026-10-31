import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiGet, apiPost } from './client.ts'

export type Role = 'Superadmin' | 'TenantAdmin' | 'FrontDesk'

/** The signed-in staff user, as returned by GET /api/auth/me. */
export type CurrentUser = {
  id: string
  email: string
  displayName: string
  role: Role
  /** The user's restaurant; null for the Superadmin. */
  tenant: { id: string; name: string; slug: string } | null
}

const currentUserKey = ['auth', 'me'] as const

/** Drops all cached data except the current user, so nothing of the previous user stays visible. */
function removeUserData(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== currentUserKey[0] })
}

/** Where a user lands after signing in. There is no Superadmin UI yet, so the Superadmin goes to the start page. */
export function homePath(role: Role) {
  switch (role) {
    case 'TenantAdmin':
      return '/admin'
    case 'FrontDesk':
      return '/frontdesk'
    case 'Superadmin':
      return '/'
  }
}

/** The signed-in user, or null when nobody is signed in. */
export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: async () => {
      try {
        return await apiGet<CurrentUser>('/auth/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null
        }
        throw error
      }
    },
  })
}

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) => apiPost<CurrentUser>('/auth/login', credentials),
    onSuccess: (user) => {
      removeUserData(queryClient)
      queryClient.setQueryData(currentUserKey, user)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiPost<void>('/auth/logout'),
    // The route guards then send the user to /login.
    onSuccess: () => {
      queryClient.setQueryData(currentUserKey, null)
      removeUserData(queryClient)
    },
  })
}
