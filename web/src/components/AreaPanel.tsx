import { Button, Divider, Group, Input, Modal, NumberInput, Slider, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import {
  type Area,
  floorPlanTypes,
  maxFloorPlanBytes,
  useArrangeTables,
  useDeleteArea,
  useDeleteAreaPhoto,
  useUpdateArea,
  useUploadAreaPhoto,
} from '../api/areas.ts'
import { errorCode, errorMessage } from '../api/areaErrors.ts'
import { AreaPhotoUpload } from './AreaPhotoUpload.tsx'
import { maxWidthMeters, minWidthMeters, realSizeScale } from './floor-plan/layout.ts'

type AreaPanelProps = {
  area: Area
  tableCount: number
  canMoveLeft: boolean
  canMoveRight: boolean
  onMove: (direction: -1 | 1) => void
  moving: boolean
  onDeleted: () => void
  /** The table size and the real width as set, before they are saved, so the plan shows them right away. */
  onPreviewChange: (preview: { tableScale: number; widthMeters: number | null }) => void
  /** Called after the tables have been arranged anew. */
  onArranged: () => void
}

/** The table size in steps of 5 % from 50 to 200 %, as the API accepts it. */
const tableScaleMarks = [50, 100, 150, 200].map((value) => ({ value, label: `${value} %` }))

/** The longest description of an area, as the API accepts it. */
const maxDescriptionLength = 200

/** The real width as typed: a number in the range, or null when the field is empty or invalid. */
function widthOf(value: number | string) {
  return typeof value === 'number' && value >= minWidthMeters && value <= maxWidthMeters ? value : null
}

/**
 * Settings of the selected area: name, description, online booking and quota, the real width of its plan or else the table
 * size, its photo, the automatic arrangement of its tables, order and deletion. With a real width the tables have their real
 * size, so the table size follows from it instead of the slider.
 */
export function AreaPanel({
  area,
  tableCount,
  canMoveLeft,
  canMoveRight,
  onMove,
  moving,
  onDeleted,
  onPreviewChange,
  onArranged,
}: AreaPanelProps) {
  const { t } = useTranslation()
  const updateArea = useUpdateArea()
  const deleteArea = useDeleteArea()
  const arrangeTables = useArrangeTables()
  const uploadPhoto = useUploadAreaPhoto()
  const deletePhoto = useDeleteAreaPhoto()
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure()
  const [arrangeOpened, { open: openArrange, close: closeArrange }] = useDisclosure()

  const form = useForm({
    initialValues: {
      name: area.name,
      description: area.description ?? '',
      onlineBookingEnabled: area.onlineBookingEnabled,
      onlineCapacityPercent: area.onlineCapacityPercent as number | string,
      // Derived from a real width it may lie outside the slider's 50–200 %; when the width is removed, the slider starts in it.
      tableScale: Math.min(200, Math.max(50, area.tableScale)),
      widthMeters: (area.widthMeters ?? '') as number | string,
    },
    onValuesChange: (values) => {
      const widthMeters = widthOf(values.widthMeters)
      onPreviewChange({ tableScale: widthMeters === null ? values.tableScale : realSizeScale(widthMeters), widthMeters })
    },
    validate: {
      name: (value) => {
        const name = value.trim()
        return name.length === 0 || name.length > 100 ? t('areas.errors.areaNameInvalid') : null
      },
      description: (value) => (value.trim().length > maxDescriptionLength ? t('areas.errors.descriptionInvalid') : null),
      onlineCapacityPercent: (value) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? null : t('areas.errors.percentInvalid'),
      widthMeters: (value) => (value === '' || widthOf(value) !== null ? null : t('areas.errors.widthInvalid')),
    },
  })
  const widthMeters = widthOf(form.values.widthMeters)
  // The table size the plan shows: from the real width, or as set with the slider.
  const tableScale = widthMeters === null ? form.values.tableScale : realSizeScale(widthMeters)
  const sizeChanged = tableScale !== area.tableScale || widthMeters !== area.widthMeters

  function uploadAreaPhoto(file: File) {
    if (!floorPlanTypes.includes(file.type)) {
      notifications.show({ color: 'red', title: t('errors.title'), message: t('areas.errors.floorPlanTypeInvalid') })
      return
    }
    if (file.size > maxFloorPlanBytes) {
      notifications.show({ color: 'red', title: t('errors.title'), message: t('areas.errors.floorPlanTooLarge') })
      return
    }
    uploadPhoto.mutate(
      { areaId: area.id, file },
      {
        onSuccess: () => notifications.show({ color: 'brand', message: t('areas.photo.saved') }),
        onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }),
      },
    )
  }

  return (
    <Stack gap="md">
      <form
        onSubmit={form.onSubmit((values) =>
          updateArea.mutate(
            {
              id: area.id,
              name: values.name.trim(),
              onlineBookingEnabled: values.onlineBookingEnabled,
              onlineCapacityPercent: Number(values.onlineCapacityPercent),
              // With a real width the API derives the table scale; the slider's value is only sent without one.
              ...(widthOf(values.widthMeters) === null ? { tableScale: values.tableScale } : {}),
              widthMeters: widthOf(values.widthMeters),
              description: values.description.trim(),
            },
            {
              onSuccess: () => notifications.show({ color: 'brand', message: t('areas.area.saved') }),
              onError: (error) => {
                const code = errorCode(error)
                if (code === 'area_name_invalid') {
                  form.setFieldError('name', errorMessage(error, t))
                } else if (code === 'online_capacity_percent_invalid') {
                  form.setFieldError('onlineCapacityPercent', errorMessage(error, t))
                } else if (code === 'invalid_area_description') {
                  form.setFieldError('description', errorMessage(error, t))
                } else if (code === 'table_scale_invalid') {
                  form.setFieldError('tableScale', errorMessage(error, t))
                } else if (code === 'area_width_invalid') {
                  form.setFieldError('widthMeters', errorMessage(error, t))
                } else {
                  notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) })
                }
              },
            },
          ),
        )}
      >
        <Stack gap="md">
          <Title order={4}>{t('areas.area.title')}</Title>
          <TextInput label={t('areas.area.name')} maxLength={100} {...form.getInputProps('name')} />
          <Stack gap={4}>
            <Textarea
              label={t('areas.area.description')}
              description={t('areas.area.descriptionHint')}
              placeholder={t('areas.area.descriptionPlaceholder')}
              autosize
              minRows={2}
              maxRows={5}
              maxLength={maxDescriptionLength}
              {...form.getInputProps('description')}
            />
            <Text size="xs" c="dimmed" ta="right">
              {t('areas.area.descriptionCounter', { length: form.values.description.length, max: maxDescriptionLength })}
            </Text>
          </Stack>
          <Switch
            label={t('areas.area.onlineBookingEnabled')}
            description={t('areas.area.onlineBookingEnabledHint')}
            {...form.getInputProps('onlineBookingEnabled', { type: 'checkbox' })}
          />
          <NumberInput
            label={t('areas.area.onlineCapacityPercent')}
            description={t('areas.area.onlineCapacityPercentHint')}
            min={0}
            max={100}
            allowDecimal={false}
            allowNegative={false}
            suffix={t('areas.area.percentSuffix')}
            disabled={!form.values.onlineBookingEnabled}
            {...form.getInputProps('onlineCapacityPercent')}
          />
          <NumberInput
            label={t('areas.area.widthMeters')}
            description={t(area.floorPlanUrl === null ? 'areas.area.widthMetersHintRoom' : 'areas.area.widthMetersHintImage')}
            min={minWidthMeters}
            max={maxWidthMeters}
            step={0.5}
            decimalScale={1}
            allowNegative={false}
            suffix=" m"
            placeholder={t('areas.area.widthMetersPlaceholder')}
            {...form.getInputProps('widthMeters')}
          />
          {widthMeters !== null ? (
            <Text size="sm" c="dimmed">
              {t('areas.area.tableScaleReal', { percent: tableScale })}
            </Text>
          ) : (
            <Input.Wrapper label={t('areas.area.tableScale')} description={t('areas.area.tableScaleHint')} error={form.errors.tableScale}>
              <Slider
                mt="xs"
                mb="xl"
                min={50}
                max={200}
                step={5}
                marks={tableScaleMarks}
                label={(value) => `${value} %`}
                thumbLabel={t('areas.area.tableScale')}
                value={form.values.tableScale}
                onChange={(value) => form.setFieldValue('tableScale', value)}
              />
            </Input.Wrapper>
          )}
          <Group>
            <Button type="submit" loading={updateArea.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>

      <Divider />

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('areas.photo.title')}
        </Text>
        <Text size="xs" c="dimmed">
          {t('areas.photo.text')}
        </Text>
        <AreaPhotoUpload
          photoUrl={area.photoUrl}
          onFile={uploadAreaPhoto}
          onRemove={() =>
            deletePhoto.mutate(area.id, {
              onSuccess: () => notifications.show({ color: 'brand', message: t('areas.photo.removed') }),
              onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }),
            })
          }
          uploading={uploadPhoto.isPending}
          removing={deletePhoto.isPending}
        />
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('areas.area.arrangeTitle')}
        </Text>
        <Text size="xs" c="dimmed">
          {sizeChanged ? t('areas.area.arrangeSaveFirst') : t('areas.area.arrangeHint')}
        </Text>
        <Group>
          <Button variant="default" size="xs" disabled={tableCount === 0 || sizeChanged} onClick={openArrange}>
            {t('areas.area.arrange')}
          </Button>
        </Group>
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('areas.area.order')}
        </Text>
        <Group gap="xs">
          <Button variant="default" size="xs" disabled={!canMoveLeft} loading={moving} onClick={() => onMove(-1)}>
            {t('areas.area.moveLeft')}
          </Button>
          <Button variant="default" size="xs" disabled={!canMoveRight} loading={moving} onClick={() => onMove(1)}>
            {t('areas.area.moveRight')}
          </Button>
        </Group>
      </Stack>

      <Divider />

      <Group>
        <Button variant="subtle" color="red" onClick={openDelete}>
          {t('areas.area.delete')}
        </Button>
      </Group>

      <Modal opened={arrangeOpened} onClose={closeArrange} title={t('areas.area.arrangeConfirmTitle', { name: area.name })}>
        <Stack gap="md">
          <Text size="sm">{t('areas.area.arrangeConfirmText')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeArrange}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={arrangeTables.isPending}
              onClick={() =>
                arrangeTables.mutate(area.id, {
                  onSuccess: () => {
                    closeArrange()
                    onArranged()
                    notifications.show({ color: 'brand', message: t('areas.area.arranged') })
                  },
                  onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }),
                })
              }
            >
              {t('areas.area.arrangeConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteOpened} onClose={closeDelete} title={t('areas.area.deleteTitle', { name: area.name })}>
        <Stack gap="md">
          <Text size="sm">{t('areas.area.deleteText', { tables: tableCount })}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDelete}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              loading={deleteArea.isPending}
              onClick={() =>
                deleteArea.mutate(area.id, {
                  onSuccess: () => {
                    closeDelete()
                    onDeleted()
                  },
                  onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }),
                })
              }
            >
              {t('areas.area.deleteConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
