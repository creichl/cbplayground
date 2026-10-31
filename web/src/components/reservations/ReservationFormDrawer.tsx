import { Alert, Badge, Button, Chip, Drawer, Group, NumberInput, Select, SimpleGrid, Skeleton, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import {
  type Reservation,
  type ReservationInput,
  useCreateReservation,
  useFloor,
  useStaffAvailability,
  useUpdateReservation,
} from '../../api/reservations.ts'
import { durationLimits, isValidDuration } from '../../api/reservationSettings.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { StatusBadge } from './StatusBadge.tsx'

/** The longest note the server accepts. */
const maxNotesLength = 500

type ReservationFormDrawerProps = {
  /** The reservation to edit; null for a new one. */
  reservation: Reservation | null
  /** The day a new reservation starts on. */
  defaultDate: string
  /** Today in the restaurant's time zone; earlier days cannot be chosen. */
  today: string
  onClose: () => void
}

/** Drawer to enter a new reservation, e.g. a phone booking, or to change an existing one. */
export function ReservationFormDrawer({ reservation, defaultDate, today, onClose }: ReservationFormDrawerProps) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 48em)')

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size={isMobile ? '100%' : 'lg'}
      title={<Text fw={650} size="lg">{t(reservation === null ? 'reservations.form.createTitle' : 'reservations.form.editTitle')}</Text>}
    >
      {reservation === null ? (
        <ReservationForm reservation={null} initialDate={defaultDate} initialDuration={null} today={today} onClose={onClose} />
      ) : (
        <EditForm reservation={reservation} today={today} onClose={onClose} />
      )}
    </Drawer>
  )
}

/**
 * The server does not store whether a duration was overridden. A duration that differs from the restaurant's
 * duration for the party size counts as overridden, so saving keeps it; otherwise the restaurant's duration applies again.
 */
function EditForm({ reservation, today, onClose }: { reservation: Reservation; today: string; onClose: () => void }) {
  const defaults = useStaffAvailability(reservation.date, reservation.guests, null)

  if (defaults.isPending) {
    return <Skeleton h={480} radius="md" />
  }
  if (defaults.isError) {
    return <ErrorAlert error={defaults.error} onRetry={() => void defaults.refetch()} />
  }
  return (
    <ReservationForm
      reservation={reservation}
      initialDate={reservation.date}
      initialDuration={defaults.data.durationMinutes !== reservation.durationMinutes ? reservation.durationMinutes : null}
      today={today}
      onClose={onClose}
    />
  )
}

type ReservationFormProps = {
  reservation: Reservation | null
  initialDate: string
  /** The overridden duration; null when the restaurant's duration applies. */
  initialDuration: number | null
  today: string
  onClose: () => void
}

/** A number input is an empty string while it is cleared. */
type NumberValue = number | string

type FormValues = {
  guests: NumberValue
  date: string | null
  time: string | null
  tableId: string | null
  overrideDuration: boolean
  durationMinutes: NumberValue
  name: string
  phone: string
  email: string
  notes: string
}

