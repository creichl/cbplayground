import { Button, FileButton, Group, Image, Paper, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { floorPlanTypes } from '../api/areas.ts'

type AreaPhotoUploadProps = {
  /** The current photo; null when there is none. */
  photoUrl: string | null
  onFile: (file: File) => void
  onRemove: () => void
  uploading: boolean
  removing: boolean
}

/**
 * The photo of an area, like the logo and cover image on the branding page: without photo, drop an image here or choose
 * one; with a photo, its preview with "Replace" and "Remove". A dropped image replaces the current one, too.
 */
export function AreaPhotoUpload({ photoUrl, onFile, onRemove, uploading, removing }: AreaPhotoUploadProps) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)

  return (
    <Stack gap="sm">
      <Paper
        p="sm"
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
        {photoUrl !== null ? (
          <Image src={photoUrl} alt={t('areas.photo.alt')} h={140} fit="cover" radius="sm" />
        ) : (
          <Stack align="center" gap="xs" py="md">
            <Title order={5}>{t('areas.photo.emptyTitle')}</Title>
            <Text c="dimmed" ta="center" size="sm">
              {t('areas.photo.dropHint')}
            </Text>
          </Stack>
        )}
      </Paper>
      <Group gap="sm">
        <FileButton onChange={(file) => file !== null && onFile(file)} accept={floorPlanTypes.join(',')}>
          {(props) => (
            <Button {...props} size="xs" variant={photoUrl === null ? 'filled' : 'default'} loading={uploading}>
              {photoUrl === null ? t('areas.photo.choose') : t('areas.photo.replace')}
            </Button>
          )}
        </FileButton>
        {photoUrl !== null && (
          <Button size="xs" variant="subtle" color="red" onClick={onRemove} loading={removing}>
            {t('areas.photo.remove')}
          </Button>
        )}
      </Group>
      <Text c="dimmed" size="xs">
        {t('areas.photo.hint')}
      </Text>
    </Stack>
  )
}
