import {
  AspectRatio,
  Box,
  Button,
  Card,
  Image,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineTheme,
  VisuallyHidden,
} from '@mantine/core'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type Tenant, useTenants } from '../api/tenants.ts'
import { contrastRatio } from '../brandTheme.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { SearchIcon } from '../components/icons.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

// Spacing on the start page follows an 8 px grid (8, 16, 24, 32, 48), text sizes Mantine's fixed scale.

/** 1 column on phones, 2 on tablets, 3 on desktops. */
const gridColumns = { base: 1, sm: 2, md: 3 }

/** Text for the search: lower case, without accents, so "munchen" finds "München". */
function searchable(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
}

/**
 * The start page: a short introduction, a search by name or city that filters the restaurants as you type, and the
 * restaurants as a grid of cards with photo. It stays in the platform's theme; only the button on a card carries the
 * restaurant's accent colour.
 */
export function HomePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('home.title'), null)
  const tenants = useTenants()
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)

  const search = searchable(query.trim())
  const matches =
    tenants.data?.filter(
      (tenant) => searchable(tenant.name).includes(search) || (tenant.city !== null && searchable(tenant.city).includes(search)),
    ) ?? []
  // The search is offered while the restaurants load and when there are any.
  const withSearch = tenants.isPending || (tenants.isSuccess && tenants.data.length > 0)

  function resetSearch() {
    setQuery('')
    searchInput.current?.focus()
  }

  return (
    <Stack gap={32}>
      <Stack gap={16} maw={640}>
        <Stack gap={8}>
          <Title order={1} style={{ textWrap: 'balance' }}>
            {t('home.heading')}
          </Title>
          <Text size="lg" c="gray.7">
            {t('home.subtitle')}
          </Text>
        </Stack>
        {withSearch && (
          <Box role="search">
            <TextInput
              ref={searchInput}
              type="search"
              label={t('home.search')}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              leftSection={<SearchIcon />}
              size="md"
              styles={{ label: { marginBottom: 8 }, input: { height: 48 } }}
              autoComplete="off"
            />
          </Box>
        )}
      </Stack>

      {/* Tells screen reader users how many restaurants the search leaves, as they type. */}
      <VisuallyHidden role="status">
        {tenants.isPending ? t('home.loading') : search !== '' ? t('home.results', { count: matches.length }) : ''}
      </VisuallyHidden>

      {tenants.isPending ? (
        <SimpleGrid cols={gridColumns} spacing={24} aria-hidden="true">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </SimpleGrid>
      ) : tenants.isError ? (
        <ErrorAlert error={tenants.error} onRetry={() => void tenants.refetch()} />
      ) : tenants.data.length === 0 ? (
        <Stack gap={8} align="center" ta="center" py={48}>
          <Title order={2} size="h3">
            {t('home.emptyTitle')}
          </Title>
          <Text c="gray.7" maw={480}>
            {t('home.empty')}
          </Text>
        </Stack>
      ) : matches.length === 0 ? (
        <Stack gap={16} align="center" ta="center" py={48}>
          <Stack gap={8} align="center">
            <Title order={2} size="h3" style={{ overflowWrap: 'anywhere' }}>
              {t('home.noMatchTitle', { query: query.trim() })}
            </Title>
            <Text c="gray.7" maw={480}>
              {t('home.noMatch')}
            </Text>
          </Stack>
          <Button variant="default" size="md" h={44} onClick={resetSearch}>
            {t('home.resetSearch')}
          </Button>
        </Stack>
      ) : (
        <SimpleGrid component="ul" cols={gridColumns} spacing={24} m={0} p={0} style={{ listStyle: 'none' }}>
          {matches.map((tenant) => (
            <li key={tenant.id}>
              <RestaurantCard tenant={tenant} />
            </li>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}

/**
 * A restaurant as a card that is one link to its booking page: the photo in 16:9 with the logo as a small badge on it, then
 * name, city, the description cut to two lines, and "Reserve a table" in the restaurant's accent colour. The button is only
 * the look of the link, not a link of its own. Without photo a calm area in the accent colour (or the platform's) with the
 * logo or the name.
 */
function RestaurantCard({ tenant }: { tenant: Tenant }) {
  const { t } = useTranslation()
  const theme = useMantineTheme()
  const color = tenant.brandColor ?? theme.colors.brand[8]
  // The text colour with the higher contrast to the accent colour.
  const onColor = contrastRatio(color, theme.white) >= contrastRatio(color, theme.black) ? theme.white : theme.black

  return (
    <Card
      component={Link}
      to={`/r/${encodeURIComponent(tenant.slug)}`}
      // Mantine's focus ring, visible when the card is reached with the keyboard.
      className="mantine-focus-auto"
      padding={24}
      h="100%"
      c="var(--mantine-color-text)"
    >
      {/* Photo and logo only accompany the name below, so they have no text alternative. */}
      <Card.Section pos="relative">
        <AspectRatio ratio={16 / 9}>
          {tenant.coverUrl !== null ? (
            <Image src={tenant.coverUrl} alt="" fit="cover" loading="lazy" />
          ) : (
            <Box bg={color} c={onColor} p={24} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {tenant.logoUrl !== null ? (
                <LogoBadge src={tenant.logoUrl} height={64} />
              ) : (
                <Text aria-hidden="true" size="xl" fw={700} ta="center" lineClamp={2} style={{ overflowWrap: 'anywhere' }}>
                  {tenant.name}
                </Text>
              )}
            </Box>
          )}
        </AspectRatio>
        {tenant.coverUrl !== null && tenant.logoUrl !== null && (
          <Box pos="absolute" left={16} bottom={16}>
            <LogoBadge src={tenant.logoUrl} height={40} />
          </Box>
        )}
      </Card.Section>

      <Stack gap={8} pt={24} style={{ flex: 1 }}>
        <Stack gap={4}>
          <Title order={2} size="h3" style={{ overflowWrap: 'anywhere' }}>
            {tenant.name}
          </Title>
          {tenant.city !== null && (
            <Text size="sm" c="gray.7">
              {tenant.city}
            </Text>
          )}
        </Stack>
        {tenant.description !== null && (
          <Text size="sm" lineClamp={2}>
            {tenant.description}
          </Text>
        )}
        <Box pt={8} mt="auto">
          {/* In the restaurant's accent colour, with the text colour that contrasts with it. */}
          <Button component="span" size="md" h={44} color={tenant.brandColor ?? undefined} autoContrast>
            {t('home.reserve')}
          </Button>
        </Box>
      </Stack>
    </Card>
  )
}

/** The restaurant's logo on a small white plate, so it stands out on any photo or colour. */
function LogoBadge({ src, height }: { src: string; height: number }) {
  return (
    <Box p={8} bg="white" style={{ borderRadius: 'var(--mantine-radius-md)', boxShadow: 'var(--mantine-shadow-sm)' }}>
      <Image src={src} alt="" h={height} w="auto" maw={height * 2.5} fit="contain" loading="lazy" />
    </Box>
  )
}

/** A card while the restaurants load, in the format of RestaurantCard. */
function CardSkeleton() {
  return (
    <Card padding={24}>
      <Card.Section>
        <AspectRatio ratio={16 / 9}>
          <Skeleton radius={0} />
        </AspectRatio>
      </Card.Section>
      <Stack gap={8} pt={24}>
        <Skeleton h={24} w="60%" />
        <Skeleton h={16} w="30%" />
        <Skeleton h={16} />
        <Skeleton h={16} w="80%" />
        <Skeleton h={44} w={160} mt={8} />
      </Stack>
    </Card>
  )
}
