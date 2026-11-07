import { ArmchairIcon, ArrowLeftIcon, CalendarIcon, ClockIcon, TriangleAlertIcon, UsersIcon, XIcon } from 'lucide-react'
import type { ParseKeys } from 'i18next'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BookingResult, PublicRestaurant } from '../../api/publicBooking.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'
import { DialogTitle } from '../../ui/dialog.tsx'
import { useFrameResize } from '../../ui/motion/frame-resize.ts'
import { SheetTitle } from '../../ui/sheet.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { BrandLogo } from '../BrandLogo.tsx'
import { BookingConfirmation } from './BookingConfirmation.tsx'
import { GuestDetailsForm } from './GuestDetailsForm.tsx'
import { HoldNotice } from './HoldNotice.tsx'
import { TablePicker } from './TablePicker.tsx'
import type { BookingFlowState, Step } from './useBookingFlow.ts'

/** The steps of the dialog: the table (only when the guest chooses it), the contact details and the confirmation. */
type DialogStep = Exclude<Step, 'time'> | 'done'

const stepLabels: Record<DialogStep, ParseKeys> = {
  table: 'booking.dialog.stepTable',
  details: 'booking.dialog.stepDetails',
  done: 'booking.dialog.stepDone',
}

/** The order of the steps, for the direction in which a new step slides in. */
const stepOrder: DialogStep[] = ['table', 'details', 'done']

/**
 * Where the steps are shown: in the dialog (from 768 px on), in the full-screen sheet (phones) or, in the embed, as steps
 * below the reservation card. Each frame has its own title element, so the dialog and the sheet are named by the step.
 */
export type StepsFrame = 'dialog' | 'sheet' | 'inline'

type BookingStepsProps = {
  slug: string
  restaurant: PublicRestaurant
  timeZoneId: string
  flow: BookingFlowState
  frame: StepsFrame
}

/** A step as shown: the step and, for the confirmation, the booking. */
type Shown = { step: DialogStep; result: BookingResult | null }

/**
 * The booking dialog's content. At the top the restaurant's logo or name (not in the embed, whose page is the restaurant), from the
 * second step on a Back button (back through the history, like the browser's), "Close", the choices in short (people · date · time ·
 * table; each leads back to where it is chosen) and the steps with the current one marked; at the contact details the line with
 * the held table and its countdown. Below it the step: the table, the contact details or the confirmation.
 *
 * A change of step cross-fades: the old step fades and slides out towards the side it lies on while the new one slides in from
 * the other (forward from the right, back from the left), both shown for a moment, and the frame (dialog or card) changes its
 * size with the spring (useFrameResize); the first step does not, as the dialog itself opens. The focus moves to the new step's
 * heading as it starts, so keyboard and screen reader users follow along. While the dialog closes it keeps showing the step
 * it closes from.
 */
