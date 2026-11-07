import { CircleAlertIcon, LoaderCircleIcon } from 'lucide-react'
import { type ComponentProps, type FormEvent, type ReactNode, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidEmail } from '../../api/profile.ts'
import { guestMaxLengths, isValidPhone } from '../../api/publicBooking.ts'
import type { Occasion } from '../../api/reservations.ts'
import { cn } from '../../lib/utils.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx'
import { Textarea } from '../../ui/textarea.tsx'
import { occasionLabels, occasions } from '../guests/labels.ts'
import {
  forgetDetails,
  type GuestDetailsValues,
  internationalPhone,
  otherPhoneCode,
  phoneCodes,
  rememberDetails,
  rememberedDetails,
} from './guestDetails.ts'
import { StepActions } from './StepActions.tsx'

type TextField = 'name' | 'phone' | 'email' | 'notes'

type Errors = Partial<Record<TextField, string>>

type GuestDetailsFormProps = {
  initialValues: GuestDetailsValues
  /** Keeps what the guest typed while they go back to change the time or the table. */
  onValuesChange: (values: GuestDetailsValues) => void
  /** Called with the checked values; `phone` is the number in international form (internationalPhone). */
  onSubmit: (values: GuestDetailsValues) => void
  submitting: boolean
  /** The translated reason a booking failed, shown above the button. */
  error: string | null
  /** The request mode sends a request instead of booking. */
  request: boolean
}

/** The name of a region in the guest's language, e.g. "Austria" for "AT"; the code itself where the browser does not know it. */
function regionName(region: string, language: string) {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(region) ?? region
  } catch {
    return region
  }
}

/**
 * Name, phone with the calling code (a select that starts with the restaurant's country; "Other" for a number with its own code)
 * or email (one of them is enough, and the form says so), a note and an optional occasion as chips (one at most; tapped again it is
 * cleared), which the restaurant sees at the reservation. The fields carry the autocomplete and input mode of their content;
 * errors appear at a field when the guest leaves it and when they try to book, and the focus then goes to the first one.
 * "Remember my details on this device" (off until the guest ticks it) stores name, phone and email for the next booking at any
 * restaurant; "Not you? Clear" forgets them. Below them what happens next: in the request mode that the restaurant confirms,
 * and that the reservation can be cancelled through the link. The main button books or sends the request, and says so with a
 * spinner while it is sent.
 */
