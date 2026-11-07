import { ChevronDownIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type GoodToKnowProps = {
  houseRules: string | null
  faq: { question: string; answer: string }[]
}

/**
 * "Good to know" on the booking page: the house rules as text with their line breaks, and the frequently asked questions as
 * an accordion of native details/summary elements (operable with the keyboard, several may be open at once), each with a
 * chevron that turns when it opens (without motion when the device asks for less). Texts in the restaurant's own language.
 */
export function GoodToKnow({ houseRules, faq }: GoodToKnowProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-8">
      {houseRules !== null && (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-xl">{t('restaurantDetails.guest.houseRules')}</h3>
          <p className="max-w-prose leading-relaxed whitespace-pre-line text-muted-foreground">{houseRules}</p>
        </div>
      )}
      {faq.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-xl">{t('restaurantDetails.guest.faq')}</h3>
          <div className="divide-y divide-border rounded-xl border border-border bg-card text-card-foreground">
            {faq.map((item, index) => (
              <details key={index} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 font-medium focus-ring touch:min-h-11 [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground transition-transform duration-(--motion-medium) group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <p className="px-5 pb-5 leading-relaxed whitespace-pre-line text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
