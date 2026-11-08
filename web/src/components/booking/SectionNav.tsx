import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils.ts'
import { headerHeight, scrollToSection, sectionNavHeight } from './layout.ts'

/** A section of the restaurant's page: its element's id and its title. */
export type PageSection = { id: string; title: string }

/** The id of the mark at the end of the page's sections: once it is in view, the last section is the current one. */
export const sectionsEndId = 'sections-end'

/**
 * The section navigation of the restaurant's page, like Resy or Tock have it: a row below the fixed header, once the page has
 * scrolled past the cover image (`visible`), with the sections the page has, in page order. A click scrolls softly to the
 * section below the header (with less motion it jumps) and moves the focus to its heading. The section at the top of the
 * view is marked, followed with an IntersectionObserver; at the end of the page, the last one. On phones the row scrolls
 * sideways and keeps the marked item in view. While hidden it is inert. A page without sections has no row.
 */
export function SectionNav({ sections, visible }: { sections: PageSection[]; visible: boolean }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<string | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const ids = sections.map((section) => section.id).join(' ')

  useEffect(() => {
    const elements = ids
      .split(' ')
      .map((id) => document.getElementById(id))
      .filter((element) => element !== null)
    const end = document.getElementById(sectionsEndId)
    if (elements.length === 0) {
      return
    }
    // The sections that reach into the band from below the navigation to the middle of the screen; the first of them is current.
    const inBand = new Set<Element>()
    let atEnd = false
    const update = () => {
      const first = atEnd ? elements[elements.length - 1] : elements.find((element) => inBand.has(element))
      if (first !== undefined) {
        setCurrent(first.id)
      }
    }
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            inBand.add(entry.target)
          } else {
            inBand.delete(entry.target)
          }
        }
        update()
      },
      { rootMargin: `-${headerHeight + sectionNavHeight}px 0px -50% 0px` },
    )
    const endObserver = new IntersectionObserver(([entry]) => {
      atEnd = entry.isIntersecting
      update()
    })
    elements.forEach((element) => sectionObserver.observe(element))
    if (end !== null) {
      endObserver.observe(end)
    }
    return () => {
      sectionObserver.disconnect()
      endObserver.disconnect()
    }
  }, [ids])

  // The marked item stays in view in the row, in its middle where it can be.
  useEffect(() => {
    const row = list.current
    const item = row?.querySelector<HTMLElement>(`[data-section="${current}"]`)
    if (row == null || item == null || row.scrollWidth <= row.clientWidth) {
      return
    }
    const left = item.offsetLeft - (row.clientWidth - item.offsetWidth) / 2
    row.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [current])

  if (sections.length === 0) {
    return null
  }

  return (
    <nav
      aria-label={t('booking.restaurant.sections')}
      // Hidden from everyone while the cover image is in view.
      inert={!visible}
      className={cn(
        'fixed inset-x-0 top-16 z-30 h-14 border-b border-border bg-background/85 backdrop-blur-md transition-[translate,opacity] duration-(--motion-medium)',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
      )}
    >
      <ul
        ref={list}
        className="relative mx-auto flex h-full max-w-page items-center gap-1 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <a
              href={`#${section.id}`}
              data-section={section.id}
              aria-current={current === section.id ? 'location' : undefined}
              onClick={(event) => {
                event.preventDefault()
                scrollToSection(section.id)
              }}
              className={cn(
                'inline-flex h-10 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap press focus-ring touch:h-11',
                current === section.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
