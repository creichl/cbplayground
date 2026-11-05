import {
  Alert,
  Box,
  Button,
  Card,
  CheckIcon,
  ColorInput,
  ColorSwatch,
  Grid,
  Group,
  isLightColor,
  Radio,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '../api/auth.ts'
import {
  type Branding,
  brandingErrorMessage,
  brandingImageTypes,
  type FontStyle,
  fontStyles,
  isValidBrandColor,
  maxCoverBytes,
  maxLogoBytes,
  type TableStyle,
  tableStyles,
  type ThemeMode,
  useBranding,
  useDeleteBrandingImage,
  useSaveBranding,
  useUploadBrandingImage,
} from '../api/branding.ts'
import { useProfile } from '../api/profile.ts'
import { backgrounds, colorSchemeOf, contrastRatio, fontPairs, fontStack, loadFonts } from '../brandTheme.ts'
import { BrandingImageUpload } from '../components/BrandingImageUpload.tsx'
import { BrandingPreview } from '../components/BrandingPreview.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { GalleryManager } from '../components/GalleryManager.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

/** Suggested accent colours, from calm to warm; the first is the platform's own colour. */
const suggestedColors = ['#127c6e', '#1f5f8b', '#2f4858', '#5a7d3a', '#8a9a5b', '#c9a96e', '#d08c36', '#b5523b', '#8b1e3f', '#6a4c93']

/** Below this contrast of the accent colour to the page's background, the page warns (WCAG for graphics and large text). */
const minContrast = 3

/**
 * Admin page "Appearance": accent colour, light or dark, font pair, the look of the tables on the guest's plan, logo, cover
 * image and photo gallery of the restaurant's guest pages, with a live preview of the unsaved state next to the form (below it on phones).
 */
export function BrandingPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('branding.title'))
  const branding = useBranding()
  const profile = useProfile()
  const tenant = useCurrentUser().data?.tenant ?? null

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2}>{t('branding.title')}</Title>
          <Text c="dimmed">{t('branding.subtitle')}</Text>
        </Stack>
        {tenant !== null && (
          <Button component="a" href={`/r/${tenant.slug}`} target="_blank" rel="noopener" variant="light">
            {t('branding.viewBookingPage')}
          </Button>
        )}
      </Group>

      {branding.isPending || tenant === null ? (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Skeleton h={480} radius="md" />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Skeleton h={360} radius="md" />
          </Grid.Col>
        </Grid>
      ) : branding.isError ? (
        <ErrorAlert error={branding.error} onRetry={() => void branding.refetch()} />
      ) : (
        <BrandingForm branding={branding.data} name={tenant.name} slug={tenant.slug} city={profile.data?.city ?? null} />
      )}
    </Stack>
  )
}

