import { HouseIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '../i18n/title.ts'
import { Button } from '../ui/button.tsx'
import { Photo } from '../ui/photo.tsx'

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

/** The photo of "not found", in `web/public/` (see CREDITS.md there). */
const notFoundPhoto = '/not-found-photo.webp'

/**
 * A calm "not found" in the design system: a quiet photo of an empty, laid table, on large screens beside, on small ones
 * above a large number or symbol, the heading, one sentence and the way back to the start page. Used by NotFoundPage and by
 * the restaurant's pages for an unknown restaurant or reservation.
 */
export function NotFound({ title, text, icon }: NotFoundProps) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto grid max-w-page items-center gap-8 px-4 py-10 font-sans text-foreground sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16">
      {/* Only the mood: the heading says what happened. The first thing on the page, so not lazy. */}
      <Photo src={notFoundPhoto} alt="" ratio="4/3" priority fallback={null} className="rounded-xl" />
      <div className="flex flex-col items-start gap-6">
        {/* The heading says it; the number and the symbol only show it. */}
        {icon !== undefined ? (
          <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-primary-100 text-primary-text dark:bg-primary-50/10 [&_svg]:size-8">
            {icon}
          </span>
        ) : (
          <span aria-hidden="true" className="font-display text-6xl leading-none text-primary-text sm:text-7xl">
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
    </div>
  )
}
