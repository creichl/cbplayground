import { Box, Card, Collapse, Group, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DayOfWeek } from '../../api/openingHours.ts'
import { type PublicRestaurant, todayIn } from '../../api/publicBooking.ts'
import { formatTime } from '../../i18n/format.ts'
import { ChevronDownIcon, ClockIcon } from '../icons.tsx'
import { headerHeight } from './layout.ts'
import { useOpeningStatus } from './openingStatus.ts'
import { RestaurantContact } from './RestaurantContact.tsx'

/** The week as shown, starting on Monday. */
const weekdays = [
  { dayOfWeek: 1, key: 'monday' },
  { dayOfWeek: 2, key: 'tuesday' },
  { dayOfWeek: 3, key: 'wednesday' },
  { dayOfWeek: 4, key: 'thursday' },
  { dayOfWeek: 5, key: 'friday' },
  { dayOfWeek: 6, key: 'saturday' },
  { dayOfWeek: 0, key: 'sunday' },
] as const satisfies readonly { dayOfWeek: DayOfWeek; key: string }[]

/**
 * Next to the booking (below it on phones), staying in view while the page scrolls: whether the restaurant is open today,
 * its address with "Route", phone, email and website, and the regular opening hours of the week, folded away, with today
 * stressed.
 */
export function RestaurantInfo({ slug, restaurant }: { slug: string; restaurant: PublicRestaurant }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const status = useOpeningStatus(slug, restaurant)
  const [hoursOpen, setHoursOpen] = useState(false)
  const hoursId = useId()
  // Today's day of the week in the restaurant's time zone (0 = Sunday), noon UTC so the day does not shift.
  const todayOfWeek = restaurant.timeZoneId !== null ? new Date(`${todayIn(restaurant.timeZoneId)}T12:00:00Z`).getUTCDay() : null

  return (
    <Card p={24} pos="sticky" top={headerHeight + 24}>
      <Stack gap={16}>
        <Title order={2} ff="text" fz="lg" fw={700}>
          {t('booking.restaurant.infoTitle')}
        </Title>

        {status !== null && (
          <Group gap={8} wrap="nowrap">
            {/* The text says it; the dot only repeats it. */}
            <Box
              aria-hidden="true"
              w={10}
              h={10}
              bg={status.open ? 'green.7' : 'red.7'}
              style={{ borderRadius: '50%', flexShrink: 0 }}
            />
            <Text fw={600}>{status.text}</Text>
          </Group>
        )}

        <RestaurantContact restaurant={restaurant} />

        {restaurant.openingHours.length > 0 && (
          <Stack gap={8}>
            <UnstyledButton
              onClick={() => setHoursOpen((open) => !open)}
              aria-expanded={hoursOpen}
              aria-controls={hoursId}
              className="mantine-focus-auto"
              mih={44}
              style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 'var(--mantine-radius-sm)' }}
            >
              <Box c="dimmed" style={{ display: 'flex' }} aria-hidden="true">
                <ClockIcon />
              </Box>
              <Text fw={600} style={{ flex: 1 }}>
                {t('booking.restaurant.openingHours')}
              </Text>
              <Box style={{ display: 'flex', transform: hoursOpen ? 'rotate(180deg)' : undefined, transition: 'transform 150ms ease' }} aria-hidden="true">
                <ChevronDownIcon />
              </Box>
            </UnstyledButton>
            <Collapse expanded={hoursOpen} id={hoursId}>
              <Table verticalSpacing={4} horizontalSpacing={0} withRowBorders={false} fz="sm">
                <Table.Tbody>
                  {weekdays.map(({ dayOfWeek, key }) => {
                    const periods = restaurant.openingHours.filter((period) => period.dayOfWeek === dayOfWeek)
                    const today = dayOfWeek === todayOfWeek
                    return (
                      <Table.Tr key={dayOfWeek} fw={today ? 700 : undefined} aria-current={today ? 'date' : undefined}>
                        <Table.Td pr={16} style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          {today ? t('booking.restaurant.today', { day: t(`openingHours.weekdays.${key}`) }) : t(`openingHours.weekdays.${key}`)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {periods.length === 0
                            ? t('openingHours.closed')
                            : // A line break only falls between two windows, never inside one.
                              periods.map((period, index) => (
                                <span key={period.start}>
                                  {index > 0 && ', '}
                                  <span style={{ whiteSpace: 'nowrap' }}>
                                    {t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) })}
                                  </span>
                                </span>
                              ))}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Collapse>
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
