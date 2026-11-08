import { FlameIcon, ImageIcon, InfoIcon, LeafIcon, type LucideIcon, SproutIcon, WheatOffIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Currency, type Mark, marks, type PublicMenu, usePublicMenu } from '../../api/menu.ts'
import { formatPrice } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Button } from '../../ui/button.tsx'
import { Lightbox, type LightboxPhoto } from '../../ui/lightbox.tsx'
import { Reveal, Stagger } from '../../ui/motion/reveal.tsx'
import { Photo } from '../../ui/photo.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip.tsx'
import { sectionIds } from './layout.ts'

type Dish = PublicMenu['sections'][number]['items'][number]

/** Each section shows this many dishes until the guest asks for the whole menu, which then shows every dish of every section. */
const collapsedCount = 8

/** The menu starts loading this far before it scrolls into view, so it is there when the guest arrives. */
const loadAhead = '800px'

const markIcons: Record<Mark, LucideIcon> = {
  vegetarian: LeafIcon,
  vegan: SproutIcon,
  glutenFree: WheatOffIcon,
  spicy: FlameIcon,
}

const photoFallback = (
  <span className="flex items-center justify-center text-muted-foreground">
    <ImageIcon aria-hidden="true" className="size-6" strokeWidth={1.5} />
  </span>
)

/**
 * The restaurant's menu on its page, like Resy or Tock show it: the heading in the guest's language, the dishes in the
 * restaurant's. On top the recommendations of the house that have a photo, as 4:3 photo cards (a strip to swipe on phones, up
 * to 4 in a row from 1024 px on); below them the sections as tabs (chips to scroll on phones), each dish as a row with name,
 * description, marks, allergens and price, with an 80 px thumbnail when it has a photo, which opens the lightbox with the
 * photos of its section. Each section shows at most 8 dishes until "Show whole menu" below a longer one, which shows every
 * dish of every section from then on. Below them a legend of the marks
 * and a note on the allergens.
 * The menu is loaded on its own, once the section comes near the view, so it never holds up the reservation card. While
 * it loads a skeleton stands in; without a menu, or when it cannot be loaded (it is not needed to book), the section is
 * left out.
 */
export function MenuSection({ slug, restaurantName }: { slug: string; restaurantName: string }) {
  const { t } = useTranslation()
  const anchor = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const menu = usePublicMenu(slug, near)

  useEffect(() => {
    const element = anchor.current
    if (element === null || near) {
      return
    }
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: `${loadAhead} 0px` })
    observer.observe(element)
    return () => observer.disconnect()
  }, [near])

  // Loaded already, e.g. for the page's section navigation: shown right away.
  if (!near && menu.data === undefined) {
    return <div ref={anchor} aria-hidden="true" />
  }
  if (menu.isPending) {
    return (
      <section id={sectionIds.menu} aria-busy="true" aria-label={t('booking.menu.title')} className="flex scroll-mt-36 flex-col gap-4">
        <h2 tabIndex={-1} className="font-display text-2xl outline-none sm:text-3xl">
          {t('booking.menu.title')}
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className={cn('aspect-4/3 rounded-xl', key > 1 && 'max-lg:hidden')} />
          ))}
        </div>
        <Skeleton className="h-9 w-72" />
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex gap-4">
            <Skeleton className="size-20 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4" />
            </div>
          </div>
        ))}
      </section>
    )
  }
  if (menu.isError || menu.data.sections.length === 0) {
    return null
  }

  return <MenuContent menu={menu.data} restaurantName={restaurantName} />
}

/** The photos shown in the lightbox, and which of them; null while it is closed. */
type LightboxState = { photos: LightboxPhoto[]; index: number }

