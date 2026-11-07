import { Card, Group, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { maxReportDays, type Report, useReport } from '../api/reports.ts'
import { useRestaurantToday } from '../api/reservations.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { sourceLabels } from '../components/reservations/status.ts'
import { datePickerFormatter, formatDate, formatDayMonth, formatShortDate, formatTime, formatWeekday } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'

const dateFormat = 'YYYY-MM-DD'

/** The periods to choose from: the last 7, 30 or 90 days up to today, or two days of one's own. */
type Period = '7' | '30' | '90' | 'custom'

const periods: Period[] = ['7', '30', '90', 'custom']

/**
 * The reports of the restaurant (`/admin/reports`): a period, the figures of it as cards, bar charts of the booking channels, the
 * weekdays, the start hours and the days, and a table per day. "Today" is the restaurant's.
 */
export function ReportsPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  useDocumentTitle(t('admin.nav.reports'))
  const today = useRestaurantToday()
  const [period, setPeriod] = useState<Period>('30')
  const [custom, setCustom] = useState<[string | null, string | null]>([null, null])

  const lastDays = (days: number) => (today === null ? null : dayjs(today).subtract(days - 1, 'day').format(dateFormat))
  const [from, to] = period === 'custom' ? custom : [lastDays(Number(period)), today]
  const tooLong = from !== null && to !== null && dayjs(to).diff(dayjs(from), 'day') >= maxReportDays
  const report = useReport(tooLong ? null : from, tooLong ? null : to)

  const choosePeriod = (value: Period) => {
    // The custom period starts with the one shown before.
    if (value === 'custom' && period !== 'custom') {
      setCustom([from, to])
    }
    setPeriod(value)
  }

  return (
    <Stack gap="lg">
      <PageHeader title={t('admin.nav.reports')} description={t('reports.description')} />

      <Group gap="md" align="flex-end">
        <Stack gap={4}>
          <Text size="sm" fw={500} id="reports-period">
            {t('reports.period.label')}
          </Text>
          <SegmentedControl
            aria-labelledby="reports-period"
            value={period}
            onChange={(value) => choosePeriod(value as Period)}
            data={periods.map((value) => ({ value, label: t(`reports.period.options.${value}`) }))}
          />
        </Stack>
        {period === 'custom' ? (
          <DatePickerInput
            type="range"
            allowSingleDateInRange
            label={t('reports.period.range')}
            valueFormatter={datePickerFormatter(language)}
            value={custom}
            onChange={(value) => setCustom(value)}
            error={tooLong ? t('reports.period.tooLong') : undefined}
            miw={280}
          />
        ) : (
          from !== null &&
          to !== null && (
            <Text size="sm" c="dimmed" pb={8}>
              {t('common.timeRange', { start: formatDate(from, language), end: formatDate(to, language) })}
            </Text>
          )
        )}
      </Group>

      {report.data !== undefined ? (
        <ReportView report={report.data} />
      ) : report.isError ? (
        <ErrorAlert error={report.error} onRetry={() => void report.refetch()} />
      ) : from === null || to === null || tooLong ? null : (
        <Stack gap="lg" aria-hidden="true">
          <SimpleGrid cols={{ base: 2, md: 3, lg: 6 }}>
            {[0, 1, 2, 3, 4, 5].map((tile) => (
              <Skeleton key={tile} h={96} radius="md" />
            ))}
          </SimpleGrid>
          <Skeleton h={280} radius="md" />
        </Stack>
      )}
    </Stack>
  )
}

