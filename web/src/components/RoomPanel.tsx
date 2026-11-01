import { Button, Group, Modal, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import type { RoomElementKind, RoomStyle } from '../api/areas.ts'
import { maxRoomElements, roomElementKinds } from './floor-plan/layout.ts'
import { RoomStylePreview } from './floor-plan/Room.tsx'
import { RoomElementIcon } from './floor-plan/RoomElementShape.tsx'

type RoomPanelProps = {
  areaName: string
  roomStyle: RoomStyle
  elementCount: number
  /** Whether a change of the room is waiting to be saved or being saved. */
  saving: boolean
  onStyleChange: (roomStyle: RoomStyle) => void
  onAdd: (kind: RoomElementKind) => void
  /** Replaces elements and table positions by the suggested room; resolves when done, also after a failure. */
  onSuggest: () => Promise<void>
  suggesting: boolean
}

const roomStyles: RoomStyle[] = ['Indoor', 'Terrace', 'Garden', 'Rooftop']

/**
 * The room of an area without floor plan image: its style (floor and boundary), the palette to add elements and the
 * suggested room. Changes are saved on their own, shortly after the last one; the panel shows whether they are saved.
 */
export function RoomPanel({ areaName, roomStyle, elementCount, saving, onStyleChange, onAdd, onSuggest, suggesting }: RoomPanelProps) {
  const { t } = useTranslation()
  const [suggestOpened, { open: openSuggest, close: closeSuggest }] = useDisclosure()
  const full = elementCount >= maxRoomElements

  return (
    <Stack gap="md">
      <Group justify="space-between" align="baseline">
        <Title order={4}>{t('areas.room.title')}</Title>
        <Text size="xs" c="dimmed" aria-live="polite">
          {saving ? t('areas.room.saving') : t('areas.room.saved')}
        </Text>
      </Group>

      <Select
        label={t('areas.room.style')}
        description={t('areas.room.styleHint')}
        data={roomStyles.map((style) => ({ value: style, label: t(`areas.room.styles.${style}`) }))}
        value={roomStyle}
        onChange={(value) => value !== null && onStyleChange(value as RoomStyle)}
        allowDeselect={false}
        maw={420}
        leftSection={<RoomStylePreview roomStyle={roomStyle} size={24} />}
        renderOption={({ option }) => (
          <Group gap="sm" wrap="nowrap">
            <RoomStylePreview roomStyle={option.value as RoomStyle} />
            <Text size="sm">{option.label}</Text>
          </Group>
        )}
      />

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('areas.room.add')}
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing={6} verticalSpacing={6}>
          {roomElementKinds.map((kind) => (
            <Button
              key={kind}
              variant="default"
              size="xs"
              justify="flex-start"
              leftSection={<RoomElementIcon kind={kind} size={20} />}
              disabled={full}
              onClick={() => onAdd(kind)}
            >
              {t(`areas.room.kinds.${kind}`)}
            </Button>
          ))}
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          {full ? t('areas.room.full', { max: maxRoomElements }) : t('areas.room.addHint')}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('areas.room.suggestTitle')}
        </Text>
        <Text size="xs" c="dimmed">
          {t('areas.room.suggestHint')}
        </Text>
        <Group>
          <Button variant="default" size="xs" onClick={openSuggest}>
            {t('areas.room.suggest')}
          </Button>
        </Group>
      </Stack>

      <Modal opened={suggestOpened} onClose={closeSuggest} title={t('areas.room.suggestConfirmTitle', { name: areaName })}>
        <Stack gap="md">
          <Text size="sm">{t('areas.room.suggestConfirmText')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSuggest}>
              {t('common.cancel')}
            </Button>
            <Button loading={suggesting} onClick={() => void onSuggest().then(closeSuggest)}>
              {t('areas.room.suggestConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
