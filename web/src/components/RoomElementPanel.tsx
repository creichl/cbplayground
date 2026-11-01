import { Button, Group, Input, Select, Slider, Stack, Text, TextInput, Title } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoomElement, RoomElementKind, RoomRotation } from '../api/areas.ts'
import {
  aspectRatio,
  clampToRoom,
  maxRoomElementLabelLength,
  roomElementDimensions,
  roomElementDimensionsOf,
  roomElementKinds,
  roomElementSize,
} from './floor-plan/layout.ts'
import { RoomElementIcon } from './floor-plan/RoomElementShape.tsx'

type RoomElementPanelProps = {
  element: RoomElement
  onChange: (element: RoomElement) => void
  onDelete: () => void
  onClose: () => void
}

/** The smallest length and depth of an element, in plan widths. */
const minDimension = 0.02

/** Sizes are shown as a share of the room's width. */
const percent = (value: number) => `${Math.round(value * 100)} %`

/**
 * An element with this kind, length, depth and rotation at about its position: the size as the API stores it, at most the
 * room (the plan is 1 wide and 1 / aspectRatio high in plan widths), the centre so that the element lies in the room.
 */
function placed(element: RoomElement, kind: RoomElementKind, length: number, depth: number, rotation: RoomRotation): RoomElement {
  const upright = rotation === 90 || rotation === 270
  const { width, height } = roomElementSize(
    Math.min(length, upright ? 1 / aspectRatio : 1),
    Math.min(depth, upright ? 1 : 1 / aspectRatio),
    rotation,
  )
  return {
    ...element,
    kind,
    rotation,
    width,
    height,
    posX: clampToRoom(element.posX, width),
    posY: clampToRoom(element.posY, height),
  }
}

/**
 * The selected room element: its kind, length along the wall and depth (sliders), "Turn by 90°", its label and deletion.
 * Every change shows in the plan right away and is saved with the room.
 */
export function RoomElementPanel({ element, onChange, onDelete, onClose }: RoomElementPanelProps) {
  const { t } = useTranslation()
  const [label, setLabel] = useState(element.label ?? '')
  const { length, depth } = roomElementDimensionsOf(element)
  const upright = element.rotation === 90 || element.rotation === 270
  const labelMissing = element.kind === 'Label' && label.trim() === ''

  function changeKind(kind: RoomElementKind) {
    const size = roomElementDimensions[kind]
    const next = placed(element, kind, size.length, size.depth, element.rotation)
    // A label element needs a text.
    if (kind === 'Label' && next.label === null) {
      const text = t('areas.room.defaultLabel')
      setLabel(text)
      next.label = text
    }
    onChange(next)
  }

  function changeLabel(value: string) {
    setLabel(value)
    const trimmed = value.trim()
    // A label element keeps its last text while the field is empty; the field shows why.
    if (trimmed === '' && element.kind === 'Label') {
      return
    }
    onChange({ ...element, label: trimmed === '' ? null : trimmed })
  }

  return (
    <Stack gap="md">
      <Title order={4}>{t(`areas.room.kinds.${element.kind}`)}</Title>
      <Select
        label={t('areas.room.kind')}
        data={roomElementKinds.map((kind) => ({ value: kind, label: t(`areas.room.kinds.${kind}`) }))}
        value={element.kind}
        onChange={(value) => value !== null && value !== element.kind && changeKind(value as RoomElementKind)}
        allowDeselect={false}
        leftSection={<RoomElementIcon kind={element.kind} size={20} />}
        renderOption={({ option }) => (
          <Group gap="sm" wrap="nowrap">
            <RoomElementIcon kind={option.value as RoomElementKind} size={22} />
            <Text size="sm">{option.label}</Text>
          </Group>
        )}
      />
      <Input.Wrapper label={t('areas.room.length')} description={t('areas.room.lengthHint')}>
        <Slider
          mt="xs"
          min={minDimension}
          max={upright ? 0.66 : 1}
          step={0.01}
          label={percent}
          thumbLabel={t('areas.room.length')}
          value={length}
          onChange={(value) => onChange(placed(element, element.kind, value, depth, element.rotation))}
        />
      </Input.Wrapper>
      <Input.Wrapper label={t('areas.room.depth')} description={t('areas.room.depthHint')}>
        <Slider
          mt="xs"
          min={minDimension}
          max={upright ? 1 : 0.66}
          step={0.01}
          label={percent}
          thumbLabel={t('areas.room.depth')}
          value={depth}
          onChange={(value) => onChange(placed(element, element.kind, length, value, element.rotation))}
        />
      </Input.Wrapper>
      <Group>
        <Button
          variant="default"
          size="xs"
          onClick={() => onChange(placed(element, element.kind, length, depth, ((element.rotation + 90) % 360) as RoomRotation))}
        >
          {t('areas.room.rotate')}
        </Button>
      </Group>
      <TextInput
        label={t('areas.room.label')}
        description={t('areas.room.labelHint')}
        maxLength={maxRoomElementLabelLength}
        value={label}
        onChange={(event) => changeLabel(event.currentTarget.value)}
        error={labelMissing ? t('areas.errors.roomElementLabelInvalid') : undefined}
      />
      <Group justify="space-between">
        <Button variant="subtle" color="red" onClick={onDelete}>
          {t('areas.room.delete')}
        </Button>
        <Button variant="default" onClick={onClose}>
          {t('common.close')}
        </Button>
      </Group>
    </Stack>
  )
}
