import { Button, Divider, Group, Modal, NumberInput, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { type Area, useDeleteArea, useUpdateArea } from '../api/areas.ts'
import { errorCode, errorMessage } from '../api/areaErrors.ts'

type AreaPanelProps = {
  area: Area
  tableCount: number
  canMoveLeft: boolean
  canMoveRight: boolean
  onMove: (direction: -1 | 1) => void
  moving: boolean
  onDeleted: () => void
}

/** Settings of the selected area: name, online booking and quota, order and deletion. */
export function AreaPanel({ area, tableCount, canMoveLeft, canMoveRight, onMove, moving, onDeleted }: AreaPanelProps) {
  const { t } = useTranslation()
  const updateArea = useUpdateArea()
  const deleteArea = useDeleteArea()
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure()

  const form = useForm({
    initialValues: {
      name: area.name,
      onlineBookingEnabled: area.onlineBookingEnabled,
      onlineCapacityPercent: area.onlineCapacityPercent as number | string,
    },
    validate: {
      name: (value) => {
        const name = value.trim()
        return name.length === 0 || name.length > 100 ? t('areas.errors.areaNameInvalid') : null
      },
      onlineCapacityPercent: (value) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? null : t('areas.errors.percentInvalid'),
    },
  })

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
            },
            {
              onSuccess: () => notifications.show({ color: 'brand', message: t('areas.area.saved') }),
              onError: (error) => {
                const code = errorCode(error)
                if (code === 'area_name_invalid') {
                  form.setFieldError('name', errorMessage(error, t))
                } else if (code === 'online_capacity_percent_invalid') {
                  form.setFieldError('onlineCapacityPercent', errorMessage(error, t))
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
            suffix=" %"
            disabled={!form.values.onlineBookingEnabled}
            {...form.getInputProps('onlineCapacityPercent')}
          />
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
