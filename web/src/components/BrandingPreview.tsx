import { Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { TableStyle } from '../api/branding.ts'
import type { BrandStyle } from '../brandTheme.ts'
import { RestaurantHeader } from './booking/RestaurantHeader.tsx'
import { tableLook } from './booking/tableLooks.ts'
import { HatchPattern } from './booking/TablePicker.tsx'
import { BrandLogo } from './BrandLogo.tsx'
import { BrandTheme } from './BrandTheme.tsx'
import { Room } from './floor-plan/Room.tsx'
import { TableShape } from './floor-plan/TableShape.tsx'

type BrandingPreviewProps = {
  name: string
  city: string | null
  brandStyle: BrandStyle
  logoUrl: string | null
  coverUrl: string | null
  /** How the sample tables look. */
  tableStyle: TableStyle
}

/**
 * The top of the booking page in a given branding, saved or not: the header with logo (as on the booking page, a logo with
 * its own background on a surface in that colour) or name, the cover image with name
 * and city, sample buttons and, on a strip of drawn floor, a free, a chosen and a sample table that is not available in the
 * table style.
 */
export function BrandingPreview({ name, city, brandStyle, logoUrl, coverUrl, tableStyle }: BrandingPreviewProps) {
  const { t } = useTranslation()
  const dark = brandStyle.themeMode === 'Dark'

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
            <Box pos="relative" style={{ aspectRatio: '3 / 1', borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden' }}>
              <HatchPattern />
              <Box pos="absolute" inset={0}>
                <Room roomStyle="Indoor" elements={[]} dark={dark} viewBox="0 50 300 100" />
              </Box>
              <TableShape number="1" seats={4} shape="Square" rotation={0} posX={0.18} posY={0.5} tableScale={200} dark={dark} {...tableLook(tableStyle, 'free')} />
              <TableShape number="2" seats={4} shape="Round" rotation={0} posX={0.5} posY={0.5} tableScale={200} dark={dark} {...tableLook(tableStyle, 'selected')} />
              <TableShape number="3" seats={2} shape="Square" rotation={0} posX={0.82} posY={0.5} tableScale={200} dark={dark} {...tableLook(tableStyle, 'unavailable')} />
            </Box>
            <SimpleGrid cols={3}>
              <Text size="xs" c="dimmed" ta="center">
                {t('booking.table.legend.free')}
              </Text>
              <Text size="xs" c="dimmed" ta="center">
                {t('booking.table.legend.selected')}
              </Text>
              <Text size="xs" c="dimmed" ta="center">
                {t('booking.table.legend.unavailable')}
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
