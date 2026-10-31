import { Anchor, Button, Card, CheckIcon, Code, CopyButton, Group, Stack, Table, Text, TextInput, ThemeIcon, Title } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { type BookingResult, managePath, type PublicRestaurant } from '../../api/publicBooking.ts'
import { calendarFile, downloadCalendarFile } from './calendarFile.ts'
import { formatAddress, formatDate, formatTime } from './format.ts'

type BookingConfirmationProps = {
  result: BookingResult
  slug: string
  restaurant: PublicRestaurant
  timeZoneId: string
}

/**
 * The end of the booking: a big check, the reference code and what was booked; for a request, that the restaurant gets back to
 * the guest. Below, the link to view and cancel the reservation later, and the event for the guest's calendar.
 */
export function BookingConfirmation({ result, slug, restaurant, timeZoneId }: BookingConfirmationProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const requested = result.status === 'Requested'
  const titleRef = useRef<HTMLHeadingElement>(null)
  const manageUrl = `${window.location.origin}${managePath(slug, result.referenceCode, result.manageToken)}`

  // Screen reader and keyboard users land on the result.
  useEffect(() => titleRef.current?.focus(), [])

  const rows = [
    { label: t('booking.confirmation.restaurant'), value: restaurant.name },
    { label: t('booking.confirmation.date'), value: formatDate(result.date, language, { dateStyle: 'full' }) },
    { label: t('booking.confirmation.time'), value: formatTime(result.time, language) },
    { label: t('booking.confirmation.guests'), value: t('booking.guestsCount', { count: result.guests }) },
    { label: t('booking.confirmation.area'), value: result.area },
    { label: t('booking.confirmation.table'), value: result.tableNumber },
  ]

  const addToCalendar = () =>
    downloadCalendarFile(
      `${t('booking.calendarEvent.fileName')}-${result.referenceCode}.ics`,
      calendarFile({
        uid: `${result.referenceCode}@cbplayground`,
        title: t('booking.calendarEvent.title', { restaurant: restaurant.name }),
        date: result.date,
        time: result.time,
        durationMinutes: result.durationMinutes,
        timeZoneId,
        location: [restaurant.name, formatAddress(restaurant)].filter((part) => part !== '').join(', '),
        description: t('booking.calendarEvent.description', {
          guests: t('booking.guestsCount', { count: result.guests }),
          code: result.referenceCode,
          link: manageUrl,
        }),
        url: manageUrl,
      }),
    )

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

        <Button variant="light" onClick={addToCalendar}>
          {t('booking.confirmation.addToCalendar')}
        </Button>

        <Stack gap="xs" w="100%" maw={480} ta="left">
          {/* A new tab, so the link also works from the booking embedded in the restaurant's website. */}
          <Anchor href={manageUrl} target="_blank" rel="noopener noreferrer" fw={600}>
            {t('booking.confirmation.manageLink')}
          </Anchor>
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <TextInput
              readOnly
              value={manageUrl}
              label={t('booking.confirmation.manageLinkLabel')}
              description={t('booking.confirmation.manageLinkHint')}
              onFocus={(event) => event.currentTarget.select()}
              style={{ flex: 1 }}
              miw={0}
            />
            <CopyButton value={manageUrl}>
              {({ copied, copy }) => (
                <Button variant={copied ? 'filled' : 'default'} color={copied ? 'green' : undefined} onClick={copy}>
                  {copied ? t('booking.confirmation.copied') : t('booking.confirmation.copy')}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Stack>
      </Stack>
    </Card>
  )
}
