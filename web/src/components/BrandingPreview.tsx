import { Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { BrandStyle } from '../brandTheme.ts'
import { RestaurantHeader } from './booking/RestaurantHeader.tsx'
import { tableLooks } from './booking/tableLooks.ts'
import { BrandLogo } from './BrandLogo.tsx'
import { BrandTheme } from './BrandTheme.tsx'
import { TableShape } from './floor-plan/TableShape.tsx'

type BrandingPreviewProps = {
  name: string
  city: string | null
  brandStyle: BrandStyle
  logoUrl: string | null
  coverUrl: string | null
}

/**
 * The top of the booking page in a given branding, saved or not: the header with logo (as on the booking page, a logo with
 * its own background on a surface in that colour) or name, the cover image with name
 * and city, a sample button and a free and a chosen sample table.
 */
export function BrandingPreview({ name, city, brandStyle, logoUrl, coverUrl }: BrandingPreviewProps) {
  const { t } = useTranslation()
  const dark = brandStyle.themeMode === 'Dark'
  const looks = tableLooks[dark ? 'dark' : 'light']

  return (
    <BrandTheme brandStyle={brandStyle} style={{ borderRadius: 'var(--mantine-radius-md)', overflow: 'hidden' }}>
      {/* Only to look at: its buttons do nothing and are left out of the keyboard and screen reader order. */}
      <div inert>
        <Group h={52} px="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          {logoUrl !== null ? (
            <BrandLogo src={logoUrl} height={32} maxWidth={160} fallback={<HeaderName name={name} />} />
          ) : (
            <HeaderName name={name} />
          )}
        </Group>
        <RestaurantHeader name={name} city={city} coverUrl={coverUrl} size="preview" />
        <Stack gap="md" p="md" bg={dark ? 'var(--mantine-color-body)' : 'var(--mantine-color-gray-0)'}>
          <Group gap="sm">
            <Button>{t('home.reserve')}</Button>
            <Button variant="light">{t('booking.continue')}</Button>
          </Group>
          <Stack gap={4}>
            <Box
              pos="relative"
              style={{
                aspectRatio: '3 / 1',
                borderRadius: 'var(--mantine-radius-sm)',
                backgroundColor: dark ? 'var(--mantine-color-dark-7)' : 'var(--mantine-color-gray-0)',
                boxShadow: `inset 0 0 0 2px var(--mantine-color-${dark ? 'dark-4' : 'gray-3'})`,
              }}
            >
              <TableShape number="1" seats={4} shape="Square" rotation={0} posX={0.25} posY={0.5} tableScale={200} {...looks.free} />
              <TableShape number="2" seats={4} shape="Round" rotation={0} posX={0.75} posY={0.5} tableScale={200} {...looks.selected} />
            </Box>
            <SimpleGrid cols={2}>
              <Text size="xs" c="dimmed" ta="center">
                {t('booking.table.legend.free')}
              </Text>
              <Text size="xs" c="dimmed" ta="center">
                {t('booking.table.legend.selected')}
              </Text>
            </SimpleGrid>
          </Stack>
        </Stack>
      </div>
    </BrandTheme>
  )
}

function HeaderName({ name }: { name: string }) {
  return (
    <Text ff="heading" fw={700} truncate>
      {name}
    </Text>
  )
}
