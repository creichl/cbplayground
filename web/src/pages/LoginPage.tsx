import { CircleAlertIcon, EyeIcon, EyeOffIcon, LoaderCircleIcon } from 'lucide-react'
import { type FormEvent, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useSearchParams } from 'react-router'
import { homePath, useCurrentUser, useLogin } from '../api/auth.ts'
import { ApiError, requestErrorMessage } from '../api/client.ts'
import { useDocumentTitle } from '../i18n/title.ts'
import { Alert, AlertDescription } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { LanguageMenu } from '../ui/language-menu.tsx'
import { Photo } from '../ui/photo.tsx'

const loginErrors = {
  invalid_credentials: 'login.errors.invalidCredentials',
  locked_out: 'login.errors.lockedOut',
  deactivated: 'login.errors.deactivated',
  restaurant_deactivated: 'login.errors.restaurantDeactivated',
  too_many_requests: 'login.errors.tooManyRequests',
} as const

function isLoginError(code: string | null): code is keyof typeof loginErrors {
  return code !== null && code in loginErrors
}

/** The demo users of the development seed (see the README). Only shown in development. */
const demoPassword = 'Demo1234!'
const demoAccounts = [
  { email: 'admin@zur-linde.local', role: 'login.demo.tenantAdmin', restaurant: 'Gasthaus zur Linde' },
  { email: 'frontdesk@zur-linde.local', role: 'login.demo.frontDesk', restaurant: 'Gasthaus zur Linde' },
  { email: 'admin@kafana-dunav.local', role: 'login.demo.tenantAdmin', restaurant: 'Kafana Dunav' },
  { email: 'frontdesk@kafana-dunav.local', role: 'login.demo.frontDesk', restaurant: 'Kafana Dunav' },
  { email: 'admin@rooftop-belvedere.local', role: 'login.demo.tenantAdmin', restaurant: 'Rooftop Belvedere' },
  { email: 'frontdesk@rooftop-belvedere.local', role: 'login.demo.frontDesk', restaurant: 'Rooftop Belvedere' },
  { email: 'admin@il-faro.local', role: 'login.demo.tenantAdmin', restaurant: 'Trattoria Il Faro' },
  { email: 'frontdesk@il-faro.local', role: 'login.demo.frontDesk', restaurant: 'Trattoria Il Faro' },
  { email: 'admin@cafe-morgenrot.local', role: 'login.demo.tenantAdmin', restaurant: 'Café Morgenrot' },
  { email: 'frontdesk@cafe-morgenrot.local', role: 'login.demo.frontDesk', restaurant: 'Café Morgenrot' },
  { email: 'admin@izakaya-kaze.local', role: 'login.demo.tenantAdmin', restaurant: 'Izakaya Kaze' },
  { email: 'frontdesk@izakaya-kaze.local', role: 'login.demo.frontDesk', restaurant: 'Izakaya Kaze' },
  { email: 'superadmin@cbplayground.local', role: 'login.demo.superadmin', restaurant: null },
] as const

/** Only paths inside the app, so the login cannot be used to redirect to another site. */
function safeReturnTo(value: string | null) {
  return value !== null && value.startsWith('/') && !value.startsWith('//') ? value : null
}

/** The photo beside the sign-in, in `web/public/` (see CREDITS.md there). */
const loginPhoto = '/login-photo.webp'

type FieldErrors = { email?: string; password?: string }

/**
 * Staff sign-in, in the design system (src/ui). From 1024 px on it is split: on the left the form, centred and at most
 * 400 px wide, with the platform's mark, the heading, email and password (with a switch to show it) and "Sign in"; on the
 * right the photo of a restaurant in the full height with a soft gradient and a claim. On smaller screens only the form; the
 * photo is not loaded there. Why a sign-in failed shows above the form.
 */
