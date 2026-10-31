import { Button, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '../i18n/title.ts'

export function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('notFound.title'))

  return (
    <Stack gap="md" align="flex-start" py="xl">
      <Text c="dimmed" fw={600} tt="uppercase" size="sm">
        {t('notFound.label')}
      </Text>
      <Title order={1}>{t('notFound.title')}</Title>
      <Text c="dimmed">{t('notFound.text')}</Text>
      <Button component={Link} to="/" size="md">
        {t('common.backToStart')}
      </Button>
    </Stack>
  )
}
