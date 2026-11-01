import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { DayPicker } from 'react-day-picker'
import { de, enGB, sr, srLatn } from 'react-day-picker/locale'
import { useTranslation } from 'react-i18next'
import type { Language } from '../i18n/index.ts'
import { cn } from '../lib/utils.ts'

/** The calendar's language (month and day names, labels of the buttons) for each UI language. */
const locales = { en: enGB, de, 'sr-Latn': srLatn, 'sr-Cyrl': sr } satisfies Record<Language, unknown>

/** A month calendar (react-day-picker) in the user's language; weeks start on Monday. */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: ComponentProps<typeof DayPicker>) {
  const { i18n } = useTranslation()
  const language = (i18n.resolvedLanguage ?? 'en') as Language

  return (
    <DayPicker
      locale={locales[language]}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn('w-fit text-sm', className)}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'flex flex-col gap-2',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous:
          'inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent focus-ring disabled:pointer-events-none disabled:opacity-40 touch:size-11',
        button_next:
          'inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent focus-ring disabled:pointer-events-none disabled:opacity-40 touch:size-11',
        month_caption: 'flex h-10 items-center justify-center touch:h-11',
        caption_label: 'text-sm font-semibold',
        month_grid: 'border-collapse',
        weekdays: 'flex',
        weekday: 'w-10 text-xs font-medium text-muted-foreground touch:w-11',
        week: 'mt-1 flex',
        day: 'p-0 text-center',
        day_button:
          'inline-flex size-10 cursor-pointer items-center justify-center rounded-lg tabular-nums transition-colors hover:bg-accent focus-ring touch:size-11',
        today: 'font-semibold text-primary-text',
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover',
        outside: 'text-muted-foreground',
        disabled: 'text-muted-foreground opacity-50 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeftIcon aria-hidden="true" className="size-4" /> : <ChevronRightIcon aria-hidden="true" className="size-4" />,
      }}
      {...props}
    />
  )
}

export { Calendar }
