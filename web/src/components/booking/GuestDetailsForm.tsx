import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidEmail } from '../../api/profile.ts'
import { guestMaxLengths, isValidPhone } from '../../api/publicBooking.ts'

export type GuestDetailsValues = { name: string; phone: string; email: string; notes: string }

type GuestDetailsFormProps = {
  /** The form's id, so the button in the booking's bar at the bottom of the screen can submit it. */
  id: string
  initialValues: GuestDetailsValues
  /** Keeps what the guest typed while they go back to change the date or time. */
  onValuesChange: (values: GuestDetailsValues) => void
  onSubmit: (values: GuestDetailsValues) => void
  submitting: boolean
  /** The translated reason a booking failed, shown above the button. */
  error: string | null
  /** The request mode sends a request instead of booking. */
  request: boolean
  /** On phones the button is in the booking's bar at the bottom of the screen instead of below the form. */
  stickyBar: boolean
}

/** Field styles: 48 px high, the label in the text colour and weight 600, as in the booking bar. */
const fieldStyles = { input: { minHeight: 48 }, label: { fontWeight: 600, marginBottom: 4 } }

/**
 * Name, phone or email (one of them is enough, and the form says so) and a note. The fields carry the autocomplete and
 * input mode of their content; errors appear at the field. Below them what happens next: in the request mode that the
 * restaurant confirms, and that the reservation can be cancelled through the link.
 */
export function GuestDetailsForm({ id, initialValues, onValuesChange, onSubmit, submitting, error, request, stickyBar }: GuestDetailsFormProps) {
  const { t } = useTranslation()
  const contactId = useId()

  const contactError = (value: string, other: string) => (value.trim() === '' && other.trim() === '' ? t('booking.details.contactRequired') : null)
  const form = useForm<GuestDetailsValues>({
    mode: 'uncontrolled',
    initialValues,
    onValuesChange,
    validate: {
      name: (value) => (value.trim() === '' ? t('booking.details.nameRequired') : null),
      phone: (value, values) =>
        contactError(value, values.email) ?? (value.trim() === '' || isValidPhone(value.trim()) ? null : t('booking.details.invalidPhone')),
      email: (value, values) =>
        contactError(value, values.phone) ?? (value.trim() === '' || isValidEmail(value.trim()) ? null : t('booking.details.invalidEmail')),
    },
  })

  return (
    <form id={id} onSubmit={form.onSubmit(onSubmit)} noValidate>
      <Stack gap={24}>
        <TextInput
          label={t('booking.details.name')}
          autoComplete="name"
          required
          maxLength={guestMaxLengths.name}
          size="md"
          styles={fieldStyles}
          key={form.key('name')}
          {...form.getInputProps('name')}
        />

        <Stack gap={16} role="group" aria-labelledby={contactId}>
          <Stack gap={4} id={contactId}>
            <Text fw={600}>{t('booking.details.contactTitle')}</Text>
            <Text size="sm" c="dimmed">
              {t('booking.details.contactHint')}
            </Text>
          </Stack>
          <TextInput
            label={t('booking.details.phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={guestMaxLengths.phone}
            size="md"
            styles={fieldStyles}
            key={form.key('phone')}
            {...form.getInputProps('phone')}
          />
          <TextInput
            label={t('booking.details.email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={guestMaxLengths.email}
            size="md"
            styles={fieldStyles}
            key={form.key('email')}
            {...form.getInputProps('email')}
          />
        </Stack>

        <Textarea
          label={t('booking.details.notes')}
          description={t('booking.details.notesDescription', { count: guestMaxLengths.notes })}
          autosize
          minRows={2}
          maxLength={guestMaxLengths.notes}
          size="md"
          styles={{ label: fieldStyles.label, description: { marginBottom: 4 } }}
          key={form.key('notes')}
          {...form.getInputProps('notes')}
        />

        <Stack gap={8}>
          {request && <Text size="sm">{t('booking.details.requestHint')}</Text>}
          <Text size="sm">{t('booking.details.cancelHint')}</Text>
        </Stack>

        {error !== null && (
          <Alert color="red" variant="light" role="alert">
            {error}
          </Alert>
        )}

        <Group visibleFrom={stickyBar ? 'md' : undefined}>
          <Button type="submit" size="md" h={48} loading={submitting}>
            {request ? t('booking.details.submitRequest') : t('booking.details.submit')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
