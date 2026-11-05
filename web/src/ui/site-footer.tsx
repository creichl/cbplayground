import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { LanguageMenu } from './language-menu.tsx'

/** The year of the copyright: when the page was opened. */
const year = new Date().getFullYear()

/**
 * The platform's plain footer: the copyright, the entry for staff (the sign-in, or the own area when signed in) and the
 * language.
 */
function SiteFooter() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const user = currentUser.data

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <p>{t('site.copyright', { year })}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          {/* Shown once it is known whether someone is signed in. */}
          {user !== undefined && (
            <Link
              to={user !== null ? homePath(user.role) : '/login'}
              className="inline-flex min-h-11 min-w-0 items-center truncate rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-ring"
            >
              {user !== null ? t('guest.toManagement') : t('guest.staffLogin')}
            </Link>
          )}
          <LanguageMenu className="font-normal text-muted-foreground hover:text-foreground" />
        </div>
      </div>
    </footer>
  )
}

export { SiteFooter }
