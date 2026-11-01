import { Box, Container, Group, Image, Stack, Text, Title, useMantineColorScheme } from '@mantine/core'

type RestaurantHeaderProps = {
  name: string
  city: string | null
  logoUrl: string | null
  coverUrl: string | null
}

/**
 * The top of the restaurant's guest pages, in the full width: the cover image with a gradient for legibility, on it the
 * logo, the name and the city. Without cover image a calm band in the accent colour, in the dark mode almost black.
 * Without logo only the name, in the heading font. Used inside BrandTheme.
 */
export function RestaurantHeader({ name, city, logoUrl, coverUrl }: RestaurantHeaderProps) {
  const { colorScheme } = useMantineColorScheme()

  const content = (
    <Container size="lg" w="100%">
      <Group gap="md" wrap="nowrap" align="flex-end">
        {logoUrl !== null && (
          <Box
            p={6}
            bg="var(--mantine-color-body)"
            style={{ flexShrink: 0, borderRadius: 'var(--mantine-radius-md)', boxShadow: 'var(--mantine-shadow-sm)' }}
          >
            {/* The name stands next to the logo, so the logo has no text alternative of its own. */}
            <Image src={logoUrl} alt="" h={{ base: 56, sm: 80 }} w="auto" maw={{ base: 120, sm: 200 }} fit="contain" />
          </Box>
        )}
        <Stack gap={2} miw={0}>
          <Title order={1} style={{ overflowWrap: 'anywhere', textWrap: 'balance' }}>
            {name}
          </Title>
          {city !== null && <Text opacity={0.85}>{city}</Text>}
        </Stack>
      </Group>
    </Container>
  )

  if (coverUrl !== null) {
    return (
      <Box
        pos="relative"
        h={{ base: 200, sm: 320 }}
        c="white"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          backgroundImage: `url("${coverUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Box
          aria-hidden="true"
          pos="absolute"
          inset={0}
          style={{ background: 'linear-gradient(to top, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0.35) 45%, rgba(0, 0, 0, 0) 80%)' }}
        />
        <Box pos="relative" w="100%" pb={{ base: 'md', sm: 'xl' }}>
          {content}
        </Box>
      </Box>
    )
  }

  const dark = colorScheme === 'dark'
  return (
    <Box
      py={{ base: 'lg', sm: 'xl' }}
      bg={dark ? 'var(--mantine-color-dark-9)' : 'var(--mantine-primary-color-filled)'}
      c={dark ? 'var(--mantine-color-white)' : 'var(--mantine-primary-color-contrast)'}
    >
      {content}
    </Box>
  )
}
