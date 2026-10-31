import { Center, Container, Loader } from '@mantine/core'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { homePath, useCurrentUser, type Role } from '../api/auth.ts'
import { ErrorAlert } from './ErrorAlert.tsx'

type RequireRoleProps = {
  /** Roles that may see the children. */
  roles: Role[]
  children: ReactNode
}

/**
 * Route guard: without sign-in it sends the user to /login (and back here afterwards),
 * a user without one of the roles goes to the start page of their own role.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const currentUser = useCurrentUser()
  const location = useLocation()

  if (currentUser.data === undefined) {
    if (currentUser.isError) {
      return (
        <Container size="sm" py="xl">
          <ErrorAlert error={currentUser.error} onRetry={() => void currentUser.refetch()} />
        </Container>
      )
    }
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (currentUser.data === null) {
    const returnTo = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }

  if (!roles.includes(currentUser.data.role)) {
    return <Navigate to={homePath(currentUser.data.role)} replace />
  }

  return children
}
