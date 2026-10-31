import { Skeleton, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useRestaurantToday } from '../api/reservations.ts'
import { ReservationDay } from '../components/reservations/ReservationDay.tsx'
import { formatLongDate } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'

/** Today's reservations at the front desk, with open requests, quick status actions and phone reservations. */
export function FrontdeskTodayPage() {
  const { t, i18n } = useTranslation()
  const today = useRestaurantToday()
  useDocumentTitle(t('frontdesk.today'))

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>{t('frontdesk.today')}</Title>
        {today !== null && (
          <Text c="dimmed">{formatLongDate(today, i18n.resolvedLanguage ?? 'en')}</Text>
        )}
      </Stack>
      {today === null ? <Skeleton h={320} radius="md" /> : <ReservationDay date={today} today={today} />}
    </Stack>
  )
}
