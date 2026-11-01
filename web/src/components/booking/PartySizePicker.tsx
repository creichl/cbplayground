import { Alert, Anchor, Select, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { barInputStyles } from './layout.ts'

type PartySizePickerProps = {
  value: number
  maxOnlinePartySize: number
  onChange: (guests: number) => void
}

/**
 * The party size in the booking bar, as a list from 1 up to the largest party that can be booked online plus one entry
 * for larger parties (one more than that), which leads to the hint to call (PartySizeCallHint).
 */
export function PartySizePicker({ value, maxOnlinePartySize, onChange }: PartySizePickerProps) {
  const { t } = useTranslation()
  const tooLargeValue = maxOnlinePartySize + 1
  const options = [
    ...Array.from({ length: maxOnlinePartySize }, (_, i) => ({ value: String(i + 1), label: t('booking.guestsCount', { count: i + 1 }) })),
    { value: String(tooLargeValue), label: t('booking.partySize.moreThan', { count: maxOnlinePartySize }) },
  ]

  return (
    <Select
      label={t('booking.bar.guests')}
      data={options}
      value={String(Math.min(value, tooLargeValue))}
      onChange={(selected) => {
        if (selected !== null) {
          onChange(Number(selected))
        }
      }}
      allowDeselect={false}
      size="md"
      styles={barInputStyles}
      comboboxProps={{ shadow: 'md' }}
    />
  )
}

/** For a party too large to book online: the hint to call, with the restaurant's phone number. */
export function PartySizeCallHint({ maxOnlinePartySize, phone }: { maxOnlinePartySize: number; phone: string | null }) {
  const { t } = useTranslation()

  return (
    <Alert color="yellow" variant="light" title={t('booking.partySize.callTitle')}>
      <Stack gap={4}>
        <Text size="sm">{t('booking.partySize.callText', { count: maxOnlinePartySize })}</Text>
        {phone !== null ? (
          <Anchor href={`tel:${phone.replace(/[^0-9+]/g, '')}`} fw={600} c="var(--mantine-color-text)" underline="always" lh="44px">
            {phone}
          </Anchor>
        ) : (
          <Text size="sm">{t('booking.partySize.noPhone')}</Text>
        )}
      </Stack>
    </Alert>
  )
}
