import { ArmchairIcon, CalendarIcon, ClockIcon, UsersIcon, XIcon } from 'lucide-react'
import type { ParseKeys } from 'i18next'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BookingResult, PublicRestaurant } from '../../api/publicBooking.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Button } from '../../ui/button.tsx'
import { DialogTitle } from '../../ui/dialog.tsx'
import { SheetTitle } from '../../ui/sheet.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { BookingConfirmation } from './BookingConfirmation.tsx'
import { GuestDetailsForm } from './GuestDetailsForm.tsx'
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

/**
 * The booking dialog's content. At the top the choices in short (people · date · time · table; each leads back to where it
 * is chosen), the steps with the current one marked and, outside the dialog that has its own, "Close". Below it the step:
 * the table, the contact details or the confirmation. After a change of step the focus moves to the step's heading, so
 * keyboard and screen reader users follow along. A new step slides in from the side it lies on: forward from the right,
 * back from the left; the first step does not, as the dialog itself opens. While the dialog closes it keeps showing the
 * step it closes from.
 */
export function BookingSteps({ slug, restaurant, timeZoneId, flow, frame }: BookingStepsProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dark = restaurant.branding.themeMode === 'Dark'

  // What the dialog shows; kept while it closes, so it does not empty before it is gone.
  const current: { step: DialogStep; result: BookingResult | null } | null =
    flow.result !== null ? { step: 'done', result: flow.result } : flow.step !== 'time' ? { step: flow.step, result: null } : null
  const [shown, setShown] = useState(current)
  // From where the step slid in; null until the first change of step.
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  if (current !== null && (current.step !== shown?.step || current.result !== shown.result)) {
    if (shown !== null && current.step !== shown.step) {
      setDirection(stepOrder.indexOf(current.step) < stepOrder.indexOf(shown.step) ? 'back' : 'forward')
    }
    setShown(current)
  }

  const step = shown?.step ?? null
  useEffect(() => {
    if (step !== null) {
      headingRef.current?.focus({ preventScroll: frame !== 'inline' })
      if (frame === 'inline') {
        headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
    }
  }, [step, frame])

  if (shown === null || step === null) {
    return null
  }

  // Without a table step when only a combination of tables is (or was, for the confirmation) free.
  const tableStep = flow.guestChooses && !flow.combined && (shown.result === null || shown.result.tableNumbers.length === 1)
  const steps: DialogStep[] = tableStep ? ['table', 'details', 'done'] : ['details', 'done']
  const index = steps.indexOf(step)

  const headingClassName = 'scroll-mt-4 font-display text-2xl outline-none'
  const heading = (text: string, className?: string) => {
    const props = { ref: headingRef, tabIndex: -1, 'data-step-heading': '', className: cn(headingClassName, className), children: text }
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

  return (
    // Clipped sideways, so a step sliding in never makes the dialog or the sheet scroll horizontally.
    <div className="flex min-h-full flex-col overflow-x-clip">
      <header className={cn('sticky top-0 z-20 flex items-start gap-3 border-b border-border bg-card px-4 py-3 md:px-6 md:py-4', frame === 'dialog' && 'rounded-t-xl pr-14')}>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {step !== 'done' && parts.length > 0 && (
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
          )}
          <ol className="flex items-center gap-2 text-xs">
            {steps.map((option, position) => (
              <li
                key={option}
                aria-current={position === index ? 'step' : undefined}
                className={cn('flex min-w-0 flex-1 flex-col gap-1.5', position === index ? 'font-semibold text-foreground' : 'text-muted-foreground')}
              >
                <span aria-hidden="true" className={cn('h-1 rounded-full', position <= index ? 'bg-primary' : 'bg-muted')} />
                <span className={cn('truncate', position !== index && 'max-sm:sr-only')}>
                  <span className="sr-only">{`${t('booking.dialog.stepOf', { step: position + 1, count: steps.length })}: `}</span>
                  {t(stepLabels[option])}
                </span>
              </li>
            ))}
          </ol>
        </div>
        {frame !== 'dialog' && (
          <Button variant="ghost" size="icon" onClick={flow.closeDialog} className="-mr-2 shrink-0">
            <XIcon aria-hidden="true" />
            <span className="sr-only">{t('common.close')}</span>
          </Button>
        )}
      </header>

      <div
        // A new element per step, so its slide starts over.
        key={step}
        className={cn(
          'flex flex-1 flex-col gap-5 px-4 pt-5 pb-0 md:px-6 md:py-6',
          // In the large dialog the table's plan takes its whole width; the contact details and the confirmation keep the width
          // they read best in.
          frame === 'dialog' && step !== 'table' && 'md:mx-auto md:w-full md:max-w-240',
          direction !== null && 'animate-slide-in',
          direction === 'back' && '[--slide-from:-1.5rem]',
        )}
      >
        {step === 'done' && shown.result !== null ? (
          <BookingConfirmation
            result={shown.result}
            slug={slug}
            restaurant={restaurant}
            timeZoneId={timeZoneId}
            photoBand={frame !== 'inline'}
            title={heading(shown.result.status === 'Requested' ? t('booking.confirmation.requestTitle') : t('booking.confirmation.confirmedTitle'))}
          />
        ) : (
          <>
            {heading(step === 'table' ? t('booking.steps.table') : t('booking.steps.details'))}
            {flow.checking ? (
              <div className="flex flex-col gap-4 pb-6" aria-hidden="true">
                <Skeleton className="h-12" />
                <Skeleton className="h-40" />
              </div>
            ) : step === 'table' && flow.date !== null && flow.time !== null ? (
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
            ) : step === 'details' ? (
              <GuestDetailsForm
                initialValues={flow.details}
                onValuesChange={flow.setDetails}
                onSubmit={flow.submit}
                submitting={flow.submitting}
                error={flow.error}
                request={flow.request}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