function BrandingForm({ branding, name, slug, city }: { branding: Branding; name: string; slug: string; city: string | null }) {
  const { t, i18n } = useTranslation()
  const [color, setColor] = useState(branding.brandColor ?? '')
  const [themeMode, setThemeMode] = useState<ThemeMode>(branding.themeMode)
  const [fontStyle, setFontStyle] = useState<FontStyle>(branding.fontStyle)
  const [tableStyle, setTableStyle] = useState<TableStyle>(branding.tableStyle)
  const save = useSaveBranding()
  const uploadLogo = useUploadBrandingImage('logo')
  const uploadCover = useUploadBrandingImage('cover')
  const deleteLogo = useDeleteBrandingImage('logo')
  const deleteCover = useDeleteBrandingImage('cover')

  // Every font card shows its own fonts.
  useEffect(() => fontStyles.forEach((style) => void loadFonts(style)), [])

  const trimmedColor = color.trim()
  const colorValid = trimmedColor === '' || isValidBrandColor(trimmedColor)
  // While a colour is being typed, the preview keeps the saved one.
  const previewColor = trimmedColor === '' ? null : colorValid ? trimmedColor : branding.brandColor
  const contrast = trimmedColor !== '' && colorValid ? contrastRatio(trimmedColor, backgrounds[colorSchemeOf(themeMode)]) : null
  const dirty =
    (branding.brandColor ?? '') !== trimmedColor.toLowerCase() ||
    branding.themeMode !== themeMode ||
    branding.fontStyle !== fontStyle ||
    branding.tableStyle !== tableStyle

  function upload(image: 'logo' | 'cover', file: File) {
    const maxBytes = image === 'logo' ? maxLogoBytes : maxCoverBytes
    if (!brandingImageTypes.includes(file.type)) {
      notifications.show({ color: 'red', title: t('errors.title'), message: t('branding.errors.imageTypeInvalid') })
      return
    }
    if (file.size > maxBytes) {
      notifications.show({
        color: 'red',
        title: t('errors.title'),
        message: t(image === 'logo' ? 'branding.errors.logoTooLarge' : 'branding.errors.coverTooLarge'),
      })
      return
    }
    ;(image === 'logo' ? uploadLogo : uploadCover).mutate(file, {
      onSuccess: () => notifications.show({ color: 'green', message: t(`branding.${image}.saved`) }),
      onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: brandingErrorMessage(error, t) }),
    })
  }

  function remove(image: 'logo' | 'cover') {
    ;(image === 'logo' ? deleteLogo : deleteCover).mutate(undefined, {
      onSuccess: () => notifications.show({ color: 'green', message: t(`branding.${image}.removed`) }),
      onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: brandingErrorMessage(error, t) }),
    })
  }

  function submit() {
    if (!colorValid) {
      return
    }
    save.mutate(
      { brandColor: trimmedColor === '' ? null : trimmedColor, themeMode, fontStyle, tableStyle },
      {
        onSuccess: (saved) => {
          setColor(saved.brandColor ?? '')
          notifications.show({ color: 'green', message: t('branding.saved') })
        },
      },
    )
  }

  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Stack gap="lg">
          <Card>
            <Stack gap="md">
              <Stack gap={4}>
                <Title order={3}>{t('branding.color.title')}</Title>
                <Text c="dimmed" size="sm">
                  {t('branding.color.description')}
                </Text>
              </Stack>
              <Group gap="xs" role="group" aria-label={t('branding.color.suggestions')}>
                {suggestedColors.map((suggestion) => {
                  const selected = suggestion === trimmedColor.toLowerCase()
                  return (
                    <ColorSwatch
                      key={suggestion}
                      component="button"
                      type="button"
                      color={suggestion}
                      size={32}
                      aria-label={suggestion}
                      aria-pressed={selected}
                      onClick={() => setColor(suggestion)}
                      style={{ cursor: 'pointer' }}
                    >
                      {selected && <CheckIcon size={12} color={isLightColor(suggestion) ? 'black' : 'white'} />}
                    </ColorSwatch>
                  )
                })}
              </Group>
              <Group gap="sm" align="flex-start">
                <ColorInput
                  label={t('branding.color.label')}
                  placeholder={t('branding.color.placeholder')}
                  format="hex"
                  withEyeDropper={false}
                  value={color}
                  onChange={setColor}
                  error={colorValid ? undefined : t('branding.color.invalid')}
                  w={220}
                />
                <Button variant="default" mt={25} disabled={trimmedColor === ''} onClick={() => setColor('')}>
                  {t('branding.color.reset')}
                </Button>
              </Group>
              {contrast !== null && contrast < minContrast && (
                <Alert color="yellow" variant="light">
                  {t(themeMode === 'Dark' ? 'branding.color.lowContrastDark' : 'branding.color.lowContrastLight', {
                    ratio: new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }).format(contrast),
                    minimum: minContrast,
                  })}
                </Alert>
              )}
            </Stack>
          </Card>

          <Card>
            <Stack gap="md">
              <Stack gap={4}>
                <Title order={3}>{t('branding.mode.title')}</Title>
                <Text c="dimmed" size="sm">
                  {t('branding.mode.description')}
                </Text>
              </Stack>
              <SegmentedControl
                aria-label={t('branding.mode.title')}
                value={themeMode}
                onChange={(value) => setThemeMode(value as ThemeMode)}
                data={[
                  { value: 'Light', label: t('branding.mode.light') },
                  { value: 'Dark', label: t('branding.mode.dark') },
                ]}
                w={{ base: '100%', xs: 280 }}
              />
            </Stack>
          </Card>

          <Card>
            <Radio.Group
              value={fontStyle}
              onChange={(value) => setFontStyle(value as FontStyle)}
              label={<Title order={3}>{t('branding.font.title')}</Title>}
              description={t('branding.font.description')}
            >
              <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="sm">
                {fontStyles.map((style) => (
                  <Radio.Card key={style} value={style} radius="md" p="md">
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <Radio.Indicator mt={2} />
                      <Stack gap={4} miw={0}>
                        <Text fw={600} size="sm">
                          {t(`branding.font.styles.${style}`)}
                          <Text component="span" c="dimmed" size="xs" fw={400}>
                            {' · '}
                            {fontPairs[style].heading === fontPairs[style].body
                              ? fontPairs[style].heading
                              : `${fontPairs[style].heading} / ${fontPairs[style].body}`}
                          </Text>
                        </Text>
                        <Text ff={fontStack(fontPairs[style].heading)} fw={fontPairs[style].headingWeight} size="xl" lh={1.2} truncate>
                          {name}
                        </Text>
                        <Text ff={fontStack(fontPairs[style].body)} size="sm">
                          {t('branding.font.sample')}
                        </Text>
                      </Stack>
                    </Group>
                  </Radio.Card>
                ))}
              </SimpleGrid>
            </Radio.Group>
          </Card>

          <Card>
            <Radio.Group
              value={tableStyle}
              onChange={(value) => setTableStyle(value as TableStyle)}
              label={<Title order={3}>{t('branding.tables.title')}</Title>}
              description={t('branding.tables.description')}
            >
              <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="sm">
                {tableStyles.map((style) => (
                  <Radio.Card key={style} value={style} radius="md" p="md">
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <Radio.Indicator mt={2} />
                      <Stack gap={4} miw={0}>
                        <Text fw={600} size="sm">
                          {t(`branding.tables.styles.${style}`)}
                        </Text>
                        <Text c="dimmed" size="sm">
                          {t(`branding.tables.descriptions.${style}`)}
                        </Text>
                      </Stack>
                    </Group>
                  </Radio.Card>
                ))}
              </SimpleGrid>
            </Radio.Group>
          </Card>

          <Card>
            <Stack gap="md">
              <Title order={3}>{t('branding.logo.title')}</Title>
              <BrandingImageUpload
                image="logo"
                imageUrl={branding.logoUrl}
                onFile={(file) => upload('logo', file)}
                onRemove={() => remove('logo')}
                uploading={uploadLogo.isPending}
                removing={deleteLogo.isPending}
              />
            </Stack>
          </Card>

          <Card>
            <Stack gap="md">
              <Title order={3}>{t('branding.cover.title')}</Title>
              <BrandingImageUpload
                image="cover"
                imageUrl={branding.coverUrl}
                onFile={(file) => upload('cover', file)}
                onRemove={() => remove('cover')}
                uploading={uploadCover.isPending}
                removing={deleteCover.isPending}
              />
            </Stack>
          </Card>

          <Card>
            <GalleryManager slug={slug} />
          </Card>

          {save.isError && (
            <Alert color="red" variant="light" title={t('branding.errors.title')}>
              {brandingErrorMessage(save.error, t)}
            </Alert>
          )}

          <Stack gap={4}>
            <Group>
              <Button onClick={submit} loading={save.isPending} disabled={!colorValid || !dirty}>
                {t('branding.save')}
              </Button>
            </Group>
            <Text c="dimmed" size="xs">
              {t('branding.imagesSavedRightAway')}
            </Text>
          </Stack>
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 5 }}>
        <Box pos="sticky" top={80}>
          <Stack gap="xs">
            <Stack gap={0}>
              <Title order={3}>{t('branding.preview.title')}</Title>
              <Text c="dimmed" size="sm">
                {t('branding.preview.hint')}
              </Text>
            </Stack>
            <BrandingPreview
              name={name}
              city={city}
              brandStyle={{ brandColor: previewColor, themeMode, fontStyle }}
              tableStyle={tableStyle}
              logoUrl={branding.logoUrl}
              coverUrl={branding.coverUrl}
            />
          </Stack>
        </Box>
      </Grid.Col>
    </Grid>
  )
}
