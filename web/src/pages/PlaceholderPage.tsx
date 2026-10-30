import { Card, Stack, Text, Title } from '@mantine/core'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'

type PlaceholderPageProps = {
  /** Translation key of the page title. */
  titleKey: ParseKeys
}

/** Page for areas that are not built yet. */
export function PlaceholderPage({ titleKey }: PlaceholderPageProps) {
  const { t } = useTranslation()

  return (
    <Stack gap="lg">
      <Title order={2}>{t(titleKey)}</Title>
      <Card>
        <Text c="dimmed">{t('placeholder.text')}</Text>
      </Card>
    </Stack>
  )
}
