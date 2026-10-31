import { Card, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Placeholder for today's reservations at the front desk. */
export function FrontdeskTodayPage() {
  const { t, i18n } = useTranslation()
  const [today] = useState(() => new Date())

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>{t('frontdesk.today')}</Title>
        <Text c="dimmed">{new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'full' }).format(today)}</Text>
      </Stack>
      <Card>
        <Text c="dimmed">{t('placeholder.text')}</Text>
      </Card>
    </Stack>
  )
}
