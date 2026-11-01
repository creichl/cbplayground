import { Button, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '../i18n/title.ts'

/** In the look of the start page: the same width, 8 px spacing and text colours with AA contrast on the grey background. */
export function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('notFound.title'))

  return (
    <Stack gap={24} align="flex-start" maw={640} py={{ base: 0, sm: 32 }}>
      <Stack gap={8}>
        <Text c="brand.8" fw={600} tt="uppercase" size="sm">
          {t('notFound.label')}
        </Text>
        <Title order={1} style={{ textWrap: 'balance' }}>
          {t('notFound.title')}
        </Title>
        <Text size="lg" c="gray.7">
          {t('notFound.text')}
        </Text>
      </Stack>
      <Button component={Link} to="/" size="md" h={44}>
        {t('common.backToStart')}
      </Button>
    </Stack>
  )
}
