import { CircleAlertIcon, LoaderCircleIcon } from 'lucide-react'
import { type ComponentProps, type FormEvent, type ReactNode, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidEmail } from '../../api/profile.ts'
import { guestMaxLengths, isValidPhone } from '../../api/publicBooking.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import { Textarea } from '../../ui/textarea.tsx'
import { StepActions } from './StepActions.tsx'

export type GuestDetailsValues = { name: string; phone: string; email: string; notes: string }

type Errors = Partial<Record<keyof GuestDetailsValues, string>>

type GuestDetailsFormProps = {
  initialValues: GuestDetailsValues
  /** Keeps what the guest typed while they go back to change the time or the table. */
  onValuesChange: (values: GuestDetailsValues) => void
  onSubmit: (values: GuestDetailsValues) => void
  submitting: boolean
  /** The translated reason a booking failed, shown above the button. */
  error: string | null
  /** The request mode sends a request instead of booking. */
  request: boolean
}

/**
 * Name, phone or email (one of them is enough, and the form says so) and a note. The fields carry the autocomplete and
 * input mode of their content; errors appear at the field once the guest tries to book, and the focus goes to the first
 * one. Below them what happens next: in the request mode that the restaurant confirms, and that the reservation can be
 * cancelled through the link. The main button books or sends the request, with a loading state.
 */
export function GuestDetailsForm({ initialValues, onValuesChange, onSubmit, submitting, error, request }: GuestDetailsFormProps) {
  const { t } = useTranslation()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Errors>({})
  const [validated, setValidated] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const contactId = useId()

  const validate = (next: GuestDetailsValues): Errors => {
    const noContact = next.phone.trim() === '' && next.email.trim() === ''
    return {
      name: next.name.trim() === '' ? t('booking.details.nameRequired') : undefined,
      phone: noContact
        ? t('booking.details.contactRequired')
        : next.phone.trim() !== '' && !isValidPhone(next.phone.trim())
          ? t('booking.details.invalidPhone')
          : undefined,
      email: noContact
        ? t('booking.details.contactRequired')
        : next.email.trim() !== '' && !isValidEmail(next.email.trim())
          ? t('booking.details.invalidEmail')
          : undefined,
    }
  }

  const change = (field: keyof GuestDetailsValues, value: string) => {
    const next = { ...values, [field]: value }
    setValues(next)
    onValuesChange(next)
    // After the first attempt, the errors follow what is typed.
    if (validated) {
      setErrors(validate(next))
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // The button keeps the focus while the booking is sent, so it is not disabled; a second press does nothing.
    if (submitting) {
      return
    }
    const found = validate(values)
    setErrors(found)
    setValidated(true)
    const first = (['name', 'phone', 'email'] as const).find((field) => found[field] !== undefined)
    if (first !== undefined) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    onSubmit(values)
  }

  const field = (name: keyof GuestDetailsValues) => ({
    name,
    value: values[name],
    onChange: (event: { currentTarget: { value: string } }) => change(name, event.currentTarget.value),
    error: errors[name],
  })

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Field label={t('booking.details.name')} required {...field('name')}>
        {(props) => <Input {...props} autoComplete="name" autoCapitalize="words" maxLength={guestMaxLengths.name} className="h-12 touch:h-12" />}
      </Field>

      <fieldset aria-describedby={contactId} className="flex flex-col gap-4">
        <legend className="mb-1 font-semibold">{t('booking.details.contactTitle')}</legend>
        <p id={contactId} className="text-sm text-muted-foreground">
          {t('booking.details.contactHint')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('booking.details.phone')} {...field('phone')}>
            {(props) => <Input {...props} type="tel" inputMode="tel" autoComplete="tel" maxLength={guestMaxLengths.phone} className="h-12 touch:h-12" />}
          </Field>
          <Field label={t('booking.details.email')} {...field('email')}>
            {(props) => (
              <Input
                {...props}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={guestMaxLengths.email}
                className="h-12 touch:h-12"
              />
            )}
          </Field>
        </div>
      </fieldset>

      <Field label={t('booking.details.notes')} description={t('booking.details.notesDescription', { count: guestMaxLengths.notes })} {...field('notes')}>
        {(props) => <Textarea {...props} rows={3} maxLength={guestMaxLengths.notes} />}
      </Field>

      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {request && <li>{t('booking.details.requestHint')}</li>}
        <li>{t('booking.details.cancelHint')}</li>
      </ul>

      {error !== null && (
        <Alert variant="destructive" role="alert">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <StepActions>
        <Button type="submit" size="lg" className="w-full md:w-auto" aria-disabled={submitting || undefined}>
          {submitting && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {request ? t('booking.details.submitRequest') : t('booking.details.submit')}
        </Button>
      </StepActions>
    </form>
  )
}

type FieldProps = {
  name: string
  label: string
  description?: string
  required?: boolean
  value: string
  onChange: (event: { currentTarget: { value: string } }) => void
  error: string | undefined
  children: (props: ComponentProps<'input'> & ComponentProps<'textarea'>) => ReactNode
}

/** A field with its label above it, an optional description and its error right below it, tied to it for screen readers. */
function Field({ name, label, description, required, value, onChange, error, children }: FieldProps) {
  const id = useId()
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  const describedBy = [description !== undefined ? descriptionId : null, error !== undefined ? errorId : null].filter((part) => part !== null).join(' ')

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="font-semibold">
        {label}
      </Label>
      {description !== undefined && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children({
        id,
        name,
        value,
        onChange,
        required,
        'aria-invalid': error !== undefined || undefined,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
      })}
      {error !== undefined && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm font-medium text-destructive">
          <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
