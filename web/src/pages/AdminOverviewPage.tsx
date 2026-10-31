import { Anchor, Badge, Button, Card, CheckIcon, Group, Progress, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useCurrentUser } from '../api/auth.ts'
import { type SetupStatus, useSetupStatus } from '../api/profile.ts'
import { useOpenRequests, useReservations, useRestaurantToday } from '../api/reservations.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { DayStats } from '../components/reservations/DayStats.tsx'

/** The steps of the setup checklist in their order, each with the page where it is done. */
const steps: { key: keyof SetupStatus; title: ParseKeys; description: ParseKeys; to: string }[] = [
  { key: 'profile', title: 'overview.steps.profile.title', description: 'overview.steps.profile.description', to: '/admin/profile' },
  { key: 'location', title: 'overview.steps.location.title', description: 'overview.steps.location.description', to: '/admin/opening-hours' },
  { key: 'openingHours', title: 'overview.steps.openingHours.title', description: 'overview.steps.openingHours.description', to: '/admin/opening-hours' },
  { key: 'floorPlan', title: 'overview.steps.floorPlan.title', description: 'overview.steps.floorPlan.description', to: '/admin/areas' },
  { key: 'tables', title: 'overview.steps.tables.title', description: 'overview.steps.tables.description', to: '/admin/areas' },
  {
    key: 'reservationSettings',
    title: 'overview.steps.reservationSettings.title',
    description: 'overview.steps.reservationSettings.description',
    to: '/admin/reservation-settings',
  },
]

/** Admin start page: greeting, today's key figures and the checklist of the restaurant's setup. */
export function AdminOverviewPage() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const status = useSetupStatus()
  // The admin area is only shown to a signed-in Tenant Admin, who always has a restaurant.
  const tenant = currentUser.data?.tenant ?? null

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" gap="sm">
        <Stack gap={4}>
          <Title order={2}>{tenant?.name}</Title>
          <Text c="dimmed">{t('overview.welcome', { name: currentUser.data?.displayName ?? '' })}</Text>
        </Stack>
        {tenant !== null && (
          <Button component="a" href={`/r/${tenant.slug}`} target="_blank" rel="noopener" variant="light">
            {t('overview.viewBookingPage')}
          </Button>
        )}
      </Group>

      <TodayStats />

      {status.isPending ? (
        <Skeleton h={480} radius="md" />
      ) : status.isError ? (
        <ErrorAlert error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <SetupChecklist status={status.data} />
      )}
    </Stack>
  )
}

/** Today's reservations, guests and open requests, with the way to the reservations. */
function TodayStats() {
  const { t } = useTranslation()
  const today = useRestaurantToday()
  const reservations = useReservations(today)
  const openRequests = useOpenRequests(today)

  return (
    <Stack gap="xs">
      <Group justify="space-between" gap="xs">
        <Title order={3}>{t('overview.today.title')}</Title>
        <Anchor component={Link} to="/admin/reservations" size="sm">
          {t('overview.today.toReservations')}
        </Anchor>
      </Group>
      {reservations.data !== undefined ? (
        <DayStats reservations={reservations.data} openRequests={openRequests.data?.length ?? 0} withArrived={false} requestsTo="/admin/reservations" />
      ) : reservations.isError ? (
        <ErrorAlert error={reservations.error} onRetry={() => void reservations.refetch()} />
      ) : (
        <Skeleton h={76} radius="md" />
      )}
    </Stack>
  )
}

function SetupChecklist({ status }: { status: SetupStatus }) {
  const { t } = useTranslation()
  const done = steps.filter((step) => status[step.key]).length

  return (
    <Card>
      <Stack gap="md">
        <Stack gap="xs">
          <Group justify="space-between" gap="xs">
            <Title order={3}>{t('overview.checklist.title')}</Title>
            <Text size="sm" c="dimmed">
              {t('overview.checklist.progress', { done, total: steps.length })}
            </Text>
          </Group>
          <Progress value={(done / steps.length) * 100} aria-label={t('overview.checklist.progress', { done, total: steps.length })} />
          {done === steps.length && <Text size="sm">{t('overview.checklist.allDone')}</Text>}
        </Stack>

        <Stack gap={0} component="ol" p={0} m={0} style={{ listStyle: 'none' }}>
          {steps.map((step, index) => {
            const isDone = status[step.key]
            return (
              <Group
                key={step.key}
                component="li"
                wrap="nowrap"
                align="flex-start"
                gap="md"
                py="sm"
                style={{ borderTop: index > 0 ? '1px solid var(--mantine-color-gray-2)' : undefined }}
              >
                {isDone ? (
                  <ThemeIcon radius="xl" size={28} color="green">
                    <CheckIcon size={12} />
                  </ThemeIcon>
                ) : (
                  <ThemeIcon radius="xl" size={28} variant="outline" color="gray">
                    <Text size="sm" fw={600}>
                      {index + 1}
                    </Text>
                  </ThemeIcon>
                )}
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text fw={600} c={isDone ? 'dimmed' : undefined}>
                    {t(step.title)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t(step.description)}
                  </Text>
                </Stack>
                {isDone ? (
                  <Badge color="green" variant="light" style={{ flexShrink: 0 }}>
                    {t('overview.checklist.done')}
                  </Badge>
                ) : (
                  <Button component={Link} to={step.to} size="xs" style={{ flexShrink: 0 }}>
                    {t('overview.checklist.setUp')}
                  </Button>
                )}
              </Group>
            )
          })}
        </Stack>
      </Stack>
    </Card>
  )
}
