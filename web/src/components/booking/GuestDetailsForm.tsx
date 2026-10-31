import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useTranslation } from 'react-i18next'
import { isValidEmail } from '../../api/profile.ts'
import { guestMaxLengths, isValidPhone } from '../../api/publicBooking.ts'

export type GuestDetailsValues = { name: string; phone: string; email: string; notes: string }

type GuestDetailsFormProps = {
  initialValues: GuestDetailsValues
  /** Keeps what the guest typed while they go back to change the date or time. */
  onValuesChange: (values: GuestDetailsValues) => void
  onSubmit: (values: GuestDetailsValues) => void
  submitting: boolean
  /** The translated reason a booking failed, shown above the button. */
  error: string | null
  /** The request mode sends a request instead of booking. */
  request: boolean
}

/** Name, phone or email (one of them is required) and a note. */
export function GuestDetailsForm({ initialValues, onValuesChange, onSubmit, submitting, error, request }: GuestDetailsFormProps) {
  const { t } = useTranslation()

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
    <form onSubmit={form.onSubmit(onSubmit)} noValidate>
      <Stack gap="md">
        <TextInput
          label={t('booking.details.name')}
          autoComplete="name"
          required
          maxLength={guestMaxLengths.name}
          size="md"
          key={form.key('name')}
          {...form.getInputProps('name')}
        />
        <Text size="sm" c="dimmed">
          {t('booking.details.contactHint')}
        </Text>
        <TextInput
          label={t('booking.details.phone')}
          type="tel"
          autoComplete="tel"
          maxLength={guestMaxLengths.phone}
          size="md"
          key={form.key('phone')}
          {...form.getInputProps('phone')}
        />
        <TextInput
          label={t('booking.details.email')}
          type="email"
          autoComplete="email"
          maxLength={guestMaxLengths.email}
          size="md"
          key={form.key('email')}
          {...form.getInputProps('email')}
        />
        <Textarea
          label={t('booking.details.notes')}
          description={t('booking.details.notesDescription', { count: guestMaxLengths.notes })}
          autosize
          minRows={2}
          maxLength={guestMaxLengths.notes}
          size="md"
          key={form.key('notes')}
          {...form.getInputProps('notes')}
        />

        {error !== null && (
          <Alert color="red" variant="light" role="alert">
            {error}
          </Alert>
        )}

        <Group>
          <Button type="submit" size="md" loading={submitting}>
            {request ? t('booking.details.submitRequest') : t('booking.details.submit')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
