import { Box, Container, Skeleton, Stack, Text, Title, useMantineColorScheme } from '@mantine/core'
import { use, useState } from 'react'
import { Photo } from '../Photo.tsx'
import { contentWidth, HeroContext } from './layout.ts'

type RestaurantHeaderProps = {
  name: string
  city: string | null
  coverUrl: string | null
  /** One or two short facts after the city, e.g. "Open today until 24:00". */
  facts?: string[]
  /** "page": the booking page, about half the screen high; "preview": a fixed height. */
  size?: 'page' | 'preview'
}

/** The heights of the cover image; without one, the band is lower. */
const heights = {
  page: { cover: { base: '40dvh', md: '50dvh' }, coverMin: { base: 240, md: 360 }, band: { base: 200, md: 240 } },
  preview: { cover: { base: 200, md: 200 }, coverMin: { base: 200, md: 200 }, band: { base: 136, md: 136 } },
} as const

/**
 * The top of the restaurant's guest pages, in the full width and behind the transparent header: the cover image (cropped to
 * fit, loaded first, fading in on the band's colour) with a gradient for legibility, on it the name, the city and a fact or
 * two. Without cover image a calm band in the accent colour, in the dark mode almost black; a cover image that cannot be
 * loaded shows the band in the cover image's height, so nothing jumps. The logo is not repeated here: it is in the header.
 * Used inside BrandTheme.
 */
export function RestaurantHeader({ name, city, coverUrl, facts = [], size = 'page' }: RestaurantHeaderProps) {
  const dark = useMantineColorScheme().colorScheme === 'dark'
  const registerHero = use(HeroContext)
  const height = heights[size]
  const details = [city, ...facts].filter((part) => part !== null && part !== '')
  const [failedCover, setFailedCover] = useState<string | null>(null)
  const withCover = coverUrl !== null && failedCover !== coverUrl
  const band = dark ? 'var(--mantine-color-dark-9)' : 'var(--mantine-primary-color-filled)'

  return (
    <Box
      ref={size === 'preview' ? undefined : registerHero}
      pos="relative"
      h={coverUrl !== null ? height.cover : height.band}
      mih={coverUrl !== null ? height.coverMin : height.band}
      mah={coverUrl !== null ? 560 : undefined}
      bg={band}
      c={withCover || dark ? 'white' : 'var(--mantine-primary-color-contrast)'}
      style={{ display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}
    >
      {withCover && (
        <>
          <Box pos="absolute" inset={0}>
            {/* Only a picture of the place: the name below says what it is. The first thing on the page, so not lazy. */}
            <Photo src={coverUrl} alt="" placeholder={band} fallback={null} priority onError={() => setFailedCover(coverUrl)} />
          </Box>
          <Box
            aria-hidden="true"
            pos="absolute"
            inset={0}
            style={{
              background:
                'linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.45) 40%, rgba(0, 0, 0, 0) 70%), linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0) 96px)',
            }}
          />
        </>
      )}
      <Container size={contentWidth} w="100%" pos="relative" pb={size === 'preview' ? 16 : { base: 24, md: 32 }}>
        <Stack gap={8}>
          <Title
            order={1}
            fz={size === 'page' ? { base: 32, md: 48 } : { base: 28, md: 32 }}
            lh={1.15}
            style={{ overflowWrap: 'anywhere', textWrap: 'balance' }}
          >
            {name}
          </Title>
          {details.length > 0 && (
            <Text size="lg" fw={500}>
              {details.join(' · ')}
            </Text>
          )}
        </Stack>
      </Container>
    </Box>
  )
}

/** The cover image while the restaurant loads, in the height of the page's cover image, so nothing jumps. */
export function RestaurantHeaderSkeleton({ size = 'page' }: Pick<RestaurantHeaderProps, 'size'>) {
  const registerHero = use(HeroContext)
  return <Skeleton ref={registerHero} h={heights[size].cover} mih={heights[size].coverMin} mah={560} radius={0} />
}
