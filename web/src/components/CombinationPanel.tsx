import { Button, Group, NumberInput, Paper, Stack, Switch, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { type Table, type TableCombination, useDeleteCombination, useUpdateCombination } from '../api/areas.ts'
import { errorCode, errorMessage } from '../api/areaErrors.ts'

type CombinationPanelProps = {
  /** The tables of the area. */
  tables: Table[]
  /** The area's combinations, by their first table. */
  combinations: TableCombination[]
  /** The tables picked on the plan for a new combination; null while none is being picked. */
  picked: string[] | null
  onStartPicking: () => void
  onCancelPicking: () => void
  onCombine: () => void
  combining: boolean
  /** The combination being edited; the plan outlines its tables. */
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/**
 * The area's table combinations: tables picked on the plan are combined with "Combine" (seats and the smallest online party
 * get their defaults), the list below edits seats, the smallest online party and online booking, or deletes them.
 */
export function CombinationPanel({
  tables,
  combinations,
  picked,
  onStartPicking,
  onCancelPicking,
  onCombine,
  combining,
  selectedId,
  onSelect,
}: CombinationPanelProps) {
  const { t } = useTranslation()
  const deleteCombination = useDeleteCombination()
  const numbers = (ids: string[]) =>
    ids.map((id) => tables.find((table) => table.id === id)?.number).filter((number) => number !== undefined).join(', ')

  function remove(combination: TableCombination) {
    deleteCombination.mutate(combination, {
      onSuccess: () => {
        notifications.show({ color: 'brand', message: t('areas.combinations.deleted') })
        if (selectedId === combination.id) {
          onSelect(null)
        }
      },
      onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) }),
    })
  }

  return (
    <Stack gap="sm" data-combinations="">
      <Title order={4}>{t('areas.combinations.title')}</Title>
      <Text size="sm" c="dimmed">
        {t('areas.combinations.text')}
      </Text>

      {picked === null ? (
        <Group>
          <Button variant="default" onClick={onStartPicking} disabled={tables.length < 2}>
            {t('areas.combinations.select')}
          </Button>
        </Group>
      ) : (
        <Paper withBorder p="sm" radius="md">
          <Stack gap="xs">
            <Text size="sm">{t('areas.combinations.pickHint')}</Text>
            <Text size="sm" fw={500}>
              {picked.length === 0 ? t('areas.combinations.pickedNone') : t('areas.combinations.picked', { tables: numbers(picked) })}
            </Text>
            <Group>
              <Button onClick={onCombine} disabled={picked.length < 2} loading={combining}>
                {t('areas.combinations.combine')}
              </Button>
              <Button variant="default" onClick={onCancelPicking}>
                {t('common.cancel')}
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}

      {combinations.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('areas.combinations.empty')}
        </Text>
      ) : (
        <Stack gap="xs">
          {combinations.map((combination) =>
            combination.id === selectedId ? (
              <CombinationForm
                key={combination.id}
                combination={combination}
                largestTable={Math.max(...combination.tableIds.map((id) => tables.find((table) => table.id === id)?.seats ?? 0))}
                onClose={() => onSelect(null)}
                onDelete={() => remove(combination)}
                deleting={deleteCombination.isPending}
              />
            ) : (
              <Paper key={combination.id} withBorder p="sm" radius="md">
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Stack gap={0}>
                    <Text fw={600}>{t('areas.combinations.label', { label: combination.label })}</Text>
                    <Text size="sm" c="dimmed">
                      {combination.onlineBookable
                        ? t('areas.combinations.summary', { count: combination.seats, minGuests: combination.minGuests })
                        : t('areas.combinations.summaryOffline', { count: combination.seats })}
                    </Text>
                  </Stack>
                  <Group gap={4} wrap="nowrap">
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => onSelect(combination.id)}
                      aria-label={t('areas.combinations.editLabel', { label: combination.label })}
                    >
                      {t('areas.combinations.edit')}
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => remove(combination)}
                      loading={deleteCombination.isPending && deleteCombination.variables?.id === combination.id}
                      aria-label={t('areas.combinations.deleteLabel', { label: combination.label })}
                    >
                      {t('areas.combinations.delete')}
                    </Button>
                  </Group>
                </Group>
              </Paper>
            ),
          )}
        </Stack>
      )}
    </Stack>
  )
}

type CombinationFormProps = {
  combination: TableCombination
  /** The seats of its largest table; the combination needs at least one more. */
  largestTable: number
  onClose: () => void
  onDelete: () => void
  deleting: boolean
}

function CombinationForm({ combination, largestTable, onClose, onDelete, deleting }: CombinationFormProps) {
  const { t } = useTranslation()
  const updateCombination = useUpdateCombination()
  const form = useForm({
    initialValues: {
      seats: combination.seats as number | string,
      minGuests: combination.minGuests as number | string,
      onlineBookable: combination.onlineBookable,
    },
    validate: {
      seats: (value) =>
        typeof value === 'number' && Number.isInteger(value) && value > largestTable ? null : t('areas.errors.combinationSeatsInvalid'),
      minGuests: (value, values) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= Number(values.seats)
          ? null
          : t('areas.errors.combinationMinGuestsInvalid'),
    },
  })

  return (
    <Paper withBorder p="sm" radius="md" style={{ borderColor: 'var(--mantine-color-brand-7)' }}>
      <form
        onSubmit={form.onSubmit((values) =>
          updateCombination.mutate(
            {
              areaId: combination.areaId,
              id: combination.id,
              seats: Number(values.seats),
              minGuests: Number(values.minGuests),
              onlineBookable: values.onlineBookable,
            },
            {
              onSuccess: () => {
                notifications.show({ color: 'brand', message: t('areas.combinations.saved') })
                onClose()
              },
              onError: (error) => {
                const code = errorCode(error)
                if (code === 'combination_seats_invalid') {
                  form.setFieldError('seats', errorMessage(error, t))
                } else if (code === 'combination_min_guests_invalid') {
                  form.setFieldError('minGuests', errorMessage(error, t))
                } else {
                  notifications.show({ color: 'red', title: t('errors.title'), message: errorMessage(error, t) })
                }
              },
            },
          ),
        )}
      >
        <Stack gap="sm">
          <Text fw={600}>{t('areas.combinations.label', { label: combination.label })}</Text>
          <NumberInput
            label={t('areas.combinations.seats')}
            description={t('areas.combinations.seatsHint', { min: largestTable + 1 })}
            min={largestTable + 1}
            allowDecimal={false}
            allowNegative={false}
            {...form.getInputProps('seats')}
          />
          <NumberInput
            label={t('areas.combinations.minGuests')}
            description={t('areas.combinations.minGuestsHint')}
            min={1}
            max={typeof form.values.seats === 'number' ? form.values.seats : undefined}
            allowDecimal={false}
            allowNegative={false}
            {...form.getInputProps('minGuests')}
          />
          <Switch
            label={t('areas.combinations.onlineBookable')}
            description={t('areas.combinations.onlineBookableHint')}
            {...form.getInputProps('onlineBookable', { type: 'checkbox' })}
          />
          <Group justify="space-between">
            <Group gap="xs">
              <Button type="submit" loading={updateCombination.isPending}>
                {t('common.save')}
              </Button>
              <Button variant="default" onClick={onClose}>
                {t('common.close')}
              </Button>
            </Group>
            <Button variant="subtle" color="red" onClick={onDelete} loading={deleting}>
              {t('areas.combinations.delete')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