function MenuContent({ menu, restaurantName }: { menu: PublicMenu; restaurantName: string }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('0')
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  // The element that opened the lightbox, so the focus returns to it.
  const trigger = useRef<HTMLElement | null>(null)

  const recommendations = menu.sections.flatMap((section) => section.items).filter((dish) => dish.recommended && dish.photoUrl !== null)
  const toPhotos = (dishes: Dish[]) =>
    dishes.flatMap((dish) => (dish.photoUrl === null ? [] : [{ id: dish.id, url: dish.photoUrl, caption: dish.name }]))
  const open = (dishes: Dish[], dish: Dish, element: HTMLElement) => {
    trigger.current = element
    const photos = toPhotos(dishes)
    setLightbox({ photos, index: photos.findIndex((photo) => photo.id === dish.id) })
  }
  const usedMarks = marks.filter((mark) => menu.sections.some((section) => section.items.some((dish) => dish[mark])))

  return (
    <Reveal>
      <section id={sectionIds.menu} aria-labelledby="menu-heading" className="flex scroll-mt-36 flex-col gap-6">
        <h2 id="menu-heading" tabIndex={-1} className="font-display text-2xl outline-none sm:text-3xl">
          {t('booking.menu.title')}
        </h2>

        {recommendations.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="font-display text-xl">{t('booking.menu.recommendations')}</h3>
            <Stagger>
              <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
                {recommendations.map((dish) => (
                  <li key={dish.id} className="group w-[70%] shrink-0 snap-start lift sm:w-[40%] lg:w-auto">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={(event) => open(recommendations, dish, event.currentTarget)}
                      className="flex w-full cursor-pointer flex-col gap-2 rounded-xl text-left outline-none focus-ring"
                    >
                      <Photo
                        src={dish.photoUrl}
                        alt={dish.name}
                        ratio="4/3"
                        fallback={photoFallback}
                        className="rounded-xl"
                        imageClassName="transition-[opacity,scale] duration-(--motion-long) group-hover:scale-105"
                      />
                      <span className="flex flex-col">
                        <span className="font-display text-lg leading-snug">{dish.name}</span>
                        {dish.price !== null && <Price price={dish.price} currency={menu.currency} className="text-muted-foreground" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Stagger>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList
            aria-label={t('booking.menu.sections')}
            className="-mx-4 flex w-auto max-w-none justify-start gap-2 overflow-x-auto bg-transparent px-4 py-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:w-fit lg:max-w-full lg:flex-wrap lg:gap-0 lg:bg-muted lg:p-1 [&::-webkit-scrollbar]:hidden"
          >
            {menu.sections.map((section, index) => (
              <TabsTrigger
                key={`${index}-${section.name}`}
                value={String(index)}
                className="shrink-0 rounded-full border border-border max-lg:data-[state=active]:border-primary max-lg:data-[state=active]:bg-primary max-lg:data-[state=active]:text-primary-foreground lg:rounded-md lg:border-0"
              >
                {section.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {menu.sections.map((section, index) => {
            const dishes = expanded ? section.items : section.items.slice(0, collapsedCount)
            return (
              <TabsContent key={`${index}-${section.name}`} value={String(index)} className="flex flex-col gap-4">
                {section.description !== null && <p className="text-muted-foreground">{section.description}</p>}
                <Stagger>
                  <ul className="flex flex-col divide-y divide-border">
                    {dishes.map((dish) => (
                      <DishRow key={dish.id} dish={dish} currency={menu.currency} onOpenPhoto={(element) => open(section.items, dish, element)} />
                    ))}
                  </ul>
                </Stagger>
                {!expanded && section.items.length > collapsedCount && (
                  <Button variant="outline" className="self-start" onClick={() => setExpanded(true)}>
                    {t('booking.menu.showAll')}
                  </Button>
                )}
              </TabsContent>
            )
          })}
        </Tabs>

        <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          {usedMarks.length > 0 && (
            <ul aria-label={t('booking.menu.legend')} className="flex flex-wrap gap-x-5 gap-y-1">
              {usedMarks.map((mark) => {
                const Icon = markIcons[mark]
                return (
                  <li key={mark} className="inline-flex items-center gap-1.5">
                    <Icon aria-hidden className="size-4 text-primary-text" />
                    {t(`booking.menu.marks.${mark}`)}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="flex gap-1.5">
            <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('booking.menu.allergenNote')}
          </p>
        </div>

        <Lightbox
          photos={lightbox?.photos ?? []}
          index={lightbox?.index ?? null}
          onIndexChange={(index) => setLightbox((state) => (state === null ? state : { ...state, index }))}
          onClose={() => setLightbox(null)}
          title={restaurantName}
          returnFocus={() => (trigger.current?.isConnected ? trigger.current : null)}
        />
      </section>
    </Reveal>
  )
}

/** A dish: its thumbnail (when it has a photo), name with its marks, description, allergens, and the price on the right. */
function DishRow({ dish, currency, onOpenPhoto }: { dish: Dish; currency: Currency; onOpenPhoto: (element: HTMLElement) => void }) {
  const { t } = useTranslation()
  const dishMarks = marks.filter((mark) => dish[mark])

  return (
    <li className="flex gap-4 py-4 first:pt-0">
      {dish.photoUrl !== null && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t('booking.menu.showPhoto', { name: dish.name })}
          onClick={(event) => onOpenPhoto(event.currentTarget)}
          className="group size-20 shrink-0 cursor-pointer overflow-hidden rounded-lg outline-none focus-ring"
        >
          <Photo
            src={dish.photoUrl}
            alt=""
            fallback={photoFallback}
            imageClassName="transition-[opacity,scale] duration-(--motion-long) group-hover:scale-105"
          />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-lg leading-snug">
            {dish.name}
            {dishMarks.length > 0 && (
              <span className="inline-flex gap-1">
                {dishMarks.map((mark) => {
                  const Icon = markIcons[mark]
                  return (
                    <Tooltip key={mark}>
                      <TooltipTrigger asChild>
                        <span role="img" aria-label={t(`booking.menu.marks.${mark}`)} className="inline-flex text-primary-text">
                          <Icon aria-hidden className="size-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t(`booking.menu.marks.${mark}`)}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </span>
            )}
          </h3>
          {dish.price !== null && <Price price={dish.price} currency={currency} className="shrink-0 font-medium" />}
        </div>
        {dish.description !== null && <p className="text-muted-foreground">{dish.description}</p>}
        {dish.allergens.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('booking.menu.allergens', { list: dish.allergens.map((allergen) => t(`booking.menu.allergenNames.${allergen}`)).join(', ') })}
          </p>
        )}
      </div>
    </li>
  )
}

/** A price in the guest's language, with figures of equal width, so the prices line up. */
function Price({ price, currency, className }: { price: number; currency: Currency; className?: string }) {
  const { i18n } = useTranslation()
  return <span className={cn('tabular-nums', className)}>{formatPrice(price, currency, i18n.resolvedLanguage ?? 'en')}</span>
}
