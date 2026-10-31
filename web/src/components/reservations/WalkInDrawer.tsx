import { Alert, Button, Drawer, Group, NumberInput, Select, Skeleton, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client.ts'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import { useCreateWalkIn, useWalkInTables } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { guestName } from './status.ts'

/** The longest note the server accepts. */
const maxNotesLength = 500

type WalkInDrawerProps = {
  /** The table the walk-in should get, e.g. after a tap on a free table of the floor plan; otherwise the suggested one. */
  tableId?: string
  onClose: () => void
}

/** The message for a failed request; "outside opening hours" means the restaurant is closed right now. */
function walkInErrorMessage(error: unknown, t: TFunction) {
  return error instanceof ApiError && error.code === 'outside_opening_hours' ? t('reservations.walkIn.closed') : reservationErrorMessage(error, t)
}

/**
 * Seats a guest without a reservation now: party size, then a table free now (the suggestion is preselected and can be
 * changed), then optionally name, phone and a note. The reservation starts as arrived.
 */
export function WalkInDrawer({ tableId: wantedTableId, onClose }: WalkInDrawerProps) {
  const { t, i18n } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const createWalkIn = useCreateWalkIn()
  const [guestsValue, setGuestsValue] = useState<number | string>(2)
  const [chosenTableId, setChosenTableId] = useState<string | null>(wantedTableId ?? null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  const guests = typeof guestsValue === 'number' && Number.isInteger(guestsValue) && guestsValue >= 1 ? guestsValue : null
  const freeTables = useWalkInTables(guests)
  const tables = freeTables.data?.tables ?? []
  const tableId = tables.some((table) => table.id === chosenTableId) ? chosenTableId : (tables.at(0)?.id ?? null)
  const wantedTableTaken = wantedTableId !== undefined && freeTables.data !== undefined && !tables.some((table) => table.id === wantedTableId)

  const submit = () => {
    if (guests === null || tableId === null) {
      return
    }
    createWalkIn.mutate(
      { guests, tableId, name: name.trim() || null, phone: phone.trim() || null, notes: notes.trim() || null },
      {
        onSuccess: (walkIn) => {
          notifications.show({
            color: 'green',
            message: t('reservations.walkIn.seated', { name: guestName(walkIn, t), table: walkIn.tableNumber, time: formatTime(walkIn.time, i18n.resolvedLanguage ?? 'en') }),
          })
          onClose()
        },
      },
    )
  }

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size={isMobile ? '100%' : 'md'}
      title={
        <Text fw={650} size="lg">
          {t('reservations.walkIn.title')}
        </Text>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Stack gap="md">
          <NumberInput
            label={t('reservations.form.guests')}
            min={1}
            allowDecimal={false}
            allowNegative={false}
            size="md"
            value={guestsValue}
            onChange={setGuestsValue}
            error={guests === null ? t('reservations.form.validation.guests') : undefined}
            data-autofocus
          />

          {guests === null ? null : freeTables.isPending ? (
            <Skeleton h={64} radius="md" />
          ) : freeTables.isError ? (
            <Alert color="red" variant="light">
              {walkInErrorMessage(freeTables.error, t)}
            </Alert>
          ) : tables.length === 0 ? (
            <Alert color="orange" variant="light">
              {t('reservations.walkIn.noTable', { count: guests })}
            </Alert>
          ) : (
            <Stack gap={4}>
              <Select
                label={t('reservations.form.table')}
                description={t('reservations.walkIn.tableDescription', { count: freeTables.data.durationMinutes })}
                data={tables.map((table, index) => ({
                  value: table.id,
                  label: t(index === 0 ? 'reservations.form.tableOptionSuggested' : 'reservations.form.tableOption', {
                    number: table.number,
                    area: table.areaName,
                    count: table.seats,
                  }),
                }))}
                value={tableId}
                onChange={setChosenTableId}
                allowDeselect={false}
                size="md"
              />
              {wantedTableTaken && (
                <Text size="sm" c="orange.8">
                  {t('reservations.walkIn.wantedTableTaken', { count: guests })}
                </Text>
              )}
            </Stack>
          )}

          <TextInput
            label={t('reservations.form.name')}
            description={t('reservations.walkIn.nameDescription')}
            maxLength={100}
            size="md"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            label={t('reservations.form.phone')}
            type="tel"
            maxLength={30}
            size="md"
            value={phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
          />
          <Textarea
            label={t('reservations.form.notes')}
            autosize
            minRows={2}
            maxLength={maxNotesLength}
            size="md"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />

          {createWalkIn.error !== null && (
            <Alert color="red" variant="light" title={t('reservations.walkIn.notSeated')}>
              {walkInErrorMessage(createWalkIn.error, t)}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" size="md" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="md" loading={createWalkIn.isPending} disabled={guests === null || tableId === null}>
              {t('reservations.walkIn.seat')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Drawer>
  )
}
