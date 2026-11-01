import { useTranslation } from 'react-i18next'

/** The year of the copyright: when the page was opened. */
const year = new Date().getFullYear()

/** The platform's plain footer. */
function SiteFooter() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-page px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>{t('site.copyright', { year })}</p>
      </div>
    </footer>
  )
}

export { SiteFooter }
