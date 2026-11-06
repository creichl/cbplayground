import { Group, type MantineSize, Paper, Progress, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { setupDoneCount, setupSteps, type SuperadminTenant } from '../../api/superadmin.ts'
import { formatDateTime } from '../../i18n/format.ts'

/** A key figure of the Superadmin's pages: a label and a large value, on a light yellow when it needs attention. */
export function KeyFigure({ label, value, highlight = false }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <Paper withBorder p="sm" radius="md" bg={highlight ? 'yellow.0' : 'white'}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} fz={28} lh={1.2}>
        {value}
      </Text>
    </Paper>
  )
}

/** The progress of a restaurant's setup: "4 / 6" with a bar, green when every step is done. */
export function SetupProgress({ tenant }: { tenant: SuperadminTenant }) {
  const { t } = useTranslation()
  const done = setupDoneCount(tenant)
  const total = setupSteps.length

  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {done} / {total}
      </Text>
      <Progress
        value={(done / total) * 100}
        color={done === total ? 'green' : 'yellow'}
        w={64}
        size="sm"
        aria-label={t('overview.checklist.progress', { done, total })}
      />
    </Group>
  )
}

/** When something last happened (a UTC time of the API) in the user's language, or "Never". */
export function ActivityTime({ moment, size = 'sm' }: { moment: string | null; size?: MantineSize }) {
  const { t, i18n } = useTranslation()
  return moment === null ? (
    <Text size={size} c="dimmed" component="span" inherit={false}>
      {t('superadmin.never')}
    </Text>
  ) : (
    <Text size={size} component="span" style={{ whiteSpace: 'nowrap' }}>
      {formatDateTime(moment, i18n.resolvedLanguage ?? 'en')}
    </Text>
  )
}
