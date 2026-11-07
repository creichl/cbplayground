import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RestaurantFeature } from '../../api/restaurantDetails.ts'
import { cn } from '../../lib/utils.ts'
import { Button } from '../../ui/button.tsx'
import { featureIcons } from './featureIcons.ts'

/**
 * "About us" on the booking page: the restaurant's description in its own language with its line breaks, cut to about 5 lines
 * with "Read more" / "Show less" when it is longer, and below it the features as chips with an icon and a label each.
 */
export function AboutUs({ description, features }: { description: string | null; features: RestaurantFeature[] }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      {description !== null && <Description text={description} />}
      {features.length > 0 && (
        <ul aria-label={t('restaurantDetails.guest.features')} className="flex flex-wrap gap-2">
          {features.map((feature) => {
            const Icon = featureIcons[feature]
            return (
              <li
                key={feature}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-primary-text" />
                {t(`restaurantDetails.features.${feature}`)}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The description, cut to 5 lines while collapsed; the button only appears when the text is longer than that. */
function Description({ text }: { text: string }) {
  const { t } = useTranslation()
  const id = useId()
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [longer, setLonger] = useState(false)

  // Measured while collapsed, again when the width or the font changes the lines; expanded, the button stays.
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null || expanded) {
      return
    }
    const measure = () => setLonger(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [expanded, text])

  return (
    <div className="flex flex-col items-start gap-2">
      <p id={id} ref={ref} className={cn('max-w-prose text-lg leading-relaxed whitespace-pre-line', !expanded && 'line-clamp-5')}>
        {text}
      </p>
      {longer && (
        <Button variant="link" className="h-auto px-0 text-base" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
          {expanded ? t('restaurantDetails.guest.showLess') : t('restaurantDetails.guest.readMore')}
        </Button>
      )}
    </div>
  )
}
