import { PhoneIcon, UsersIcon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert.tsx'
import { Label } from '../../ui/label.tsx'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '../../ui/select.tsx'

/** Party sizes listed one by one; larger ones up to the online limit follow under "More". */
const listedSizes = 8

type PartySizePickerProps = {
  value: number
  maxOnlinePartySize: number
  onChange: (guests: number) => void
}

/**
 * The party size on the reservation card: 1 to 8 people, then "More" with the larger parties up to the largest that can be
 * booked online, and one entry for still larger parties (one more than that), which leads to the hint to call
 * (PartySizeCallHint).
 */
export function PartySizePicker({ value, maxOnlinePartySize, onChange }: PartySizePickerProps) {
  const { t } = useTranslation()
  const id = useId()
  const tooLargeValue = maxOnlinePartySize + 1
  const sizes = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
  const item = (size: number) => (
    <SelectItem key={size} value={String(size)}>
      {t('booking.guestsCount', { count: size })}
    </SelectItem>
  )

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{t('booking.bar.guests')}</Label>
      <Select value={String(Math.min(value, tooLargeValue))} onValueChange={(selected) => onChange(Number(selected))}>
        <SelectTrigger id={id} className="h-12 touch:h-12">
          <span className="flex min-w-0 items-center gap-2">
            <UsersIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground max-sm:hidden" />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {sizes(1, Math.min(listedSizes, maxOnlinePartySize)).map(item)}
          {maxOnlinePartySize > listedSizes && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t('booking.partySize.more')}</SelectLabel>
                {sizes(listedSizes + 1, maxOnlinePartySize).map(item)}
              </SelectGroup>
            </>
          )}
          <SelectSeparator />
          <SelectItem value={String(tooLargeValue)}>{t('booking.partySize.moreThan', { count: maxOnlinePartySize })}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

/** For a party too large to book online: the hint to call, with the restaurant's phone number. */
export function PartySizeCallHint({ maxOnlinePartySize, phone }: { maxOnlinePartySize: number; phone: string | null }) {
  const { t } = useTranslation()

  return (
    <Alert variant="warning">
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
