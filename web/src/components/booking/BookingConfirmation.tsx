import { Anchor, Box, Button, Card, CopyButton, Group, Stack, Text, TextInput, ThemeIcon, Title, VisuallyHidden } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { type BookingResult, managePath, type PublicRestaurant } from '../../api/publicBooking.ts'
import { formatLongDate, formatTime } from '../../i18n/format.ts'
import { ArmchairIcon, CalendarIcon, CheckIcon, ClockIcon, MapPinIcon, UsersIcon } from '../icons.tsx'
import { calendarFile, downloadCalendarFile } from './calendarFile.ts'
import { formatAddress, mapSearchUrl } from './format.ts'
import { headerHeight } from './layout.ts'

type BookingConfirmationProps = {
  result: BookingResult
  slug: string
  restaurant: PublicRestaurant
  timeZoneId: string
}

/**
 * The end of the booking: a clear success state (a check when confirmed, a clock for a request, which the restaurant still
 * has to confirm), the reference code and what was booked. Then "Add to calendar" as the main action, the route to the
 * restaurant, and the link to view and cancel the reservation later with a copy button and the hint to save it.
 */
export function BookingConfirmation({ result, slug, restaurant, timeZoneId }: BookingConfirmationProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const requested = result.status === 'Requested'
  const titleRef = useRef<HTMLHeadingElement>(null)
  const manageUrl = `${window.location.origin}${managePath(slug, result.referenceCode, result.manageToken)}`
  const address = formatAddress(restaurant)

  // Screen reader and keyboard users land on the result.
  useEffect(() => titleRef.current?.focus(), [])

  const rows = [
    { icon: <CalendarIcon />, label: t('booking.confirmation.date'), value: formatLongDate(result.date, language) },
    { icon: <ClockIcon />, label: t('booking.confirmation.time'), value: formatTime(result.time, language) },
    { icon: <UsersIcon />, label: t('booking.confirmation.guests'), value: t('booking.guestsCount', { count: result.guests }) },
    {
      icon: <ArmchairIcon />,
      label: t('booking.confirmation.table'),
      value: t('booking.confirmation.tableInArea', { number: result.tableNumber, area: result.area }),
    },
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
        location: [restaurant.name, address].filter((part) => part !== '').join(', '),
        description: t('booking.calendarEvent.description', {
          guests: t('booking.guestsCount', { count: result.guests }),
          code: result.referenceCode,
          link: manageUrl,
        }),
        url: manageUrl,
      }),
    )

  return (
    <Card p={{ base: 16, sm: 32 }}>
      <Stack gap={32}>
        <Stack gap={16} align="center" ta="center">
          <ThemeIcon size={64} radius="xl" color={requested ? 'yellow' : 'green'} autoContrast>
            {requested ? <ClockIcon size={32} /> : <CheckIcon size={32} strokeWidth={3} />}
          </ThemeIcon>
          <Stack gap={8} align="center">
            <Title order={2} ref={titleRef} tabIndex={-1} data-step-heading=""
            // Focused after a change of step; below the fixed header of the booking page.
            style={{ outline: 'none', scrollMarginTop: headerHeight + 16 }}>
              {requested ? t('booking.confirmation.requestTitle') : t('booking.confirmation.confirmedTitle')}
            </Title>
            <Text maw="60ch">{requested ? t('booking.confirmation.requestText') : t('booking.confirmation.confirmedText')}</Text>
          </Stack>
          <Stack gap={4} align="center">
            <Text size="sm" c="dimmed">
              {t('booking.confirmation.referenceCode')}
            </Text>
            <Text fz={28} fw={700} ff="monospace" style={{ letterSpacing: '0.15em' }}>
              {result.referenceCode}
            </Text>
          </Stack>
        </Stack>

        <Card withBorder shadow="none" padding={16} bg="var(--mantine-color-default-hover)" w="100%" maw={480} mx="auto">
          <Stack gap={8}>
            <Text fw={600}>{restaurant.name}</Text>
            <Stack gap={8} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
              {rows.map((row) => (
                <Group key={row.label} component="li" gap={8} wrap="nowrap" align="flex-start">
                  <Box c="dimmed" style={{ display: 'flex', flexShrink: 0, paddingTop: 3 }} aria-hidden="true">
                    {row.icon}
                  </Box>
                  <Text>
                    {/* The icon says it on screen. */}
                    <VisuallyHidden>{`${row.label}: `}</VisuallyHidden>
                    {row.value}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Card>

        <Group justify="center" gap={8}>
          <Button h={48} leftSection={<CalendarIcon />} onClick={addToCalendar}>
            {t('booking.confirmation.addToCalendar')}
          </Button>
          {address !== '' && (
            <Button
              component="a"
              href={mapSearchUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              variant="default"
              h={48}
              leftSection={<MapPinIcon />}
            >
              {t('booking.restaurant.route')}
            </Button>
          )}
        </Group>

        <Stack gap={8} w="100%" maw={480} mx="auto">
          <Text fw={600}>{t('booking.confirmation.manageLinkLabel')}</Text>
          <Text size="sm">{t('booking.confirmation.manageLinkHint')}</Text>
          <Group gap={8} wrap="nowrap" align="flex-end">
            <TextInput
              readOnly
              value={manageUrl}
              aria-label={t('booking.confirmation.manageLinkLabel')}
              onFocus={(event) => event.currentTarget.select()}
              styles={{ input: { height: 44 } }}
              style={{ flex: 1 }}
              miw={0}
            />
            <CopyButton value={manageUrl}>
              {({ copied, copy }) => (
                <Button variant="default" h={44} leftSection={copied ? <CheckIcon /> : undefined} onClick={copy} style={{ flexShrink: 0 }}>
                  {copied ? t('booking.confirmation.copied') : t('booking.confirmation.copy')}
                </Button>
              )}
            </CopyButton>
          </Group>
          {/* A new tab, so the link also works from the booking embedded in the restaurant's website. */}
          <Anchor href={manageUrl} target="_blank" rel="noopener noreferrer" fw={600} lh="44px" c="var(--mantine-color-text)" underline="always">
            {t('booking.confirmation.manageLink')}
          </Anchor>
        </Stack>
      </Stack>
    </Card>
  )
}
