import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { homePath, useCurrentUser } from '../api/auth.ts'
import { Button } from './button.tsx'
import { LanguageMenu } from './language-menu.tsx'

/**
 * The platform's header: the product name on the left; on the right the discreet entry for staff (the sign-in, or the own
 * area when signed in, the Superadmin's too) and the language.
 */
function SiteHeader() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const user = currentUser.data

  return (
    // Its own layer in page transitions, so it stays on top of the cover image moving below it (app.css). It has no
    // backdrop-filter inside: a view-transition-name makes it a backdrop root, so such a blur would not see the page.
    <header className="border-b border-border bg-background [view-transition-name:site-header]">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-2 px-4 sm:px-6">
        <Link to="/" className="shrink-0 rounded-lg font-display text-lg text-primary-text focus-ring">
          {t('app.name')}
        </Link>
        <div className="flex min-w-0 items-center gap-1">
          {/* Shown once it is known whether someone is signed in. */}
          {user !== undefined && (
            <Button asChild variant="ghost" className="min-w-0 shrink px-2 font-normal text-muted-foreground hover:text-foreground">
              <Link to={user !== null ? homePath(user.role) : '/login'}>
                <span className="truncate">{user !== null ? t('guest.toManagement') : t('guest.staffLogin')}</span>
              </Link>
            </Button>
          )}
          <LanguageMenu />
        </div>
      </div>
    </header>
  )
}

export { SiteHeader }