export function LoginPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('login.title'), null)
  const [searchParams] = useSearchParams()
  const currentUser = useCurrentUser()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const id = useId()

  // Signed in, either just now or from an earlier visit: continue where the user wanted to go.
  if (currentUser.data) {
    return <Navigate to={safeReturnTo(searchParams.get('returnTo')) ?? homePath(currentUser.data.role)} replace />
  }

  if (currentUser.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        <LoaderCircleIcon aria-hidden="true" className="size-8 animate-spin motion-reduce:animate-none" />
      </div>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: FieldErrors = {
      email: /^\S+@\S+$/.test(email.trim()) ? undefined : t('login.validation.email'),
      password: password.length > 0 ? undefined : t('login.validation.password'),
    }
    setErrors(found)
    if (found.email !== undefined) {
      emailInput.current?.focus()
    } else if (found.password !== undefined) {
      passwordInput.current?.focus()
    } else {
      login.mutate({ email: email.trim(), password })
    }
  }

  const error = login.error
  const errorCode = error instanceof ApiError ? error.code : null

  return (
    <div className="grid min-h-dvh bg-background font-sans text-foreground lg:grid-cols-2">
      <div className="flex flex-col px-4 py-4 sm:px-6">
        <header className="flex items-center justify-between gap-2">
          <Link to="/" className="rounded-lg font-display text-lg text-primary-text focus-ring">
            {t('app.name')}
          </Link>
          <LanguageMenu />
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-[400px] flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-3xl text-balance">{t('login.title')}</h1>
              <p className="text-muted-foreground">{t('login.subtitle')}</p>
            </div>

            <form noValidate onSubmit={submit} className="flex flex-col gap-5">
              {error !== null && (
                <Alert variant="destructive">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertDescription>{isLoginError(errorCode) ? t(loginErrors[errorCode]) : requestErrorMessage(error, t)}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-email`}>{t('login.email')}</Label>
                <Input
                  ref={emailInput}
                  id={`${id}-email`}
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(event) => {
                    setEmail(event.currentTarget.value)
                    setErrors((current) => ({ ...current, email: undefined }))
                  }}
                  aria-invalid={errors.email !== undefined}
                  aria-describedby={errors.email !== undefined ? `${id}-email-error` : undefined}
                  className="h-11"
                />
                {errors.email !== undefined && (
                  <p id={`${id}-email-error`} className="text-sm text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-password`}>{t('login.password')}</Label>
                <div className="relative">
                  <Input
                    ref={passwordInput}
                    id={`${id}-password`}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.currentTarget.value)
                      setErrors((current) => ({ ...current, password: undefined }))
                    }}
                    aria-invalid={errors.password !== undefined}
                    aria-describedby={errors.password !== undefined ? `${id}-password-error` : undefined}
                    className="h-11 pr-12"
                  />
                  {/* A switch: the name stays, aria-pressed says whether the password is shown. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('login.showPassword')}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
                  </Button>
                </div>
                {errors.password !== undefined && (
                  <p id={`${id}-password-error`} className="text-sm text-destructive">
                    {errors.password}
                  </p>
                )}
              </div>

              <Button type="submit" size="lg" disabled={login.isPending} className="mt-1 w-full">
                {login.isPending && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                {login.isPending ? t('login.submitting') : t('login.submit')}
              </Button>
            </form>

            {import.meta.env.DEV && (
              <DemoAccounts
                onPick={(account) => {
                  setEmail(account)
                  setPassword(demoPassword)
                  setErrors({})
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* Only a picture of the place with the platform's claim; it stays in view while the form scrolls. */}
      <aside className="relative hidden lg:block">
        <div className="sticky top-0 h-dvh">
          <Photo src={loginPhoto} alt="" fallback={null} className="bg-stone-800" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/75 via-black/20 to-transparent" />
          <p className="absolute right-12 bottom-12 left-12 max-w-lg font-display text-3xl text-balance text-white">{t('login.claim')}</p>
        </div>
      </aside>
    </div>
  )
}

/** Development only: the demo users as a compact list with role and restaurant; a click fills in the sign-in form. */
function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const { t } = useTranslation()
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-xl border border-dashed border-input p-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-sm font-semibold">
          {t('login.demo.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('login.demo.text', { password: demoPassword })}</p>
      </div>
      <ul className="-mx-2 flex flex-col">
        {demoAccounts.map((account) => (
          <li key={account.email}>
            <button
              type="button"
              onClick={() => onPick(account.email)}
              className="flex min-h-11 w-full cursor-pointer flex-col items-start gap-1 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus-ring"
            >
              <span className="font-medium wrap-anywhere">{account.email}</span>
              <span className="flex flex-wrap gap-1">
                <Badge variant="secondary">{t(account.role)}</Badge>
                {account.restaurant !== null && <Badge variant="outline">{account.restaurant}</Badge>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
