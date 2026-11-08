import { ChevronDownIcon, InfoIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Expand } from '../../ui/motion/expand.tsx'

type GoodToKnowProps = {
  houseRules: string | null
  faq: { question: string; answer: string }[]
}

/** How many questions are shown before "Show all N questions". */
const shownQuestions = 3

/**
 * "Good to know" at the end of the booking page, the least important content, so lighter than the sections above it (smaller
 * text, less room): the house rules as a compact list, one rule per line of their text, each with a small icon, in the
 * secondary text colour; the frequently asked questions as an accordion of native details/summary elements (operable with
 * the keyboard, several may be open at once), each with a chevron that turns when it opens (without motion when the device
 * asks for less). Only the first 3 questions are shown; "Show all N questions" unfolds the rest in place. Texts in the
 * restaurant's own language.
 */
export function GoodToKnow({ houseRules, faq }: GoodToKnowProps) {
  const { t } = useTranslation()
  const [allQuestions, setAllQuestions] = useState(false)
  const moreId = useId()
  const rules = (houseRules ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

  const question = (item: GoodToKnowProps['faq'][number], index: number) => (
    <details key={index} className="group border-t border-border first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 font-medium focus-ring touch:min-h-11 [&::-webkit-details-marker]:hidden">
        {item.question}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-medium) group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <p className="px-4 pb-4 leading-relaxed whitespace-pre-line text-muted-foreground">{item.answer}</p>
    </details>
  )

  return (
    <div className="flex flex-col gap-6 text-sm">
      {rules.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-lg">{t('restaurantDetails.guest.houseRules')}</h3>
          <ul className="flex max-w-prose flex-col gap-1.5 text-muted-foreground">
            {rules.map((rule, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span className="leading-relaxed">{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {faq.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-lg">{t('restaurantDetails.guest.faq')}</h3>
          <div className="rounded-xl border border-border bg-card text-card-foreground">
            {faq.slice(0, shownQuestions).map(question)}
            {faq.length > shownQuestions && (
              <Expand open={allQuestions} id={moreId}>
                <div className="border-t border-border">{faq.slice(shownQuestions).map((item, index) => question(item, index + shownQuestions))}</div>
              </Expand>
            )}
          </div>
          {faq.length > shownQuestions && (
            <button
              type="button"
              aria-expanded={allQuestions}
              aria-controls={moreId}
              onClick={() => setAllQuestions(!allQuestions)}
              className="-mx-1 inline-flex min-h-11 items-center gap-2 self-start rounded-sm px-1 font-semibold text-primary-text underline-offset-4 hover:underline focus-ring"
            >
              {allQuestions ? t('restaurantDetails.guest.showLess') : t('restaurantDetails.guest.showAllQuestions', { count: faq.length })}
              <ChevronDownIcon
                aria-hidden="true"
                className={`size-4 transition-transform duration-(--motion-medium) motion-reduce:transition-none ${allQuestions ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
