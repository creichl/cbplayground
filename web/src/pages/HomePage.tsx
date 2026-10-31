import { Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useTenants } from '../api/tenants.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

export function HomePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('home.title'), null)
  const tenants = useTenants()

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1}>{t('home.title')}</Title>
        <Text c="dimmed">{t('home.subtitle')}</Text>
      </Stack>

      {tenants.isPending ? (
        <Stack gap="sm">
          <Skeleton h={140} radius="md" />
          <Skeleton h={140} radius="md" />
          <Skeleton h={140} radius="md" />
        </Stack>
      ) : tenants.isError ? (
        <ErrorAlert error={tenants.error} onRetry={() => void tenants.refetch()} />
      ) : tenants.data.length === 0 ? (
        <Text>{t('home.empty')}</Text>
      ) : (
        <Stack gap="sm">
          {tenants.data.map((tenant) => (
            <Card key={tenant.id}>
              <Stack gap="sm">
                <Stack gap={2}>
                  <Title order={2} size="h3">
                    {tenant.name}
                  </Title>
                  {tenant.city !== null && (
                    <Text c="dimmed" size="sm">
                      {tenant.city}
                    </Text>
                  )}
                </Stack>
                {tenant.description !== null && <Text size="sm">{tenant.description}</Text>}
                <Group>
                  <Button component={Link} to={`/r/${tenant.slug}`}>
                    {t('home.reserve')}
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
