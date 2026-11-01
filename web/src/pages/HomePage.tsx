import { Button, Card, Group, Image, Skeleton, Stack, Text, Title } from '@mantine/core'
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
              {/* Cover image and logo only accompany the name, so they have no text alternative. */}
              {tenant.coverUrl !== null && (
                <Card.Section mb="md">
                  <Image src={tenant.coverUrl} alt="" h={{ base: 120, sm: 160 }} fit="cover" />
                </Card.Section>
              )}
              <Stack gap="sm">
                <Group gap="sm" wrap="nowrap">
                  {tenant.logoUrl !== null && (
                    <Image src={tenant.logoUrl} alt="" h={48} w="auto" maw={96} fit="contain" />
                  )}
                  <Stack gap={2} miw={0}>
                    <Title order={2} size="h3">
                      {tenant.name}
                    </Title>
                    {tenant.city !== null && (
                      <Text c="dimmed" size="sm">
                        {tenant.city}
                      </Text>
                    )}
                  </Stack>
                </Group>
                {tenant.description !== null && <Text size="sm">{tenant.description}</Text>}
                <Group>
                  {/* In the restaurant's accent colour, with the text colour that contrasts with it. */}
                  <Button component={Link} to={`/r/${tenant.slug}`} color={tenant.brandColor ?? undefined} autoContrast>
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
