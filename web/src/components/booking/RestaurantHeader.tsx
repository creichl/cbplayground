import { Card, Stack, Table, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { DayOfWeek } from '../../api/openingHours.ts'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { formatTime } from '../../i18n/format.ts'
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

/** The top of the booking page: name, description, address (with a map link), contact and the regular opening hours. */
export function RestaurantHeader({ restaurant }: { restaurant: PublicRestaurant }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={1}>{restaurant.name}</Title>
        {restaurant.description !== null && <Text c="dimmed">{restaurant.description}</Text>}
      </Stack>

      <Card padding="md">
        <Stack gap="md">
          <RestaurantContact restaurant={restaurant} />

          <Stack gap={4}>
            <Title order={2} size="h5">
              {t('booking.restaurant.openingHours')}
            </Title>
            <Table verticalSpacing={2} horizontalSpacing={0} withRowBorders={false} fz="sm">
              <Table.Tbody>
                {weekdays.map(({ dayOfWeek, key }) => {
                  const periods = restaurant.openingHours.filter((period) => period.dayOfWeek === dayOfWeek)
                  return (
                    <Table.Tr key={dayOfWeek}>
                      <Table.Td pr="md" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {t(`openingHours.weekdays.${key}`)}
                      </Table.Td>
                      <Table.Td c={periods.length === 0 ? 'dimmed' : undefined}>
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
          </Stack>
        </Stack>
      </Card>
    </Stack>
  )
}
