import { Alert, Anchor, Button, Group, Select, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Party sizes offered as chips; larger ones are under "More". */
const chipSizes = [1, 2, 3, 4, 5, 6, 7, 8]

type PartySizePickerProps = {
  value: number | null
  maxOnlinePartySize: number
  phone: string | null
  onChange: (guests: number) => void
}

/**
 * Party size as chips 1–8 plus "More" up to the largest party that can be booked online. A larger party
 * (one more than that stands for "more") gets the hint to call instead.
 */
export function PartySizePicker({ value, maxOnlinePartySize, phone, onChange }: PartySizePickerProps) {
  const { t } = useTranslation()
  const tooLarge = value !== null && value > maxOnlinePartySize
  const [showMore, setShowMore] = useState(value !== null && value > chipSizes.length)

  // "More": 9 up to the online maximum, and one entry for every larger party.
  const largerSizes = Array.from({ length: Math.max(0, maxOnlinePartySize - chipSizes.length) }, (_, i) => chipSizes.length + 1 + i)
  const tooLargeValue = Math.max(maxOnlinePartySize, chipSizes.length) + 1
  const moreOptions = [
    ...largerSizes.map((size) => ({ value: String(size), label: t('booking.guestsCount', { count: size }) })),
    { value: String(tooLargeValue), label: t('booking.partySize.moreThan', { count: tooLargeValue - 1 }) },
  ]

  return (
    <Stack gap="md">
      <Group gap="xs">
        {chipSizes.map((size) => (
          <Button
            key={size}
            radius="xl"
            size="md"
            miw={52}
            px="md"
            variant={value === size ? 'filled' : 'default'}
            aria-pressed={value === size}
            aria-label={t('booking.guestsCount', { count: size })}
            onClick={() => {
              setShowMore(false)
              onChange(size)
            }}
          >
            {size}
          </Button>
        ))}
        <Button
          radius="xl"
          size="md"
          variant={showMore ? 'filled' : 'default'}
          aria-pressed={showMore}
          aria-expanded={showMore}
          onClick={() => setShowMore(true)}
        >
          {t('booking.partySize.more')}
        </Button>
      </Group>

      {showMore && (
        <Select
          label={t('booking.partySize.moreLabel')}
          placeholder={t('booking.partySize.morePlaceholder')}
          data={moreOptions}
          value={value !== null && value > chipSizes.length ? String(value) : null}
          onChange={(selected) => {
            if (selected !== null) {
              onChange(Number(selected))
            }
          }}
          allowDeselect={false}
          size="md"
        />
      )}

      {tooLarge && (
        <Alert color="yellow" variant="light" title={t('booking.partySize.callTitle')}>
          <Stack gap={4}>
            <Text size="sm">{t('booking.partySize.callText', { count: maxOnlinePartySize })}</Text>
            {phone !== null ? (
              <Anchor href={`tel:${phone.replace(/[^0-9+]/g, '')}`} fw={600}>
                {phone}
              </Anchor>
            ) : (
              <Text size="sm">{t('booking.partySize.noPhone')}</Text>
            )}
          </Stack>
        </Alert>
      )}
    </Stack>
  )
}
