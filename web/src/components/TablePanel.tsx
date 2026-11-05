import { Alert, Button, Group, Input, Modal, NumberInput, SegmentedControl, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { type Table, type TableRotation, type TableShape, useDeleteTable, useUpdateTable } from '../api/areas.ts'
import { errorCode, errorMessage } from '../api/areaErrors.ts'

type TablePanelProps = {
  table: Table
  /** Shape and rotation as chosen, before they are saved, so the plan shows them right away. */
  onPreview: (shape: TableShape, rotation: TableRotation) => void
  onClose: () => void
}

const shapes: TableShape[] = ['Round', 'Square', 'Rectangle']

/**
 * Properties of the selected table: number, seats, the smallest party online, shape and rotation, and its deletion after a
 * confirmation.
 */
export function TablePanel({ table, onPreview, onClose }: TablePanelProps) {
  const { t } = useTranslation()
  const updateTable = useUpdateTable()
  const deleteTable = useDeleteTable()
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure()

  function cancelDelete() {
    deleteTable.reset()
    closeDelete()
  }

  const form = useForm({
    initialValues: {
      number: table.number,
      seats: table.seats as number | string,
      minGuests: table.minGuests as number | string,
      shape: table.shape,
      rotation: table.rotation,
    },
    onValuesChange: (values) => onPreview(values.shape, values.rotation),
    validate: {
      number: (value) => {
        const number = value.trim()
        return number.length === 0 || number.length > 20 ? t('areas.errors.tableNumberInvalid') : null
      },
      seats: (value) => (typeof value === 'number' && Number.isInteger(value) && value >= 1 ? null : t('areas.errors.seatsInvalid')),
      minGuests: (value, values) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= Number(values.seats)
          ? null
          : t('areas.errors.minGuestsInvalid'),
    },
  })

  return (
    <>
      <form
        onSubmit={form.onSubmit((values) =>
          updateTable.mutate(
            {
              id: table.id,
              number: values.number.trim(),
              seats: Number(values.seats),
              minGuests: Number(values.minGuests),
              shape: values.shape,
              rotation: values.rotation,
            },
            {
              onSuccess: () => notifications.show({ color: 'brand', message: t('areas.table.saved') }),
              onError: (error) => {
                const code = errorCode(error)
                if (code === 'table_number_taken' || code === 'table_number_invalid') {
                  form.setFieldError('number', errorMessage(error, t))
                } else if (code === 'seats_invalid') {
                  form.setFieldError('seats', errorMessage(error, t))
                } else if (code === 'min_guests_invalid') {
                  form.setFieldError('minGuests', errorMessage(error, t))
                } else if (code === 'shape_invalid') {
                  form.setFieldError('shape', errorMessage(error, t))
                } else if (code === 'rotation_invalid') {
                  form.setFieldError('rotation', errorMessage(error, t))
                } else {
                  notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) })
                }
              },
            },
          ),
        )}
      >
        <Stack gap="md">
          <Title order={4}>{t('areas.table.title', { number: table.number })}</Title>
          <TextInput label={t('areas.table.number')} maxLength={20} {...form.getInputProps('number')} />
          <NumberInput label={t('areas.table.seats')} min={1} allowDecimal={false} allowNegative={false} {...form.getInputProps('seats')} />
          <NumberInput
            label={t('areas.table.minGuests')}
            description={t('areas.table.minGuestsHint')}
            min={1}
            max={typeof form.values.seats === 'number' ? form.values.seats : undefined}
            allowDecimal={false}
            allowNegative={false}
            {...form.getInputProps('minGuests')}
          />
          <Input.Wrapper label={t('areas.table.shape')} error={form.errors.shape}>
            <SegmentedControl
              fullWidth
              data={shapes.map((shape) => ({ value: shape, label: t(`areas.table.shapes.${shape}`) }))}
              value={form.values.shape}
              onChange={(value) => form.setFieldValue('shape', value as TableShape)}
            />
          </Input.Wrapper>
          <Switch
            label={t('areas.table.rotate')}
            description={t('areas.table.rotateHint')}
            disabled={form.values.shape !== 'Rectangle'}
            checked={form.values.rotation === 90}
            onChange={(event) => form.setFieldValue('rotation', event.currentTarget.checked ? 90 : 0)}
            error={form.errors.rotation}
          />
          <Group justify="space-between">
            <Button type="submit" loading={updateTable.isPending}>
              {t('common.save')}
            </Button>
            <Button variant="default" onClick={onClose}>
              {t('common.close')}
            </Button>
          </Group>
          <Button variant="subtle" color="red" onClick={openDelete}>
            {t('areas.table.delete')}
          </Button>
        </Stack>
      </form>

      <Modal opened={deleteOpened} onClose={cancelDelete} title={t('areas.table.deleteTitle', { number: table.number })}>
        <Stack gap="md">
          <Text size="sm">{t('areas.table.deleteText')}</Text>
          {deleteTable.error !== null && (
            <Alert color="red" variant="light" title={t('areas.table.notDeleted')}>
              {errorCode(deleteTable.error) === 'table_has_reservations'
                ? t('areas.table.hasReservations')
                : errorMessage(deleteTable.error, t)}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={cancelDelete}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              loading={deleteTable.isPending}
              onClick={() =>
                deleteTable.mutate(table.id, {
                  onSuccess: () => {
                    closeDelete()
                    onClose()
                  },
                })
              }
            >
              {t('areas.table.deleteConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