function ReportView({ report }: { report: Report }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const { totals } = report
  const decimal = new Intl.NumberFormat(language, { maximumFractionDigits: 1 })
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 })
  const empty = report.days.every((day) => day.reservations === 0)

  // The hours from the first to the last with covers.
  const busyHours = report.byHour.filter((hour) => hour.covers > 0).map((hour) => hour.hour)
  const hours = busyHours.length === 0 ? [] : report.byHour.filter((hour) => hour.hour >= busyHours[0] && hour.hour <= busyHours[busyHours.length - 1])
  const maxSourceCovers = Math.max(1, ...report.bySource.map((source) => source.covers))
  // At most about 15 labels below the bars of the days.
  const dayLabelEvery = Math.ceil(report.days.length / 15)

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, md: 3, lg: 6 }}>
        <Figure label={t('reports.figures.reservations')} value={totals.reservations} />
        <Figure label={t('reports.figures.covers')} value={totals.covers} />
        <Figure label={t('reports.figures.averageParty')} value={decimal.format(totals.averagePartySize)} />
        <Figure
          label={t('reports.figures.noShows')}
          value={totals.noShows}
          detail={t('reports.figures.noShowRate', { rate: percent.format(totals.noShowRate) })}
        />
        <Figure
          label={t('reports.figures.cancellations')}
          value={totals.cancellations}
          detail={t('reports.figures.cancelledBy', { guest: totals.cancelledByGuest, restaurant: totals.cancelledByRestaurant })}
        />
        <Figure label={t('reports.figures.declined')} value={totals.declinedRequests} />
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        {t('reports.figures.hint')}
      </Text>

      {empty ? (
        <Card>
          <Text c="dimmed">{t('reports.empty')}</Text>
        </Card>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card>
              <Stack gap="md">
                <Title order={3}>{t('reports.charts.bySource')}</Title>
                <Stack gap="sm" component="ul" p={0} m={0} style={{ listStyle: 'none' }}>
                  {report.bySource.map((source) => (
                    <li key={source.source}>
                      <Group justify="space-between" gap="xs" mb={4}>
                        <Text size="sm" fw={500}>
                          {t(sourceLabels[source.source])}
                        </Text>
                        <Text size="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {t('reports.charts.sourceValue', {
                            reservations: t('reports.reservationCount', { count: source.reservations }),
                            covers: t('reservations.stats.covers', { count: source.covers }),
                          })}
                        </Text>
                      </Group>
                      <div className="h-3 rounded-full bg-muted" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(source.covers / maxSourceCovers) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </Stack>
              </Stack>
            </Card>
            <Card>
              <ColumnChart
                title={t('reports.charts.byWeekday')}
                bars={report.byWeekday.map((day) => ({ key: day.weekday, label: formatWeekday(day.weekday, language), value: day.covers }))}
              />
            </Card>
          </SimpleGrid>
          <Card>
            <ColumnChart
              title={t('reports.charts.byHour')}
              bars={hours.map((hour) => ({ key: hour.hour, label: formatTime(`${String(hour.hour).padStart(2, '0')}:00`, language), value: hour.covers }))}
            />
          </Card>
          <Card>
            <ColumnChart
              title={t('reports.charts.byDay')}
              bars={report.days.map((day, index) => ({
                key: day.date,
                label: formatDayMonth(day.date, language),
                tooltip: formatShortDate(day.date, language),
                value: day.covers,
                showLabel: index % dayLabelEvery === 0,
              }))}
            />
          </Card>
        </>
      )}

      <Card p={0}>
        <Stack gap={0}>
          <Title order={3} p="md">
            {t('reports.days.title')}
          </Title>
          <Table.ScrollContainer minWidth={360}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('reports.days.date')}</Table.Th>
                  <Table.Th ta="right">{t('reports.figures.reservations')}</Table.Th>
                  <Table.Th ta="right">{t('reports.figures.covers')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.days.map((day) => (
                  <Table.Tr key={day.date}>
                    <Table.Td>{formatDate(day.date, language)}</Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {day.reservations}
                    </Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {day.covers}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </Card>
    </Stack>
  )
}

/** A figure of the report: a label, a large value and a line about it. */
function Figure({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} fz={28} lh={1.2} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Text>
      {detail !== undefined && (
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      )}
    </Paper>
  )
}

/** Up to this many bars carry their value above them; with more there is no room for it. */
const maxValueLabels = 31

type Bar = { key: string | number; label: string; value: number; tooltip?: string; showLabel?: boolean }

/**
 * Vertical bars in plain HTML, in the accent colour, the busiest one as high as the chart; empty bars are a thin line. Each bar has
 * its value above it (up to `maxValueLabels` bars) and as a tooltip, the chart its busiest bar as a label for screen readers.
 */
function ColumnChart({ title, bars }: { title: string; bars: Bar[] }) {
  const { t } = useTranslation()
  const busiest = bars.reduce<Bar | null>((top, bar) => (top === null || bar.value > top.value ? bar : top), null)
  const max = Math.max(1, busiest?.value ?? 0)
  const summary =
    busiest === null || busiest.value === 0 ? t('reports.charts.none') : t('reports.charts.busiest', { label: busiest.tooltip ?? busiest.label, count: busiest.value })

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption>
        <Title order={3}>{title}</Title>
      </figcaption>
      <div role="img" aria-label={`${title}: ${summary}`} className="flex h-40 items-end gap-1 border-b border-border">
        {bars.map((bar) => (
          <div
            key={bar.key}
            title={t('reports.charts.bar', { label: bar.tooltip ?? bar.label, count: bar.value })}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
          >
            {bar.value > 0 && bars.length <= maxValueLabels && <span className="text-[10px] leading-4 text-muted-foreground tabular-nums">{bar.value}</span>}
            <div
              className={bar.value === 0 ? 'w-full rounded-t-sm bg-border' : 'w-full rounded-t-sm bg-primary'}
              style={{ height: bar.value === 0 ? 2 : `calc((100% - 1rem) * ${bar.value / max})` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar.key} className="min-w-0 flex-1 overflow-visible text-center text-xs whitespace-nowrap text-muted-foreground">
            {bar.showLabel === false ? '' : bar.label}
          </span>
        ))}
      </div>
    </figure>
  )
}
