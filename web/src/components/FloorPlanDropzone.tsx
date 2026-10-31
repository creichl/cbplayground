import { Button, FileButton, Paper, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { floorPlanTypes } from '../api/areas.ts'

type FloorPlanDropzoneProps = {
  onFile: (file: File) => void
  loading: boolean
}

/** Empty state of an area without floor plan: drop an image here or choose one. */
export function FloorPlanDropzone({ onFile, loading }: FloorPlanDropzoneProps) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)

  return (
    <Paper
      p="xl"
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
      <Stack align="center" gap="sm" py="xl">
        <Title order={4}>{t('areas.floorPlan.emptyTitle')}</Title>
        <Text c="dimmed" ta="center" size="sm">
          {t('areas.floorPlan.emptyText')}
        </Text>
        <FileButton onChange={(file) => file !== null && onFile(file)} accept={floorPlanTypes.join(',')}>
          {(props) => (
            <Button {...props} loading={loading}>
              {t('areas.floorPlan.choose')}
            </Button>
          )}
        </FileButton>
        <Text c="dimmed" size="xs">
          {t('areas.floorPlan.hint')}
        </Text>
      </Stack>
    </Paper>
  )
}
