import { Button, FileButton, Group, Image, Paper, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { brandingImageTypes } from '../api/branding.ts'

type BrandingImageUploadProps = {
  /** Which image, for the texts under "branding.logo" or "branding.cover". */
  image: 'logo' | 'cover'
  /** The current image; null when there is none. */
  imageUrl: string | null
  onFile: (file: File) => void
  onRemove: () => void
  uploading: boolean
  removing: boolean
}

/**
 * Logo or cover image of the branding page, like the floor plan's drop zone: without image, drop an image here or choose
 * one; with an image, its preview with "Replace" and "Remove". A dropped image replaces the current one, too.
 */
export function BrandingImageUpload({ image, imageUrl, onFile, onRemove, uploading, removing }: BrandingImageUploadProps) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)

  return (
    <Stack gap="sm">
      <Paper
        p="md"
        radius="md"
        bg={dragOver ? 'brand.0' : 'gray.0'}
        style={{ border: `2px dashed var(--mantine-color-${dragOver ? 'brand-6' : 'gray-4'})` }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          const file = event.dataTransfer.files[0]
          if (file !== undefined) {
            onFile(file)
          }
        }}
      >
        {imageUrl !== null ? (
          <Image
            src={imageUrl}
            alt={t(`branding.${image}.alt`)}
            h={image === 'logo' ? 96 : 180}
            fit={image === 'logo' ? 'contain' : 'cover'}
            radius="sm"
          />
        ) : (
          <Stack align="center" gap="xs" py="lg">
            <Title order={4}>{t(`branding.${image}.emptyTitle`)}</Title>
            <Text c="dimmed" ta="center" size="sm">
              {t('branding.dropHint')}
            </Text>
          </Stack>
        )}
      </Paper>
      <Group gap="sm">
        <FileButton onChange={(file) => file !== null && onFile(file)} accept={brandingImageTypes.join(',')}>
          {(props) => (
            <Button {...props} variant={imageUrl === null ? 'filled' : 'default'} loading={uploading}>
              {imageUrl === null ? t(`branding.${image}.choose`) : t(`branding.${image}.replace`)}
            </Button>
          )}
        </FileButton>
        {imageUrl !== null && (
          <Button variant="subtle" color="red" onClick={onRemove} loading={removing}>
            {t(`branding.${image}.remove`)}
          </Button>
        )}
      </Group>
      <Text c="dimmed" size="xs">
        {t(`branding.${image}.hint`)}
      </Text>
    </Stack>
  )
}
