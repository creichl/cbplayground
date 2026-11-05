import { ArrowRightIcon, CircleAlertIcon, InfoIcon, MoonIcon, PhoneIcon, SunIcon, TriangleAlertIcon, UtensilsCrossedIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { BrandStyle } from '../brandTheme.ts'
import { BrandTheme } from '../components/BrandTheme.tsx'
import { formatLongDate, formatTime } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'
import { cn } from '../lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Calendar } from '../ui/calendar.tsx'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card.tsx'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { LanguageMenu } from '../ui/language-menu.tsx'
import { ParallaxImage } from '../ui/motion/parallax-image.tsx'
import { Reveal, Stagger } from '../ui/motion/reveal.tsx'
import { SuccessMark } from '../ui/motion/success-mark.tsx'
import { Photo } from '../ui/photo.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'
import { Separator } from '../ui/separator.tsx'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet.tsx'
import { SiteFooter } from '../ui/site-footer.tsx'
import { SiteHeader } from '../ui/site-header.tsx'
import { Skeleton } from '../ui/skeleton.tsx'
import { Toaster } from '../ui/sonner.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.tsx'
import { Textarea } from '../ui/textarea.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx'

/** The brandings of the three demo restaurants (api/Cbplayground.Api/Data/DevelopmentSeed.cs). */
const demoBrandings: Record<string, BrandStyle & { name: string }> = {
  'zur-linde': { name: 'Gasthaus zur Linde', brandColor: '#5a7d3a', themeMode: 'Light', fontStyle: 'Rustic' },
  'kafana-dunav': { name: 'Kafana Dunav', brandColor: '#1f5f8b', themeMode: 'Light', fontStyle: 'Classic' },
  'rooftop-belvedere': { name: 'Rooftop Belvedere', brandColor: '#c9a96e', themeMode: 'Dark', fontStyle: 'Elegant' },
}

/** "Without branding": a restaurant that has not set up its branding, in the platform's colour. */
const withoutBranding = 'none'

const colorTokens = [
  'background',
  'foreground',
  'card',
  'popover',
  'secondary',
  'muted',
  'muted-foreground',
  'accent',
  'border',
  'input',
  'ring',
  'primary',
  'primary-foreground',
  'primary-hover',
  'primary-text',
  'destructive',
  'success',
  'warning',
]

const primarySteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

const typeScale = [
  ['text-xs', 12],
  ['text-sm', 14],
  ['text-base', 16],
  ['text-lg', 18],
  ['text-xl', 20],
  ['text-2xl', 24],
  ['text-3xl', 30],
  ['text-4xl', 36],
  ['text-5xl', 48],
  ['text-6xl', 60],
] as const

/**
 * Development only (/dev/ui): every token and component of the design system, in light and dark and in the brandings of
 * the demo restaurants. The reference for the guest pages and their review.
 */
export function StyleguidePage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  useDocumentTitle(t('styleguide.title'), null)
  const [branding, setBranding] = useState('zur-linde')
  const [themeMode, setThemeMode] = useState<BrandStyle['themeMode']>('Light')
  const [date, setDate] = useState<Date | undefined>(() => new Date())

  const demo = branding === withoutBranding ? null : demoBrandings[branding]
  const brandStyle: BrandStyle = { brandColor: demo?.brandColor ?? null, fontStyle: demo?.fontStyle ?? 'Modern', themeMode }

  function chooseBranding(value: string) {
    setBranding(value)
    setThemeMode(value === withoutBranding ? 'Light' : demoBrandings[value].themeMode)
  }

  return (
    <BrandTheme brandStyle={brandStyle} fullHeight>
      <div className="min-h-dvh bg-background font-sans text-foreground">
        <div className="sticky top-0 z-40 border-b border-border bg-background">
          <div className="mx-auto flex max-w-page flex-wrap items-end gap-4 px-4 py-3 sm:px-6">
            <div className="mr-auto">
              <h1 className="font-display text-2xl">{t('styleguide.title')}</h1>
              <p className="text-sm text-muted-foreground">{t('styleguide.intro')}</p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="styleguide-branding">{t('styleguide.branding')}</Label>
              <Select value={branding} onValueChange={chooseBranding}>
                <SelectTrigger id="styleguide-branding" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={withoutBranding}>{t('styleguide.withoutBranding')}</SelectItem>
                  {Object.entries(demoBrandings).map(([slug, { name }]) => (
                    <SelectItem key={slug} value={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium" id="styleguide-mode">
                {t('styleguide.mode')}
              </span>
              <div role="group" aria-labelledby="styleguide-mode" className="flex gap-1 rounded-lg bg-muted p-1">
                <Button size="sm" variant={themeMode === 'Light' ? 'outline' : 'ghost'} aria-pressed={themeMode === 'Light'} onClick={() => setThemeMode('Light')}>
                  <SunIcon aria-hidden="true" />
                  {t('styleguide.light')}
                </Button>
                <Button size="sm" variant={themeMode === 'Dark' ? 'outline' : 'ghost'} aria-pressed={themeMode === 'Dark'} onClick={() => setThemeMode('Dark')}>
                  <MoonIcon aria-hidden="true" />
                  {t('styleguide.dark')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <main className="mx-auto flex max-w-page flex-col gap-16 px-4 py-12 sm:px-6">
          <Section title={t('styleguide.colors')}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {colorTokens.map((token) => (
                <Swatch key={token} token={token} />
              ))}
            </div>
          </Section>

          <Section title={t('styleguide.primaryScale')}>
            <div className="grid grid-cols-5 gap-4 lg:grid-cols-10">
              {primarySteps.map((step) => (
                <Swatch key={step} token={`primary-${step}`} />
              ))}
            </div>
          </Section>

          <Section title={t('styleguide.typography')}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Code>--font-display</Code>
                  <p className="font-display text-4xl text-balance">{t('home.heading')}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Code>--font-sans</Code>
                  <p className="text-base">{t('home.subtitle')}</p>
                </div>
              </div>
              <Separator />
              <div className="flex flex-col gap-3">
                {typeScale.map(([className, pixels]) => (
                  <div key={className} className="flex items-baseline gap-4">
                    <Code className="w-28 shrink-0">{`${className} · ${pixels}`}</Code>
                    <span className={cn(className, 'truncate', pixels >= 24 && 'font-display')}>{t('home.title')}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                <Code>tabular-nums</Code>
                <p className="text-lg tabular-nums">
                  {['11:30', '18:00', '19:15', '20:45'].map((time) => formatTime(time, language)).join(' · ')} ·{' '}
                  {new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR' }).format(24.5)}
                </p>
              </div>
            </div>
          </Section>

          <Section title={t('styleguide.radii')}>
            <div className="flex flex-wrap items-end gap-6">
              <Sample label={`rounded-xl · ${t('styleguide.radiusCard')}`}>
                <div className="size-24 rounded-xl border border-border bg-card" />
              </Sample>
              <Sample label={`rounded-lg · ${t('styleguide.radiusField')}`}>
                <div className="h-10 w-40 rounded-lg border border-input bg-background" />
              </Sample>
              <Sample label={`rounded-full · ${t('styleguide.radiusChip')}`}>
                <div className="h-8 w-24 rounded-full bg-secondary" />
              </Sample>
            </div>
          </Section>

          <Section title={t('styleguide.shadows')}>
            <div className="flex flex-wrap gap-8 rounded-xl bg-muted p-8">
              <Sample label={`shadow-card · ${t('styleguide.shadowCard')}`}>
                <div className="size-28 rounded-xl bg-card shadow-card" />
              </Sample>
              <Sample label={`shadow-float · ${t('styleguide.shadowFloat')}`}>
                <div className="size-28 rounded-xl bg-popover shadow-float" />
              </Sample>
              <Sample label={`shadow-dialog · ${t('styleguide.shadowDialog')}`}>
                <div className="size-28 rounded-xl bg-card shadow-dialog" />
              </Sample>
            </div>
          </Section>

          <Section title={t('styleguide.motion')}>
            <MotionSamples />
          </Section>

          <Section title={t('styleguide.focus')}>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t('styleguide.focusHint')}</p>
              <div className="flex flex-wrap items-center gap-4">
                <Button>{t('booking.continue')}</Button>
                <Input className="w-56" aria-label={t('booking.details.name')} placeholder={t('booking.details.name')} />
                <Button variant="link">{t('home.reserve')}</Button>
              </div>
            </div>
          </Section>

          <Section title={t('styleguide.components')}>
            <div className="flex flex-col gap-12">
              <Block name="Button">
                <div className="flex flex-col gap-4">
                  {(['primary', 'secondary', 'outline', 'ghost', 'link'] as const).map((variant) => (
                    <div key={variant} className="flex flex-wrap items-center gap-3">
                      <Code className="w-24">{variant}</Code>
                      <Button variant={variant} size="sm">
                        {t('booking.continue')}
                      </Button>
                      <Button variant={variant}>{t('booking.continue')}</Button>
                      <Button variant={variant} size="lg">
                        {t('booking.reserveTable')}
                        <ArrowRightIcon aria-hidden="true" />
                      </Button>
                      <Button variant={variant} size="icon" aria-label={t('booking.continue')}>
                        <ArrowRightIcon aria-hidden="true" />
                      </Button>
                      <Button variant={variant} disabled>
                        {t('booking.continue')}
                      </Button>
                    </div>
                  ))}
                </div>
              </Block>

              <Block name="Badge">
                <div className="flex flex-wrap gap-2">
                  <Badge>{t('booking.table.legend.selected')}</Badge>
                  <Badge variant="secondary">{t('booking.time.evening')}</Badge>
                  <Badge variant="outline">{t('booking.guestsCount', { count: 4 })}</Badge>
                  <Badge variant="success">{t('reservations.status.confirmed')}</Badge>
                  <Badge variant="warning">{t('reservations.status.requested')}</Badge>
                  <Badge variant="destructive">{t('reservations.status.cancelled')}</Badge>
                </div>
              </Block>

              <Block name="Alert">
                <div className="flex max-w-xl flex-col gap-3">
                  <Alert variant="destructive" role="note">
                    <CircleAlertIcon aria-hidden="true" />
                    <AlertDescription>{t('login.errors.invalidCredentials')}</AlertDescription>
                  </Alert>
                  <Alert role="note">
                    <PhoneIcon aria-hidden="true" />
                    <AlertTitle>{t('guestReservation.contact')}</AlertTitle>
                    <AlertDescription>{t('guestReservation.cannotCancel')}</AlertDescription>
                  </Alert>
                  <Alert role="note">
                    <InfoIcon aria-hidden="true" />
                    <AlertDescription>{t('embed.notFound')}</AlertDescription>
                  </Alert>
                  <Alert variant="warning" role="note">
                    <TriangleAlertIcon aria-hidden="true" />
                    <AlertTitle>{t('booking.partySize.callTitle')}</AlertTitle>
                    <AlertDescription>{t('booking.partySize.callText', { count: 8 })}</AlertDescription>
                  </Alert>
                </div>
              </Block>

              <Block name="Input · Textarea · Label · Select">
                <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="styleguide-name">{t('booking.details.name')}</Label>
                    <Input id="styleguide-name" autoComplete="name" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="styleguide-phone">{t('booking.details.phone')}</Label>
                    <Input id="styleguide-phone" type="tel" aria-invalid="true" aria-describedby="styleguide-phone-error" defaultValue="12" />
                    <p id="styleguide-phone-error" className="text-sm text-destructive">
                      {t('booking.details.invalidPhone')}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="styleguide-guests">{t('booking.bar.guests')}</Label>
                    <Select defaultValue="2">
                      <SelectTrigger id="styleguide-guests">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6].map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {t('booking.guestsCount', { count })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="styleguide-disabled">{t('booking.details.email')}</Label>
                    <Input id="styleguide-disabled" type="email" disabled />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="styleguide-notes">{t('booking.details.notes')}</Label>
                    <Textarea id="styleguide-notes" />
                  </div>
                </div>
              </Block>

              <Block name="Popover · Calendar">
                <div className="flex flex-wrap items-start gap-8">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">{t('booking.bar.date')}</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-64 justify-start font-normal">
                          {date !== undefined ? formatLongDate(isoDate(date), language) : t('booking.bar.date')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-3">
                        <Calendar mode="single" selected={date} onSelect={setDate} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Card className="py-3">
                    <CardContent className="px-3">
                      <Calendar mode="single" selected={date} onSelect={setDate} disabled={{ dayOfWeek: [1] }} />
                    </CardContent>
                  </Card>
                </div>
              </Block>

              <Block name="Dialog · Sheet">
                <div className="flex flex-wrap gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">{t('styleguide.openDialog')}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t('booking.details.contactTitle')}</DialogTitle>
                        <DialogDescription>{t('booking.details.contactHint')}</DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="styleguide-dialog-email">{t('booking.details.email')}</Label>
                        <Input id="styleguide-dialog-email" type="email" autoComplete="email" />
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">{t('common.cancel')}</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button>{t('common.save')}</Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  {(['bottom', 'right'] as const).map((direction) => (
                    <Sheet key={direction} direction={direction}>
                      <SheetTrigger asChild>
                        <Button variant="outline">{direction === 'bottom' ? t('styleguide.openSheet') : t('styleguide.openSheetSide')}</Button>
                      </SheetTrigger>
                      <SheetContent>
                        <SheetHeader>
                          <SheetTitle>{t('booking.summaryLabel')}</SheetTitle>
                          <SheetDescription>{t('booking.details.cancelHint')}</SheetDescription>
                        </SheetHeader>
                        <SheetFooter>
                          <SheetClose asChild>
                            <Button size="lg">{t('booking.continue')}</Button>
                          </SheetClose>
                        </SheetFooter>
                      </SheetContent>
                    </Sheet>
                  ))}
                </div>
              </Block>

              <Block name="Tabs">
                <Tabs defaultValue="evening" className="max-w-md">
                  <TabsList>
                    <TabsTrigger value="midday">{t('booking.time.midday')}</TabsTrigger>
                    <TabsTrigger value="evening">{t('booking.time.evening')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="midday" className="flex flex-wrap gap-2">
                    {['11:30', '12:00', '12:30', '13:00'].map((time) => (
                      <Button key={time} variant="outline" size="sm" className="rounded-full tabular-nums">
                        {formatTime(time, language)}
                      </Button>
                    ))}
                  </TabsContent>
                  <TabsContent value="evening" className="flex flex-wrap gap-2">
                    {['18:00', '18:30', '19:00', '19:30', '20:00'].map((time) => (
                      <Button key={time} variant="outline" size="sm" className="rounded-full tabular-nums">
                        {formatTime(time, language)}
                      </Button>
                    ))}
                  </TabsContent>
                </Tabs>
              </Block>

              <Block name="Card · Skeleton">
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>{demo?.name ?? t('app.name')}</CardTitle>
                      <CardDescription>{t('booking.restaurant.openUntil', { time: formatTime('22:00', language) })}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{t('home.subtitle')}</p>
                    </CardContent>
                    <CardFooter>
                      <Button>{t('booking.reserveTable')}</Button>
                    </CardFooter>
                  </Card>
                  <Card>
                    <CardHeader>
                      <Skeleton className="h-6 w-1/2" />
                      <Skeleton className="h-4 w-1/3" />
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <Skeleton className="h-4" />
                      <Skeleton className="h-4 w-4/5" />
                    </CardContent>
                    <CardFooter>
                      <Skeleton className="h-10 w-36" />
                    </CardFooter>
                  </Card>
                </div>
              </Block>

              <Block name="Tooltip · Separator · Toast">
                <div className="flex flex-wrap items-center gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" aria-label={t('booking.restaurant.infoTitle')}>
                        <InfoIcon aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('booking.restaurant.infoTitle')}</TooltipContent>
                  </Tooltip>
                  <Separator orientation="vertical" className="h-8" />
                  <Button variant="secondary" onClick={() => toast(t('booking.confirmation.copied'), { description: t('booking.confirmation.manageLinkHint') })}>
                    {t('styleguide.showToast')}
                  </Button>
                </div>
              </Block>

              <Block name="Photo">
                <div className="grid gap-6 sm:grid-cols-3">
                  <Sample label={t('styleguide.photoLoaded')}>
                    <Photo src="/login-photo.webp" alt="" ratio="4/3" className="rounded-xl" fallback={null} />
                  </Sample>
                  <Sample label={t('styleguide.photoPlaceholder')}>
                    <Photo src={null} alt="" ratio="4/3" className="rounded-xl bg-primary-50" fallback={null} />
                  </Sample>
                  <Sample label={t('styleguide.photoFallback')}>
                    <Photo
                      src="/missing-photo.webp"
                      alt=""
                      ratio="4/3"
                      className="rounded-xl bg-primary-50"
                      fallback={
                        <span className="flex items-center justify-center text-primary-text">
                          <UtensilsCrossedIcon aria-hidden="true" className="size-10" />
                        </span>
                      }
                    />
                  </Sample>
                </div>
              </Block>

              <Block name="LanguageMenu · SiteHeader · SiteFooter">
                <div className="flex flex-col gap-6">
                  <LanguageMenu />
                  <div className="overflow-hidden rounded-xl border border-border">
                    <SiteHeader />
                    <div className="h-16 bg-background" />
                    <SiteFooter />
                  </div>
                </div>
              </Block>
            </div>
          </Section>
        </main>
        <Toaster theme={themeMode === 'Dark' ? 'dark' : 'light'} />
      </div>
    </BrandTheme>
  )
}

/** A date as "YYYY-MM-DD" in local time, as the formatters take it. */
function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Times for the samples of the motion. */
const sampleTimes = ['18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30', '19:45']

/**
 * The motion of the guest pages, each building block with a sample (README, "Design system", Motion). "Simulate reduced
 * motion" sets data-reduce-motion on the document, so the whole page behaves as with the device's setting, dialogs and
 * sheets included. "Play again" draws the samples anew.
 */
function MotionSamples() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [reduced, setReduced] = useState(false)
  const [round, setRound] = useState(0)
  const [time, setTime] = useState<string | null>(null)
  const [step, setStep] = useState<{ index: number; back: boolean } | null>(null)

  useEffect(() => {
    if (!reduced) {
      return
    }
    document.documentElement.dataset.reduceMotion = ''
    return () => {
      delete document.documentElement.dataset.reduceMotion
    }
  }, [reduced])

  const chip = 'relative inline-flex h-11 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-medium tabular-nums press focus-ring'

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('styleguide.motionHint')}</p>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Code>--motion-fast · 150 ms</Code> {t('styleguide.motionFast')}
          </li>
          <li>
            <Code>--motion-medium · 200 ms</Code> {t('styleguide.motionMedium')}
          </li>
          <li>
            <Code>--motion-slow · 300 ms</Code> {t('styleguide.motionSlow')}
          </li>
          <li>
            <Code>--motion-long · 600 ms</Code> {t('styleguide.motionLong')}
          </li>
          <li>
            <Code>--ease-out · --ease-spring</Code> {t('styleguide.motionEasing')}
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.currentTarget.checked)} className="size-4 accent-primary focus-ring" />
            {t('styleguide.reduceMotion')}
          </label>
          <Button variant="outline" onClick={() => setRound((value) => value + 1)}>
            {t('styleguide.replay')}
          </Button>
        </div>
      </div>

      {/* A new round draws every sample anew, so its entrance plays again. */}
      <div key={round} className="flex flex-col gap-12">
        <Block name="Reveal">
          <p className="text-sm text-muted-foreground">{t('styleguide.motionReveal')}</p>
          <Reveal>
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>{t('booking.restaurant.about')}</CardTitle>
                <CardDescription>{t('home.subtitle')}</CardDescription>
              </CardHeader>
            </Card>
          </Reveal>
        </Block>

        <Block name="Stagger · pulse-ring">
          <p className="text-sm text-muted-foreground">{t('styleguide.motionStagger')}</p>
          <Stagger>
            <ul className="grid max-w-md grid-cols-4 gap-2">
              {sampleTimes.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    aria-pressed={time === option}
                    onClick={() => setTime(option)}
                    className={cn(
                      chip,
                      'w-full',
                      time === option
                        ? 'border-primary bg-primary text-primary-foreground pulse-ring hover:bg-primary-hover'
                        : 'border-input bg-background hover:border-primary hover:bg-primary-50 dark:hover:bg-accent',
                    )}
                  >
                    {formatTime(option, language)}
                  </button>
                </li>
              ))}
            </ul>
          </Stagger>
        </Block>

        <Block name="press · lift">
          <p className="text-sm text-muted-foreground">{t('styleguide.motionPress')}</p>
          <div className="flex flex-wrap items-start gap-6">
            <Button>{t('booking.reserveTable')}</Button>
            <button type="button" className={cn(chip, 'border-input bg-background px-4 hover:bg-accent')}>
              {t('booking.guestsCount', { count: 2 })}
            </button>
            <div className="group flex w-56 flex-col gap-2 lift">
              <Photo
                src="/login-photo.webp"
                alt=""
                ratio="4/3"
                className="rounded-xl"
                imageClassName="transition-[opacity,scale] duration-(--motion-long) group-hover:scale-105"
                fallback={null}
              />
              <span className="font-display text-lg">{t('booking.restaurant.areas')}</span>
            </div>
          </div>
        </Block>

        <Block name="ParallaxImage">
          <p className="text-sm text-muted-foreground">{t('styleguide.motionParallax')}</p>
          <div className="relative h-64 overflow-clip rounded-xl bg-primary-900">
            <ParallaxImage src="/login-photo.webp" alt="" />
          </div>
        </Block>

        <Block name="animate-slide-in">
          <p className="text-sm text-muted-foreground">{t('styleguide.motionSlide')}</p>
          <Card className="max-w-md gap-4 overflow-clip px-6">
            <div
              key={step?.index ?? 0}
              className={cn('flex flex-col gap-1', step !== null && 'animate-slide-in', step?.back === true && '[--slide-from:-1.5rem]')}
            >
              <span className="text-sm text-muted-foreground">{t('booking.dialog.stepOf', { step: (step?.index ?? 0) + 1, total: 3 })}</span>
              <span className="font-display text-xl">
                {t((['booking.dialog.stepTable', 'booking.dialog.stepDetails', 'booking.dialog.stepDone'] as const)[step?.index ?? 0])}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={(step?.index ?? 0) === 0} onClick={() => setStep({ index: (step?.index ?? 0) - 1, back: true })}>
                {t('guestReservation.confirm.back')}
              </Button>
              <Button disabled={(step?.index ?? 0) === 2} onClick={() => setStep({ index: (step?.index ?? 0) + 1, back: false })}>
                {t('booking.continue')}
              </Button>
            </div>
          </Card>
        </Block>

        <Block name="SuccessMark">
          <p className="text-sm text-muted-foreground">{t('styleguide.motionSuccess')}</p>
          <div className="flex flex-col items-start gap-6">
            <SuccessMark />
            <div className="w-full max-w-md animate-rise rounded-2xl border border-border bg-card px-6 py-5 shadow-card [animation-delay:200ms]">
              <p className="text-sm text-muted-foreground">{t('booking.confirmation.referenceCode')}</p>
              <p className="font-mono text-3xl font-bold tracking-[0.15em] text-primary-text">K7M2QX</p>
            </div>
          </div>
        </Block>

        <Block name="Skeleton · Dialog">
          <p className="text-sm text-muted-foreground">{t('styleguide.motionPanels')}</p>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex w-56 flex-col gap-2" aria-hidden="true">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-11 rounded-full" />
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">{t('styleguide.openDialog')}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('guestReservation.confirm.title')}</DialogTitle>
                  <DialogDescription>{t('guestReservation.confirm.text')}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">{t('guestReservation.confirm.back')}</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </Block>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-display text-3xl">{title}</h2>
      {children}
    </section>
  )
}

/** One component; its name is the code name, so it is not translated. */
function Block({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-mono text-sm font-semibold">{name}</h3>
      {children}
    </div>
  )
}

function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function Code({ className, children }: { className?: string; children: ReactNode }) {
  return <code className={cn('font-mono text-xs text-muted-foreground', className)}>{children}</code>
}

/** A colour token: its surface (with a border, so white shows on white) and its name. */
function Swatch({ token }: { token: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-14 rounded-lg border border-border" style={{ background: `var(--${token})` }} />
      <Code>{`--${token}`}</Code>
    </div>
  )
}