export function BookingSteps({ slug, restaurant, timeZoneId, flow, frame }: BookingStepsProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const dark = restaurant.branding.themeMode === 'Dark'

  // What the dialog shows; kept while it closes, so it does not empty before it is gone.
  const current: Shown | null =
    flow.result !== null ? { step: 'done', result: flow.result } : flow.step !== 'time' ? { step: flow.step, result: null } : null
  const [shown, setShown] = useState(current)
  // From where the step slid in; null until the first change of step.
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  // The step that is sliding out, shown for a moment behind the new one.
  const [leaving, setLeaving] = useState<(Shown & { direction: 'forward' | 'back' }) | null>(null)
  if (current !== null && (current.step !== shown?.step || current.result !== shown.result)) {
    if (shown !== null && current.step !== shown.step) {
      const next = stepOrder.indexOf(current.step) < stepOrder.indexOf(shown.step) ? 'back' : 'forward'
      setDirection(next)
      setLeaving({ ...shown, direction: next })
    }
    setShown(current)
  }

  const step = shown?.step ?? null
  useFrameResize(rootRef, step)
  useEffect(() => {
    if (step === null) {
      return
    }
    headingRef.current?.focus({ preventScroll: frame !== 'inline' })
    if (frame === 'inline') {
      // From the top of the steps, so their summary bar, which stays at the top while an embed scrolls on its own, does
      // not cover the heading.
      rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    } else {
      // A new step starts at its top.
      rootRef.current?.closest('[data-motion-frame-content]')?.scrollTo({ top: 0 })
    }
  }, [step, frame])

  // The old step is gone once it has slid out (with less motion right away); the timeout in case its animation never ends.
  useEffect(() => {
    if (leaving === null) {
      return
    }
    const timeout = setTimeout(() => setLeaving(null), 400)
    return () => clearTimeout(timeout)
  }, [leaving])

  if (shown === null || step === null) {
    return null
  }

  // Without a table step when only a combination of tables is (or was, for the confirmation) free.
  const tableStep = flow.guestChooses && !flow.combined && (shown.result === null || shown.result.tableNumbers.length === 1)
  const steps: DialogStep[] = tableStep ? ['table', 'details', 'done'] : ['details', 'done']
  const index = steps.indexOf(step)
  // Back from every step after the first; not from the confirmation, where the booking is made.
  const canGoBack = index > 0 && step !== 'done'

  const headingClassName = 'scroll-mt-4 font-display text-2xl outline-none'
  const heading = (text: string, active: boolean) => {
    if (!active) {
      return <h2 className={headingClassName}>{text}</h2>
    }
    const props = { ref: headingRef, tabIndex: -1, 'data-step-heading': '', className: headingClassName, children: text }
    return frame === 'dialog' ? <DialogTitle {...props} /> : frame === 'sheet' ? <SheetTitle {...props} /> : <h2 {...props} />
  }

  // The choices so far in short; people, date and time lead back to the card, the table to its step.
  const parts: { key: string; icon: ReactNode; label: string; onClick: () => void }[] = []
  if (flow.date !== null && flow.time !== null) {
    parts.push({ key: 'guests', icon: <UsersIcon />, label: t('booking.guestsCount', { count: flow.partySize }), onClick: flow.closeDialog })
    parts.push({ key: 'date', icon: <CalendarIcon />, label: formatShortDate(flow.date, language), onClick: flow.closeDialog })
    parts.push({ key: 'time', icon: <ClockIcon />, label: formatTime(flow.time, language), onClick: flow.closeDialog })
  }
  if (flow.guestChooses && flow.table !== undefined) {
    parts.push({
      key: 'table',
      icon: <ArmchairIcon />,
      label: t('booking.tableNumber', { number: flow.table.number }),
      onClick: () => flow.goToStep('table'),
    })
  }

  const summary =
    step !== 'done' && parts.length > 0 ? (
      <ul aria-label={t('booking.summaryLabel')} className="flex flex-wrap items-center gap-1">
        {parts.map((part) => (
          <li key={part.key}>
            <button
              type="button"
              onClick={part.onClick}
              aria-label={t('booking.changePart', { part: part.label })}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-muted px-3 text-sm font-medium whitespace-nowrap press hover:bg-accent hover:text-accent-foreground focus-ring touch:h-11 [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
            >
              <span aria-hidden="true" className="flex">
                {part.icon}
              </span>
              {part.label}
            </button>
          </li>
        ))}
      </ul>
    ) : null
  // Beside the logo where the frame is wide (the table's large dialog) and in the embed, which shows no logo; otherwise in a row
  // of their own, so they do not wrap under the logo.
  const summaryBesideLogo = frame === 'inline' || (frame === 'dialog' && step === 'table')

  const stepClassName = 'flex flex-1 flex-col gap-5 px-4 pt-5 pb-0 md:px-6 md:py-6'

  /** The content of a step; `active` false for the one sliding out, which has no named heading and takes no input. */
  const content = (option: DialogStep, result: BookingResult | null, active: boolean) => {
    if (option === 'done' && result !== null) {
      return (
        <BookingConfirmation
          result={result}
          slug={slug}
          restaurant={restaurant}
          timeZoneId={timeZoneId}
          photoBand={frame !== 'inline'}
          title={heading(result.status === 'Requested' ? t('booking.confirmation.requestTitle') : t('booking.confirmation.confirmedTitle'), active)}
        />
      )
    }
    return (
      <>
        {heading(option === 'table' ? t('booking.steps.table') : t('booking.steps.details'), active)}
        {active && flow.checking ? (
          <div className="flex flex-col gap-4 pb-6" aria-hidden="true">
            <Skeleton className="h-12" />
            <Skeleton className="h-40" />
          </div>
        ) : option === 'table' && flow.date !== null && flow.time !== null ? (
          <TablePicker
            slug={slug}
            date={flow.date}
            time={flow.time}
            guests={flow.partySize}
            value={flow.tableId}
            onChange={flow.chooseTable}
            onContinue={() => flow.goToStep('details')}
            onChangeTime={flow.closeDialog}
            dark={dark}
            tableStyle={restaurant.branding.tableStyle}
            fill={frame === 'dialog'}
          />
        ) : option === 'details' ? (
          <>
            {flow.unavailable !== null && <Unavailable flow={flow} message={flow.unavailable} />}
            <GuestDetailsForm
              initialValues={flow.details}
              onValuesChange={flow.setDetails}
              onSubmit={flow.submit}
              submitting={flow.submitting}
              error={flow.error}
              request={flow.request}
            />
          </>
        ) : null}
      </>
    )
  }

  return (
    // Clipped sideways, so a step sliding in never makes the dialog or the sheet scroll horizontally.
    <div ref={rootRef} className="flex min-h-full flex-col overflow-x-clip">
      <header className={cn('sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-card px-4 py-3 md:px-6 md:py-4', frame === 'dialog' && 'rounded-t-xl')}>
        <div className="flex items-start gap-2">
          {canGoBack && (
            <Button variant="ghost" size="icon" onClick={flow.goBack} className="-ml-2 shrink-0">
              <ArrowLeftIcon aria-hidden="true" />
              <span className="sr-only">{t('booking.dialog.back')}</span>
            </Button>
          )}
          <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
            {frame !== 'inline' && (
              <span className="flex min-w-0 shrink items-center">
                {restaurant.branding.logoUrl !== null ? (
                  <BrandLogo src={restaurant.branding.logoUrl} height={32} maxWidth={160} accent="var(--primary)" fallback={<RestaurantName name={restaurant.name} />} />
                ) : (
                  <RestaurantName name={restaurant.name} />
                )}
              </span>
            )}
            {summaryBesideLogo && summary}
          </div>
          <Button variant="ghost" size="icon" onClick={flow.closeDialog} className="-mr-2 shrink-0">
            <XIcon aria-hidden="true" />
            <span className="sr-only">{t('common.close')}</span>
          </Button>
        </div>
        {!summaryBesideLogo && summary}
        <ol className="flex items-center gap-2 text-xs">
          {steps.map((option, position) => (
            <li
              key={option}
              aria-current={position === index ? 'step' : undefined}
              className={cn('flex min-w-0 flex-1 flex-col gap-1.5', position === index ? 'font-semibold text-foreground' : 'text-muted-foreground')}
            >
              <span aria-hidden="true" className={cn('h-1 rounded-full', position <= index ? 'bg-primary' : 'bg-muted')} />
              <span className={cn('truncate', position !== index && 'max-sm:sr-only')}>
                <span className="sr-only">{`${t('booking.dialog.stepOf', { step: position + 1, total: steps.length })}: `}</span>
                {t(stepLabels[option])}
              </span>
            </li>
          ))}
        </ol>
        {step === 'details' && flow.hold !== null && flow.unavailable === null && <HoldNotice key={flow.hold.holdToken} hold={flow.hold} />}
      </header>

      {/* While a step slides out it lies over the new one and is cut to the new one's size. */}
      <div className={cn('relative flex flex-1 flex-col', leaving !== null && 'overflow-clip')}>
        {leaving !== null && leaving.step !== step && (
          <div
            key={leaving.step}
            aria-hidden="true"
            inert
            onAnimationEnd={(event) => event.target === event.currentTarget && setLeaving(null)}
            className={cn(
              stepClassName,
              'pointer-events-none absolute inset-x-0 top-0 animate-step-out',
              leaving.direction === 'back' && '[--slide-to:1.5rem]',
            )}
          >
            {content(leaving.step, leaving.result, false)}
          </div>
        )}
        <div
          key={step}
          className={cn(stepClassName, direction !== null && 'animate-step-in', direction === 'back' && '[--slide-from:-1.5rem]')}
        >
          {content(step, shown.result, true)}
        </div>
      </div>
    </div>
  )
}

function RestaurantName({ name }: { name: string }) {
  return <span className="block truncate font-display text-lg">{name}</span>
}

/**
 * The chosen time or table was taken while the guest was here (the hold or the booking found it so): the message, the nearest free
 * times of the day as chips, which continue the booking at that time, and the way back to the card for another day. What the guest
 * typed stays in the form below.
 */
function Unavailable({ flow, message }: { flow: BookingFlowState; message: ParseKeys }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'

  return (
    <Alert variant="warning" data-unavailable="">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertDescription className="flex flex-col gap-3">
        <p>{t(message)}</p>
        {flow.nearbyTimesPending ? (
          <div className="flex flex-wrap gap-2" aria-hidden="true">
            <Skeleton className="h-11 w-20 rounded-full" />
            <Skeleton className="h-11 w-20 rounded-full" />
            <Skeleton className="h-11 w-20 rounded-full" />
          </div>
        ) : flow.nearbyTimes.length > 0 ? (
          <ul aria-label={t('booking.hold.nearbyTimes')} className="flex flex-wrap gap-2">
            {flow.nearbyTimes.map((time) => (
              <li key={time}>
                <button
                  type="button"
                  onClick={() => flow.chooseTime(time)}
                  className="relative inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-input bg-background px-4 text-sm font-medium text-foreground tabular-nums press hover:border-primary hover:bg-primary-50 focus-ring dark:hover:bg-accent"
                >
                  {formatTime(time, language)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('booking.hold.noNearbyTimes')}</p>
        )}
        <Button variant="link" onClick={flow.closeDialog} className="h-auto self-start p-0 touch:h-11">
          {t('booking.hold.otherDay')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
