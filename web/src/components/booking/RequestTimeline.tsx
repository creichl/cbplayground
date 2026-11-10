import { CheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils.ts'

/**
 * What happens with a request, in three steps: "Request sent" (done, with a check), "The restaurant confirms" (now, with a
 * softly pulsing dot) and "Check your reservation page" (to come). The line from the first step to the second draws itself
 * once. Used on the confirmation and on "Your reservation" while the request is open. With less motion it simply stands there.
 */
export function RequestTimeline({ className }: { className?: string }) {
  const { t } = useTranslation()
  const steps = [
    { label: t('booking.requestTimeline.sent'), state: 'done' as const, stateLabel: t('booking.requestTimeline.done') },
    { label: t('booking.requestTimeline.confirms'), state: 'current' as const, stateLabel: t('booking.requestTimeline.current') },
    { label: t('booking.requestTimeline.check'), state: 'next' as const, stateLabel: t('booking.requestTimeline.next') },
  ]

  return (
    <ol aria-label={t('booking.requestTimeline.label')} className={cn('flex flex-col text-left', className)}>
      {steps.map((step, index) => (
        <li key={step.state} aria-current={step.state === 'current' ? 'step' : undefined} className="relative flex min-h-11 items-start gap-3">
          {index < steps.length - 1 && (
            // The line down to the next step; the first one draws itself from the top.
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-7 bottom-0 left-3 w-0.5 -translate-x-1/2',
                index === 0 ? 'origin-top animate-line-draw bg-success' : 'bg-border',
              )}
            />
          )}
          <span aria-hidden="true" className="relative flex size-6 shrink-0 items-center justify-center">
            {step.state === 'done' ? (
              <span className="flex size-6 items-center justify-center rounded-full bg-success text-background">
                <CheckIcon className="size-3.5" strokeWidth={3} />
              </span>
            ) : step.state === 'current' ? (
              <>
                <span className="absolute inset-1 rounded-full bg-warning opacity-0 motion-safe:animate-dot-pulse" />
                <span className="relative size-3 rounded-full bg-warning ring-4 ring-warning/20" />
              </>
            ) : (
              <span className="size-3 rounded-full border-2 border-border bg-card" />
            )}
          </span>
          <span className={cn('pb-4 text-sm leading-6', step.state === 'next' ? 'text-muted-foreground' : 'font-medium')}>
            {/* The state in words, as the symbols only show it. */}
            <span className="sr-only">{`${step.stateLabel}: `}</span>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}