export function GuestDetailsForm({ initialValues, onValuesChange, onSubmit, submitting, error, request }: GuestDetailsFormProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [values, setValues] = useState(initialValues)
  // The fields the guest has left once; after the first attempt to book all of them count.
  const [touched, setTouched] = useState<ReadonlySet<TextField>>(new Set())
  const [validated, setValidated] = useState(false)
  const [remembered, setRemembered] = useState(() => rememberedDetails() !== null)
  const formRef = useRef<HTMLFormElement>(null)
  const contactId = useId()
  const rememberId = useId()

  const validate = (next: GuestDetailsValues): Errors => {
    const phone = internationalPhone(next.phoneCode, next.phone)
    const noContact = phone === '' && next.email.trim() === ''
    return {
      name: next.name.trim() === '' ? t('booking.details.nameRequired') : undefined,
      phone: noContact
        ? t('booking.details.contactRequired')
        : phone !== '' && (!isValidPhone(phone) || phone.length > guestMaxLengths.phone)
          ? t('booking.details.invalidPhone')
          : undefined,
      email: noContact
        ? t('booking.details.contactRequired')
        : next.email.trim() !== '' && !isValidEmail(next.email.trim())
          ? t('booking.details.invalidEmail')
          : undefined,
    }
  }

  const found = validate(values)
  const noContact = internationalPhone(values.phoneCode, values.phone) === '' && values.email.trim() === ''
  // "Phone or email" only once the guest has left both of them empty, not already when they leave the phone for the email.
  const contactMissing = validated || (touched.has('phone') && touched.has('email'))
  const shown = (field: TextField) =>
    (!validated && !touched.has(field)) || (noContact && (field === 'phone' || field === 'email') && !contactMissing) ? undefined : found[field]

  const change = <Field extends keyof GuestDetailsValues>(field: Field, value: GuestDetailsValues[Field]) => {
    const next = { ...values, [field]: value }
    setValues(next)
    onValuesChange(next)
  }

  const leave = (field: TextField) => {
    if (!touched.has(field)) {
      setTouched(new Set([...touched, field]))
    }
  }

  const clearRemembered = () => {
    forgetDetails()
    setRemembered(false)
    const next = { ...values, name: '', phone: '', email: '', remember: false }
    setValues(next)
    onValuesChange(next)
    formRef.current?.querySelector<HTMLElement>('[name="name"]')?.focus()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // The button keeps the focus while the booking is sent, so it is not disabled; a second press does nothing.
    if (submitting) {
      return
    }
    setValidated(true)
    const first = (['name', 'phone', 'email'] as const).find((field) => found[field] !== undefined)
    if (first !== undefined) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    if (values.remember) {
      rememberDetails(values)
    } else {
      forgetDetails()
    }
    setRemembered(values.remember)
    onSubmit({ ...values, phone: internationalPhone(values.phoneCode, values.phone) })
  }

  const field = (name: TextField) => ({
    name,
    value: values[name],
    onChange: (event: { currentTarget: { value: string } }) => change(name, event.currentTarget.value),
    onBlur: () => leave(name),
    error: shown(name),
  })

  const chipClassName =
    'relative inline-flex h-11 cursor-pointer items-center justify-center rounded-full border px-4 text-sm font-medium press focus-ring'

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
        <Field label={t('booking.details.phone')} {...field('phone')}>
          {(props) => (
            <div className="flex gap-2">
              <Select value={values.phoneCode} onValueChange={(value) => change('phoneCode', value)}>
                <SelectTrigger aria-label={t('booking.details.phoneCode')} className="h-12 w-28 shrink-0 tabular-nums touch:h-12">
                  <SelectValue>
                    {phoneCodes.find((option) => option.region === values.phoneCode)?.code ?? t('booking.details.phoneCodeOther')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72 min-w-64">
                  {phoneCodes.map((option) => (
                    <SelectItem key={option.region} value={option.region}>
                      <span className="flex w-full justify-between gap-4">
                        <span>{regionName(option.region, language)}</span>
                        <span className="text-muted-foreground tabular-nums">{option.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={otherPhoneCode}>{t('booking.details.phoneCodeOther')}</SelectItem>
                </SelectContent>
              </Select>
              <Input {...props} type="tel" inputMode="tel" autoComplete="tel-national" maxLength={guestMaxLengths.phone} className="h-12 touch:h-12" />
            </div>
          )}
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
      </fieldset>

      <Field label={t('booking.details.notes')} description={t('booking.details.notesDescription', { count: guestMaxLengths.notes })} {...field('notes')}>
        {(props) => <Textarea {...props} rows={3} maxLength={guestMaxLengths.notes} />}
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">{t('booking.details.occasion')}</legend>
        <ul className="flex flex-wrap gap-2">
          {occasions
            .filter((occasion) => occasion !== 'None')
            .map((occasion) => {
              const chosen = values.occasion === occasion
              return (
                <li key={occasion}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => change('occasion', (chosen ? 'None' : occasion) satisfies Occasion)}
                    className={cn(
                      chipClassName,
                      chosen
                        ? 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover'
                        : 'border-input bg-background hover:border-primary hover:bg-primary-50 dark:hover:bg-accent',
                    )}
                  >
                    {t(occasionLabels[occasion])}
                  </button>
                </li>
              )
            })}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-h-11 items-center gap-3">
          <input
            id={rememberId}
            type="checkbox"
            checked={values.remember}
            onChange={(event) => change('remember', event.currentTarget.checked)}
            className="size-5 shrink-0 cursor-pointer rounded accent-(--primary) focus-ring"
          />
          <Label htmlFor={rememberId} className="cursor-pointer text-sm font-normal">
            {t('booking.details.remember')}
          </Label>
        </div>
        {remembered && (
          <p className="text-sm text-muted-foreground">
            {t('booking.details.notYou')}{' '}
            <button type="button" onClick={clearRemembered} className="min-h-11 cursor-pointer rounded-sm font-medium text-primary-text underline underline-offset-4 focus-ring">
              {t('booking.details.clearRemembered')}
            </button>
          </p>
        )}
      </div>

      {/* Room for one more line below the hints, e.g. a link to the privacy policy. */}
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {request && <li>{t('booking.details.requestHint')}</li>}
        <li>{t('booking.details.cancelHint')}</li>
      </ul>

      {error !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <StepActions>
        <Button type="submit" size="lg" className="w-full md:w-auto" aria-disabled={submitting || undefined}>
          {submitting && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {submitting
            ? request
              ? t('booking.details.submittingRequest')
              : t('booking.details.submitting')
            : request
              ? t('booking.details.submitRequest')
              : t('booking.details.submit')}
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
  onBlur: () => void
  error: string | undefined
  children: (props: ComponentProps<'input'> & ComponentProps<'textarea'>) => ReactNode
}

/** A field with its label above it, an optional description and its error right below it, tied to it for screen readers. */
function Field({ name, label, description, required, value, onChange, onBlur, error, children }: FieldProps) {
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
        onBlur,
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
