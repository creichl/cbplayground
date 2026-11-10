import { PhoneIcon } from 'lucide-react'
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert.tsx'
import { Label } from '../../ui/label.tsx'
import { useSelectionPill } from '../../ui/motion/selection-pill.ts'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '../../ui/select.tsx'

/** Party sizes offered as chips one by one; larger ones up to the online limit follow under "More". */
const listedSizes = 8

type PartySizePickerProps = {
  value: number
  maxOnlinePartySize: number
  onChange: (guests: number) => void
}

/**
 * The look of a chip, chosen or not. The chosen one is see-through: the selection pill below it fills it in the accent colour,
 * and its label's colour cross-fades (press). Its content lies above the pill (relative), the other chips' surfaces below it.
 */
function chipLook(chosen: boolean) {
  return chosen
    ? 'border-transparent bg-transparent text-primary-foreground [&>*]:relative'
    : 'border-input bg-background hover:border-primary hover:bg-primary-50 dark:hover:bg-accent [&>*]:relative'
}

/**
 * The party size on the reservation card: chips for 1 to 8 people, one tap each (on phones a row that scrolls sideways),
 * then "More" with the larger parties up to the largest that can be booked online, and one entry for still larger parties
 * (one more than that), which leads to the hint to call (PartySizeCallHint). The chosen size is filled by one selection pill,
 * which glides from chip to chip (useSelectionPill).
 */
export function PartySizePicker({ value, maxOnlinePartySize, onChange }: PartySizePickerProps) {
  const { t } = useTranslation()
  const labelId = useId()
  const tooLargeValue = maxOnlinePartySize + 1
  const sizes = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
  const item = (size: number) => (
    <SelectItem key={size} value={String(size)}>
      {t('booking.guestsCount', { count: size })}
    </SelectItem>
  )
  const moreChosen = value > listedSizes || value > maxOnlinePartySize
  const rowRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  useSelectionPill(rowRef, pillRef)

  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col gap-1.5">
      <Label id={labelId} asChild>
        <span>{t('booking.bar.guests')}</span>
      </Label>
      {/* The padding keeps the focus rings inside the row, which clips what is outside it while it scrolls. */}
      <div
        ref={rowRef}
        className="relative -m-1 flex snap-x scroll-px-1 gap-1.5 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        <span ref={pillRef} aria-hidden="true" data-selection-pill="" className="pointer-events-none absolute top-0 left-0 rounded-full bg-primary opacity-0" />
        {sizes(1, Math.min(listedSizes, maxOnlinePartySize)).map((size) => (
          <button
            key={size}
            type="button"
            data-chosen={value === size || undefined}
            aria-pressed={value === size}
            aria-label={t('booking.guestsCount', { count: size })}
            onClick={() => onChange(size)}
            className={cn(
              'inline-flex size-11 shrink-0 cursor-pointer snap-start items-center justify-center rounded-full border text-sm font-medium tabular-nums press focus-ring',
              chipLook(value === size),
            )}
          >
            <span>{size}</span>
          </button>
        ))}
        <Select value={moreChosen ? String(Math.min(value, tooLargeValue)) : ''} onValueChange={(selected) => onChange(Number(selected))}>
          <SelectTrigger
            // A combobox is not named by its text: the visible "More" as its name, the chosen size as its value.
            aria-label={t('booking.partySize.more')}
            data-chosen={moreChosen || undefined}
            className={cn(
              'h-11 w-auto shrink-0 snap-start rounded-full px-4 text-sm font-medium press touch:h-11 [&>svg]:text-current',
              chipLook(moreChosen),
              moreChosen && 'data-placeholder:text-primary-foreground',
            )}
          >
            <SelectValue placeholder={t('booking.partySize.more')} />
          </SelectTrigger>
          <SelectContent className="max-h-80 min-w-48">
            {maxOnlinePartySize > listedSizes && (
              <>
                <SelectGroup>
                  <SelectLabel>{t('booking.partySize.more')}</SelectLabel>
                  {sizes(listedSizes + 1, maxOnlinePartySize).map(item)}
                </SelectGroup>
                <SelectSeparator />
              </>
            )}
            <SelectItem value={String(tooLargeValue)}>{t('booking.partySize.moreThan', { count: maxOnlinePartySize })}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/** For a party too large to book online: the hint to call, with the restaurant's phone number. */
export function PartySizeCallHint({ maxOnlinePartySize, phone }: { maxOnlinePartySize: number; phone: string | null }) {
  const { t } = useTranslation()

  return (
    <Alert variant="warning" role="note">
      <PhoneIcon aria-hidden="true" />
      <AlertTitle>{t('booking.partySize.callTitle')}</AlertTitle>
      <AlertDescription>
        <p>{t('booking.partySize.callText', { count: maxOnlinePartySize })}</p>
        {phone !== null ? (
          <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="inline-flex min-h-11 items-center self-start rounded-lg font-semibold underline focus-ring">
            {phone}
          </a>
        ) : (
          <p>{t('booking.partySize.noPhone')}</p>
        )}
      </AlertDescription>
    </Alert>
  )
}
