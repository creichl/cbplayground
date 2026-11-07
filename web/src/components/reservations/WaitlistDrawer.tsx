import { Alert, Button, Chip, Drawer, Group, Input, NumberInput, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import { defaultWalkInGuests } from '../../api/reservations.ts'
import { maxQuotedWaitMinutes, useAddToWaitlist, useUpdateWaitlistEntry, type WaitlistEntry, type WaitlistInput } from '../../api/waitlist.ts'

/** The longest name and note the server accepts. */
const maxNameLength = 100
const maxNotesLength = 500

/** The quoted waiting times offered as chips, in minutes; any other value is entered as "own value". */
const quotedChoices = [15, 30, 45, 60]

const noQuote = 'none'
const ownQuote = 'own'

type WaitlistDrawerProps = {
  /** The entry to change; without it a new party is added. */
  entry?: WaitlistEntry
  /** What a new entry starts with, e.g. the party of the walk-in drawer that found no free table. */
  initial?: Partial<WaitlistInput>
  /** Called after a new party has been added, e.g. to show the waitlist. */
  onAdded?: () => void
  onClose: () => void
}

/**
 * Puts a walk-in party on today's waitlist, or changes a waiting one: name, party size, phone, the quoted waiting time as chips
 * (15 / 30 / 45 / 60 minutes or an own value) and a note.
 */
export function WaitlistDrawer({ entry, initial, onAdded, onClose }: WaitlistDrawerProps) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const add = useAddToWaitlist()
  const update = useUpdateWaitlistEntry()
  const saving = entry === undefined ? add : update
  const start = entry ?? initial
  const startQuote = start?.quotedWaitMinutes ?? null
  const [name, setName] = useState(start?.name ?? '')
  const [guestsValue, setGuestsValue] = useState<number | string>(start?.guests ?? defaultWalkInGuests)
  const [phone, setPhone] = useState(start?.phone ?? '')
  const [quote, setQuote] = useState(startQuote === null ? noQuote : quotedChoices.includes(startQuote) ? String(startQuote) : ownQuote)
  const [ownMinutes, setOwnMinutes] = useState<number | string>(startQuote !== null && !quotedChoices.includes(startQuote) ? startQuote : '')
  const [notes, setNotes] = useState(start?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)

  const guests = typeof guestsValue === 'number' && Number.isInteger(guestsValue) && guestsValue >= 1 ? guestsValue : null
  const ownValid = typeof ownMinutes === 'number' && Number.isInteger(ownMinutes) && ownMinutes >= 1 && ownMinutes <= maxQuotedWaitMinutes
  const quotedWaitMinutes = quote === noQuote ? null : quote === ownQuote ? (ownValid ? (ownMinutes as number) : undefined) : Number(quote)
  const nameMissing = name.trim().length === 0

  const submit = () => {
    setSubmitted(true)
    if (nameMissing || guests === null || quotedWaitMinutes === undefined) {
      return
    }
    const input: WaitlistInput = { name: name.trim(), guests, phone: phone.trim() || null, quotedWaitMinutes, notes: notes.trim() || null }
    if (entry === undefined) {
      add.mutate(input, {
        onSuccess: (added) => {
          notifications.show({ color: 'green', message: t('waitlist.toast.added', { name: added.name }) })
          onAdded?.()
          onClose()
        },
      })
    } else {
      update.mutate({ id: entry.id, ...input }, { onSuccess: onClose })
    }
  }

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size={isMobile ? '100%' : 'md'}
      title={
        <Text fw={650} size="lg">
          {t(entry === undefined ? 'waitlist.titleNew' : 'waitlist.titleEdit')}
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
          <TextInput
            label={t('reservations.form.name')}
            required
            maxLength={maxNameLength}
            size="md"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={submitted && nameMissing ? t('waitlist.validation.name') : undefined}
            data-autofocus
          />
          <NumberInput
            label={t('reservations.form.guests')}
            min={1}
            allowDecimal={false}
            allowNegative={false}
            size="md"
            value={guestsValue}
            onChange={setGuestsValue}
            error={guests === null ? t('reservations.form.validation.guests') : undefined}
          />
          <TextInput
            label={t('reservations.form.phone')}
            type="tel"
            maxLength={30}
            size="md"
            value={phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
          />
          <Stack gap={6}>
            <Input.Label size="md" id="waitlist-quoted-wait">
              {t('waitlist.quotedWait')}
            </Input.Label>
            <Chip.Group multiple={false} value={quote} onChange={setQuote}>
              <Group gap={6} role="radiogroup" aria-labelledby="waitlist-quoted-wait">
                <Chip value={noQuote} size="md">
                  {t('waitlist.quotedNone')}
                </Chip>
                {quotedChoices.map((minutes) => (
                  <Chip key={minutes} value={String(minutes)} size="md">
                    {t('waitlist.minutes', { count: minutes })}
                  </Chip>
                ))}
                <Chip value={ownQuote} size="md">
                  {t('waitlist.quotedOwn')}
                </Chip>
              </Group>
            </Chip.Group>
            {quote === ownQuote && (
              <NumberInput
                label={t('waitlist.quotedOwnLabel')}
                min={1}
                max={maxQuotedWaitMinutes}
                allowDecimal={false}
                allowNegative={false}
                size="md"
                value={ownMinutes}
                onChange={setOwnMinutes}
                error={submitted && !ownValid ? t('waitlist.errors.invalidQuotedWait') : undefined}
              />
            )}
          </Stack>
          <Textarea
            label={t('reservations.form.notes')}
            autosize
            minRows={2}
            maxLength={maxNotesLength}
            size="md"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />

          {saving.error !== null && (
            <Alert color="red" variant="light" title={t('waitlist.notSaved')}>
              {reservationErrorMessage(saving.error, t)}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" size="md" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="md" loading={saving.isPending} disabled={guests === null}>
              {t(entry === undefined ? 'waitlist.add' : 'waitlist.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Drawer>
  )
}
