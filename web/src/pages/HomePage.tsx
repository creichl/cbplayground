import { Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useTenants } from '../api/tenants.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'

export function HomePage() {
  const { t } = useTranslation()
  const tenants = useTenants()

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1}>{t('home.title')}</Title>
        <Text c="dimmed">{t('home.subtitle')}</Text>
      </Stack>

      {tenants.isPending ? (
        <Stack gap="sm">
          <Skeleton h={76} radius="md" />
          <Skeleton h={76} radius="md" />
          <Skeleton h={76} radius="md" />
        </Stack>
      ) : tenants.isError ? (
        <ErrorAlert error={tenants.error} onRetry={() => void tenants.refetch()} />
      ) : tenants.data.length === 0 ? (
        <Text>{t('home.empty')}</Text>
      ) : (
        <Stack gap="sm">
          {tenants.data.map((tenant) => (
            <Card key={tenant.id} component={Link} to={`/r/${tenant.slug}`}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} size="lg">
                  {tenant.name}
                </Text>
                <Text c="brand" fw={500} size="sm">
                  {t('home.view')}
                </Text>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
