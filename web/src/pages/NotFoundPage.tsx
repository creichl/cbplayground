import { HouseIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '../i18n/title.ts'
import { Button } from '../ui/button.tsx'

/** An address that leads nowhere: the platform's "not found". */
export function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('notFound.title'))

  return <NotFound title={t('notFound.title')} text={t('notFound.text')} />
}

type NotFoundProps = {
  title: string
  text: string
  /** A symbol for what was not found, e.g. a restaurant; without one the page shows a large "404". */
  icon?: ReactNode
}

/**
 * A calm "not found" in the design system: a large number or symbol, the heading, one sentence and the way back to the start
 * page. Used by NotFoundPage and by the restaurant's pages for an unknown restaurant or reservation.
 */
export function NotFound({ title, text, icon }: NotFoundProps) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-16 text-center font-sans text-foreground sm:py-24">
      {/* The heading says it; the number and the symbol only show it. */}
      {icon !== undefined ? (
        <span aria-hidden="true" className="flex size-20 items-center justify-center rounded-full bg-primary-100 text-primary-text dark:bg-primary-50/10 [&_svg]:size-9">
          {icon}
        </span>
      ) : (
        <span aria-hidden="true" className="font-display text-7xl leading-none text-primary-text sm:text-8xl">
          404
        </span>
      )}
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl text-balance wrap-anywhere sm:text-4xl">{title}</h1>
        <p className="text-lg text-muted-foreground">{text}</p>
      </div>
      <Button asChild size="lg">
        <Link to="/">
          <HouseIcon aria-hidden="true" />
          {t('common.backToStart')}
        </Link>
      </Button>
    </div>
  )
}