function wholeNumber(value: NumberValue) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function ReservationForm({ reservation, initialDate, initialDuration, today, onClose }: ReservationFormProps) {
  const { t } = useTranslation()
  const isNew = reservation === null
  const createReservation = useCreateReservation()
  const updateReservation = useUpdateReservation()
  const mutation = isNew ? createReservation : updateReservation
  const floor = useFloor()

  const form = useForm<FormValues>({
    initialValues: {
      guests: reservation?.guests ?? 2,
      date: initialDate,
      time: reservation?.time ?? null,
      tableId: reservation?.tableId ?? null,
      overrideDuration: initialDuration !== null,
      durationMinutes: initialDuration ?? reservation?.durationMinutes ?? 120,
      name: reservation?.name ?? '',
      phone: reservation?.phone ?? '',
      email: reservation?.email ?? '',
      notes: reservation?.notes ?? '',
    },
    validate: {
      guests: (value) => (wholeNumber(value) !== null && Number(value) >= 1 ? null : t('reservations.form.validation.guests')),
      date: (value) => (value !== null ? null : t('reservations.form.validation.date')),
      durationMinutes: (value, values) =>
        !values.overrideDuration || isValidDuration(Number(value))
          ? null
          : t('reservations.form.validation.duration', durationLimits),
      name: (value) => (value.trim().length > 0 ? null : t('reservations.form.validation.name')),
    },
  })

  const { values } = form
  const guests = wholeNumber(values.guests) !== null && Number(values.guests) >= 1 ? Number(values.guests) : null
  const overriddenDuration = values.overrideDuration && isValidDuration(Number(values.durationMinutes)) ? Number(values.durationMinutes) : null
  const availability = useStaffAvailability(values.date, guests, overriddenDuration)
  const times = availability.data?.periods.flatMap((period) => period.times) ?? []

  // A new reservation needs a time with a free table. A change may keep its time even when it is not offered
  // (e.g. it has already started); the server checks it.
  const time = isNew ? (times.some((slot) => slot.time === values.time && slot.tables.length > 0) ? values.time : null) : values.time
  const freeTables = times.find((slot) => slot.time === time)?.tables ?? []
  const suggestion = freeTables.at(0) ?? null
  const tableId = isNew ? (freeTables.some((table) => table.id === values.tableId) ? values.tableId : (suggestion?.id ?? null)) : values.tableId

  const tableOptions = isNew
    ? freeTables.map((table) => ({
        value: table.id,
        label: t(table.id === suggestion?.id ? 'reservations.form.tableOptionSuggested' : 'reservations.form.tableOption', {
          number: table.number,
          area: table.areaName,
          seats: table.seats,
        }),
      }))
    : (floor.data ?? []).map((area) => ({
        group: area.name,
        items: area.tables.map((table) => ({
          value: table.id,
          label: t('reservations.form.tableOption', { number: table.number, area: area.name, seats: table.seats }),
        })),
      }))

  const submit = form.onSubmit((submitted) => {
    if (time === null || submitted.date === null) {
      form.setFieldError('time', t('reservations.form.validation.time'))
      return
    }
    const input: ReservationInput = {
      date: submitted.date,
      time,
      guests: Number(submitted.guests),
      tableId,
      durationMinutes: submitted.overrideDuration ? Number(submitted.durationMinutes) : null,
      name: submitted.name.trim(),
      phone: submitted.phone.trim() || null,
      email: submitted.email.trim() || null,
      notes: submitted.notes.trim() || null,
    }
    const onSuccess = (saved: Reservation) => {
      notifications.show({
        color: 'green',
        message: isNew
          ? t('reservations.form.created', { name: saved.name, code: saved.referenceCode })
          : t('reservations.form.saved', { name: saved.name }),
      })
      onClose()
    }
    if (isNew) {
      createReservation.mutate(input, { onSuccess })
    } else {
      updateReservation.mutate({ id: reservation.id, ...input }, { onSuccess })
    }
  })

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        {reservation !== null && (
          <Group gap="xs">
            <StatusBadge status={reservation.status} />
            <Badge size="lg" variant="outline" color="gray">
              {t(reservation.source === 'Online' ? 'reservations.source.online' : 'reservations.source.phone')}
            </Badge>
            <Text size="sm" c="dimmed">
              {t('reservations.form.reference', { code: reservation.referenceCode })}
            </Text>
          </Group>
        )}

        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
          <NumberInput
            label={t('reservations.form.guests')}
            min={1}
            allowDecimal={false}
            allowNegative={false}
            size="md"
            {...form.getInputProps('guests')}
          />
          <DatePickerInput
            label={t('reservations.form.date')}
            minDate={today}
            valueFormat="dd, DD.MM.YYYY"
            size="md"
            {...form.getInputProps('date')}
          />
        </SimpleGrid>

        <Stack gap={6}>
          <Text size="md" fw={500}>
            {t('reservations.form.time')}
          </Text>
          {guests === null || values.date === null ? (
            <Text size="sm" c="dimmed">
              {t('reservations.form.timeHint')}
            </Text>
          ) : availability.isPending ? (
            <Skeleton h={72} radius="md" />
          ) : availability.isError ? (
            <Alert color="red" variant="light">
              {reservationErrorMessage(availability.error, t)}
            </Alert>
          ) : availability.data.periods.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t('reservations.form.closed')}
            </Text>
          ) : (
            <Chip.Group multiple={false} value={time} onChange={(value) => form.setFieldValue('time', value)}>
              <Stack gap="sm">
                {!isNew && time !== null && !times.some((slot) => slot.time === time) && (
                  <Group gap={6}>
                    <Chip value={time} size="md">
                      {time}
                    </Chip>
                  </Group>
                )}
                {availability.data.periods.map((period) => (
                  <Stack key={period.start} gap={4}>
                    <Text size="xs" c="dimmed">
                      {t('reservations.form.period', { start: period.start, end: period.end })}
                    </Text>
                    <Group gap={6}>
                      {period.times.map((slot) => (
                        <Chip key={slot.time} value={slot.time} size="md" disabled={isNew && slot.tables.length === 0}>
                          {slot.time}
                        </Chip>
                      ))}
                    </Group>
                  </Stack>
                ))}
              </Stack>
            </Chip.Group>
          )}
          {form.errors.time !== undefined && (
            <Text size="sm" c="red">
              {form.errors.time}
            </Text>
          )}
        </Stack>

        <Select
          label={t('reservations.form.table')}
          description={isNew ? t('reservations.form.tableDescriptionNew') : t('reservations.form.tableDescriptionEdit')}
          placeholder={isNew && time === null ? t('reservations.form.tablePlaceholder') : undefined}
          data={tableOptions}
          value={tableId}
          onChange={(value) => form.setFieldValue('tableId', value)}
          disabled={isNew && time === null}
          allowDeselect={false}
          size="md"
        />

        <Stack gap="xs">
          <Switch
            label={t('reservations.form.overrideDuration')}
            description={
              availability.data !== undefined && !values.overrideDuration
                ? t('reservations.form.defaultDuration', { minutes: availability.data.durationMinutes })
                : undefined
            }
            size="md"
            checked={values.overrideDuration}
            onChange={(event) => {
              const checked = event.currentTarget.checked
              form.setFieldValue('overrideDuration', checked)
              // Starts from the duration that applies now.
              if (checked && availability.data !== undefined) {
                form.setFieldValue('durationMinutes', availability.data.durationMinutes)
              }
            }}
          />
          {values.overrideDuration && (
            <NumberInput
              label={t('reservations.form.duration')}
              min={durationLimits.min}
              max={durationLimits.max}
              step={durationLimits.step}
              allowDecimal={false}
              allowNegative={false}
              size="md"
              {...form.getInputProps('durationMinutes')}
            />
          )}
        </Stack>

        <TextInput label={t('reservations.form.name')} required maxLength={100} size="md" {...form.getInputProps('name')} />
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
          <TextInput label={t('reservations.form.phone')} type="tel" maxLength={30} size="md" {...form.getInputProps('phone')} />
          <TextInput label={t('reservations.form.email')} type="email" maxLength={254} size="md" {...form.getInputProps('email')} />
        </SimpleGrid>
        <Textarea label={t('reservations.form.notes')} autosize minRows={2} maxLength={maxNotesLength} size="md" {...form.getInputProps('notes')} />

        {mutation.error !== null && (
          <Alert color="red" variant="light" title={t('reservations.form.notSaved')}>
            {reservationErrorMessage(mutation.error, t)}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" size="md" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="md" loading={mutation.isPending}>
            {t(isNew ? 'reservations.form.create' : 'common.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
