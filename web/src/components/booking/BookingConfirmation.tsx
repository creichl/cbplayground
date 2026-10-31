import { Card, CheckIcon, Code, Stack, Table, Text, ThemeIcon, Title } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { BookingResult } from '../../api/publicBooking.ts'
import { formatLongDate, formatTime } from '../../i18n/format.ts'

/** The end of the booking: a big check, the reference code and what was booked; for a request, that the restaurant gets back to the guest. */
export function BookingConfirmation({ result, restaurantName }: { result: BookingResult; restaurantName: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const requested = result.status === 'Requested'
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Screen reader and keyboard users land on the result.
  useEffect(() => titleRef.current?.focus(), [])

  const rows = [
    { label: t('booking.confirmation.restaurant'), value: restaurantName },
    { label: t('booking.confirmation.date'), value: formatLongDate(result.date, language) },
    { label: t('booking.confirmation.time'), value: formatTime(result.time, language) },
    { label: t('booking.confirmation.guests'), value: t('booking.guestsCount', { count: result.guests }) },
    { label: t('booking.confirmation.area'), value: result.area },
    { label: t('booking.confirmation.table'), value: result.tableNumber },
  ]

  return (
    <Card>
      <Stack gap="lg" align="center" ta="center">
        <ThemeIcon size={72} radius="xl" color={requested ? 'brand.6' : 'green'}>
          <CheckIcon size={36} />
        </ThemeIcon>
        <Stack gap={4} align="center">
          <Title order={2} ref={titleRef} tabIndex={-1} style={{ outline: 'none' }}>
            {requested ? t('booking.confirmation.requestTitle') : t('booking.confirmation.confirmedTitle')}
          </Title>
          <Text c="dimmed">{requested ? t('booking.confirmation.requestText') : t('booking.confirmation.confirmedText')}</Text>
        </Stack>
        <Stack gap={4} align="center">
          <Text size="sm" c="dimmed">
            {t('booking.confirmation.referenceCode')}
          </Text>
          <Code fz="xl" fw={700} px="md" py="xs" style={{ letterSpacing: '0.15em' }}>
            {result.referenceCode}
          </Code>
        </Stack>
        <Table withRowBorders={false} verticalSpacing={4} ta="left" maw={420}>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.label}>
                <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  {row.label}
                </Table.Td>
                <Table.Td fw={500}>{row.value}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Card>
  )
}
