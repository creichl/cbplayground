import { Alert, Button, Drawer, Group, Modal, NumberInput, Select, Skeleton, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { randomId, useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client.ts'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import { defaultWalkInGuests, type Reservation, useCreateWalkIn, useWalkInTables } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { guestName } from './status.ts'
import { removeWalkIn, removeWalkInQuestion } from './walkInRemoval.ts'

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

/** How long the notification after seating a walk-in, with its "Undo", stays; as after a status change. */
const seatedNoticeMs = 8000

/**
 * The notification after seating a walk-in. Its "Undo" removes the walk-in after asking; the notification stays open while it
 * asks, since the drawer that seated the walk-in is already closed.
 */
function SeatedNotice({ walkIn, notificationId }: { walkIn: Reservation; notificationId: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const language = i18n.resolvedLanguage ?? 'en'

  const ask = (open: boolean) => {
    setAsking(open)
    // The same message again, so this component and its question stay as they are.
    notifications.update({
      id: notificationId,
      autoClose: open ? false : seatedNoticeMs,
      message: <SeatedNotice walkIn={walkIn} notificationId={notificationId} />,
    })
  }

  const remove = () => {
    setRemoving(true)
    removeWalkIn(queryClient, walkIn, t).then(
      () => notifications.hide(notificationId),
      () => notifications.hide(notificationId),
    )
  }

  return (
    <>
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Text size="sm">
          {t('reservations.walkIn.seated', { name: guestName(walkIn, t), table: walkIn.tableNumber, time: formatTime(walkIn.time, language) })}
        </Text>
        <Button size="compact-sm" variant="light" color="gray" style={{ flexShrink: 0 }} onClick={() => ask(true)}>
          {t('reservations.actions.undo')}
        </Button>
      </Group>
      <Modal opened={asking} onClose={() => ask(false)} title={t(removeWalkInQuestion.title)}>
        <Stack gap="md">
          <Text size="sm">
            {t(removeWalkInQuestion.text, {
              name: guestName(walkIn, t),
              time: formatTime(walkIn.time, language),
              table: walkIn.tableNumber,
              count: walkIn.guests,
            })}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => ask(false)}>
              {t('reservations.cancelConfirm.back')}
            </Button>
            <Button color="gray" loading={removing} onClick={remove}>
              {t(removeWalkInQuestion.confirm)}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

/**
 * Seats a guest without a reservation now: party size, then a table free now (the suggestion is preselected and can be
 * changed), then optionally name, phone and a note. The reservation starts as arrived. A chosen table that is not free (any
 * more) is never swapped for another one: the drawer says so and the user picks a table.
 */
export function WalkInDrawer({ tableId: wantedTableId, onClose }: WalkInDrawerProps) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const createWalkIn = useCreateWalkIn()
  const [guestsValue, setGuestsValue] = useState<number | string>(defaultWalkInGuests)
  const [chosenTableId, setChosenTableId] = useState<string | null>(wantedTableId ?? null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  const guests = typeof guestsValue === 'number' && Number.isInteger(guestsValue) && guestsValue >= 1 ? guestsValue : null
  const freeTables = useWalkInTables(guests)
  const tables = freeTables.data?.tables ?? []
  // The table from the floor plan or picked here, e.g. taken meanwhile or too small for the party size entered since.
  const chosenTableTaken = chosenTableId !== null && freeTables.data !== undefined && !tables.some((table) => table.id === chosenTableId)
  const tableId = chosenTableId === null ? (tables.at(0)?.id ?? null) : chosenTableTaken ? null : chosenTableId

  const submit = () => {
    if (guests === null || tableId === null) {
      return
    }
    createWalkIn.mutate(
      { guests, tableId, name: name.trim() || null, phone: phone.trim() || null, notes: notes.trim() || null },
      {
        onSuccess: (walkIn) => {
          const id = randomId('walk-in-')
          notifications.show({ id, color: 'green', autoClose: seatedNoticeMs, message: <SeatedNotice walkIn={walkIn} notificationId={id} /> })
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
                onChange={(id) => {
                  setChosenTableId(id)
                  createWalkIn.reset()
                }}
                placeholder={t('reservations.walkIn.chooseTable')}
                error={chosenTableTaken}
                allowDeselect={false}
                size="md"
              />
              {chosenTableTaken && (
                <Alert color="orange" variant="light">
                  {t('reservations.walkIn.wantedTableTaken', { count: guests })}
                </Alert>
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
