import { Button, Card, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useTenants } from '../api/tenants.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'

/** Placeholder page of a restaurant. The guest booking will live here. */
export function RestaurantPage() {
  const { t } = useTranslation()
  const { slug } = useParams()
  const tenants = useTenants()

  if (tenants.isPending) {
    return (
      <Stack gap="lg">
        <Skeleton h={40} w="60%" />
        <Skeleton h={96} radius="md" />
      </Stack>
    )
  }

  if (tenants.isError) {
    return <ErrorAlert error={tenants.error} onRetry={() => void tenants.refetch()} />
  }

  const tenant = tenants.data.find((candidate) => candidate.slug === slug)

  return (
    <Stack gap="lg" align="flex-start">
      <Title order={1}>{tenant?.name ?? t('restaurant.notFoundTitle')}</Title>
      <Card w="100%">
        <Text c="dimmed">{tenant !== undefined ? t('restaurant.bookingPlaceholder') : t('restaurant.notFoundText')}</Text>
      </Card>
      <Button component={Link} to="/" variant="light" size="md">
        {t('common.backToStart')}
      </Button>
    </Stack>
  )
}
