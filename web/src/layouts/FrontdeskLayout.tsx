import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { ParseKeys } from 'i18next'
import { CheckIcon, LogOutIcon, SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useMatch } from 'react-router'
import { type Role, useCurrentUser, useLogout } from '../api/auth.ts'
import { changeLanguage, type Language, languages } from '../i18n/index.ts'
import { Toaster } from '../ui/sonner.tsx'

const roleLabels: Record<Role, ParseKeys> = {
  Superadmin: 'auth.roles.superadmin',
  TenantAdmin: 'auth.roles.tenantAdmin',
  FrontDesk: 'auth.roles.frontDesk',
}

/**
 * The frame of the front desk in the design system, in the platform's look (no restaurant branding) and light: the screen
 * fills the window; the service screen brings its own top bar (FrontdeskHeader with its controls), every other page under
 * /frontdesk (e.g. "not found") gets the bar without them. Toasts (status changes with "Undo") appear at the bottom.
 */
export function FrontdeskLayout() {
  const serviceScreen = useMatch({ path: '/frontdesk', end: true }) !== null

  return (
    <div className="flex h-dvh flex-col bg-background font-sans text-foreground">
      {!serviceScreen && <FrontdeskHeader />}
      <Outlet />
      <Toaster position="bottom-center" />
    </div>
  )
}

/**
 * The top bar of the front desk: the restaurant's name, the controls of the page and the account menu. From 1280 px in one
 * row; below, the controls (`controls`) take a row of their own under the name, the actions (`actions`) and the menu.
 */
export function FrontdeskHeader({ controls, actions }: { controls?: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
        <Link to="/frontdesk" className="min-w-0 shrink truncate rounded-lg font-display text-lg leading-10 font-semibold focus-ring touch:leading-11">
          {currentUser.data?.tenant?.name ?? t('app.name')}
        </Link>
        {controls !== undefined && <div className="order-2 flex w-full flex-wrap items-center gap-2 xl:order-none xl:w-auto xl:flex-1">{controls}</div>}
        <div className="order-1 ml-auto flex items-center gap-2 xl:order-none">
          {actions}
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}

/** The initials of a name for the avatar, e.g. "FF" for "Felix Front". */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

const itemClass =
  'relative flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 touch:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0'

/** The account: name and role, the language, the way to the management for Tenant Admins, and sign-out. */
function AccountMenu() {
  const { t, i18n } = useTranslation()
  const currentUser = useCurrentUser()
  const logout = useLogout()
  const current = (i18n.resolvedLanguage ?? 'en') as Language

  if (!currentUser.data) {
    return null
  }
  const { displayName, email, role } = currentUser.data

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t('auth.userMenu')}
        className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full pr-1 pl-1 hover:bg-accent focus-ring touch:h-11 lg:pl-3"
      >
        <span className="hidden flex-col items-end leading-tight lg:flex">
          <span className="text-sm font-medium">{displayName}</span>
          <span className="text-xs text-muted-foreground">{t(roleLabels[role])}</span>
        </span>
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-text">
          {initials(displayName)}
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-64 origin-(--radix-dropdown-menu-content-transform-origin) rounded-xl border border-border bg-popover p-1 font-sans text-popover-foreground shadow-float data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
        >
          <div className="flex flex-col px-3 py-2">
            <span className="text-sm font-semibold">{displayName}</span>
            <span className="text-xs text-muted-foreground">{t(roleLabels[role])}</span>
            <span className="text-xs text-muted-foreground">{email}</span>
          </div>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          <DropdownMenu.Label className="px-3 py-1 text-xs font-medium text-muted-foreground">{t('language.label')}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={current} onValueChange={(language) => void changeLanguage(language as Language)}>
            {languages.map((language) => (
              <DropdownMenu.RadioItem key={language} value={language} lang={language} className={`${itemClass} pr-9`}>
                {t(`language.names.${language}`)}
                <DropdownMenu.ItemIndicator className="absolute right-3 flex">
                  <CheckIcon aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          {role === 'TenantAdmin' && (
            <DropdownMenu.Item asChild className={itemClass}>
              <Link to="/admin">
                <SettingsIcon aria-hidden="true" />
                {t('auth.toAdmin')}
              </Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={`${itemClass} text-destructive`} disabled={logout.isPending} onSelect={() => logout.mutate()}>
            <LogOutIcon aria-hidden="true" />
            {t('auth.logout')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
