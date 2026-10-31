import { Button, Group, NumberInput, Stack, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { type Table, useDeleteTable, useUpdateTable } from '../api/areas.ts'
import { errorCode, errorMessage } from '../api/areaErrors.ts'

type TablePanelProps = {
  table: Table
  onClose: () => void
}

/** Properties of the selected table: number and seats. */
export function TablePanel({ table, onClose }: TablePanelProps) {
  const { t } = useTranslation()
  const updateTable = useUpdateTable()
  const deleteTable = useDeleteTable()

  const form = useForm({
    initialValues: { number: table.number, seats: table.seats as number | string },
    validate: {
      number: (value) => {
        const number = value.trim()
        return number.length === 0 || number.length > 20 ? t('areas.errors.tableNumberInvalid') : null
      },
      seats: (value) => (typeof value === 'number' && Number.isInteger(value) && value >= 1 ? null : t('areas.errors.seatsInvalid')),
    },
  })

  return (
    <form
      onSubmit={form.onSubmit((values) =>
        updateTable.mutate(
          { id: table.id, number: values.number.trim(), seats: Number(values.seats) },
          {
            onSuccess: () => notifications.show({ color: 'brand', message: t('areas.table.saved') }),
            onError: (error) => {
              const code = errorCode(error)
              if (code === 'table_number_taken' || code === 'table_number_invalid') {
                form.setFieldError('number', errorMessage(error, t))
              } else if (code === 'seats_invalid') {
                form.setFieldError('seats', errorMessage(error, t))
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
        <Group justify="space-between">
          <Button type="submit" loading={updateTable.isPending}>
            {t('common.save')}
          </Button>
          <Button variant="default" onClick={onClose}>
            {t('common.close')}
          </Button>
        </Group>
        <Button
          variant="subtle"
          color="red"
          loading={deleteTable.isPending}
          onClick={() =>
            deleteTable.mutate(table.id, {
              onSuccess: onClose,
              onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }),
            })
          }
        >
          {t('areas.table.delete')}
        </Button>
      </Stack>
    </form>
  )
}
