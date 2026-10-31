import { Alert, Button, Card, CloseButton, Group, NumberInput, Radio, Skeleton, Stack, Table, Text, Title } from '@mantine/core'
import { type FormErrors, useForm } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { ParseKeys } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.ts'
import {
  type ConfirmationMode,
  durationLimits,
  isValidDuration,
  matchingRule,
  type ReservationSettings,
  type ReservationSettingsError,
  type TableSelectionMode,
  useReservationSettings,
  useSaveReservationSettings,
} from '../api/reservationSettings.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

const confirmationOptions: { value: ConfirmationMode; label: ParseKeys; description: ParseKeys }[] = [
  { value: 'Instant', label: 'reservationSettings.confirmation.instant.label', description: 'reservationSettings.confirmation.instant.description' },
  { value: 'Request', label: 'reservationSettings.confirmation.request.label', description: 'reservationSettings.confirmation.request.description' },
]

const tableSelectionOptions: { value: TableSelectionMode; label: ParseKeys; description: ParseKeys }[] = [
  { value: 'GuestChooses', label: 'reservationSettings.tableSelection.guestChooses.label', description: 'reservationSettings.tableSelection.guestChooses.description' },
  { value: 'SystemAssigns', label: 'reservationSettings.tableSelection.systemAssigns.label', description: 'reservationSettings.tableSelection.systemAssigns.description' },
]

const saveErrors: Record<ReservationSettingsError, ParseKeys> = {
  invalid_mode: 'reservationSettings.errors.invalidMode',
  invalid_duration: 'reservationSettings.errors.invalidDuration',
  invalid_min_guests: 'reservationSettings.errors.invalidMinGuests',
  min_greater_than_max: 'reservationSettings.errors.minGreaterThanMax',
  overlapping_rules: 'reservationSettings.errors.overlappingRules',
}

function isSaveError(code: string | null): code is ReservationSettingsError {
  return code !== null && code in saveErrors
}

/** A number input is an empty string while it is cleared. */
type NumberValue = number | string

type RuleValues = { key: string; minGuests: NumberValue; maxGuests: NumberValue; durationMinutes: NumberValue }

type FormValues = {
  confirmationMode: ConfirmationMode
  tableSelectionMode: TableSelectionMode
  defaultDurationMinutes: NumberValue
  durationRules: RuleValues[]
}

function toFormValues(settings: ReservationSettings): FormValues {
  return { ...settings, durationRules: settings.durationRules.map((rule) => ({ ...rule, key: randomId() })) }
}

function isWholeNumber(value: NumberValue): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

/** Reservation settings of the restaurant: confirmation, table assignment and duration. */
export function ReservationSettingsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('reservationSettings.title'))
  const settings = useReservationSettings()

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>{t('reservationSettings.title')}</Title>
        <Text c="dimmed">{t('reservationSettings.subtitle')}</Text>
      </Stack>

      {settings.isPending ? (
        <Stack gap="lg">
          <Skeleton h={180} radius="md" />
          <Skeleton h={180} radius="md" />
          <Skeleton h={260} radius="md" />
        </Stack>
      ) : settings.isError ? (
        <ErrorAlert error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm settings={settings.data} />
      )}
    </Stack>
  )
}

function SettingsForm({ settings }: { settings: ReservationSettings }) {
  const { t } = useTranslation()
  const save = useSaveReservationSettings()
  const [previewGuests, setPreviewGuests] = useState<NumberValue>(4)

  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: toFormValues(settings),
    validate: (values) => {
      const errors: FormErrors = {}
      const durationError = (value: NumberValue) =>
        isWholeNumber(value) && isValidDuration(value) ? null : t('reservationSettings.validation.duration', { ...durationLimits })

      errors.defaultDurationMinutes = durationError(values.defaultDurationMinutes)
      values.durationRules.forEach((rule, index) => {
        const path = `durationRules.${index}`
        if (!isWholeNumber(rule.minGuests) || rule.minGuests < 1) {
          errors[`${path}.minGuests`] = t('reservationSettings.validation.minGuests')
        } else if (!isWholeNumber(rule.maxGuests) || rule.maxGuests < rule.minGuests) {
          errors[`${path}.maxGuests`] = t('reservationSettings.validation.minGreaterThanMax')
        } else {
          const overlaps = values.durationRules.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              isWholeNumber(other.minGuests) &&
              isWholeNumber(other.maxGuests) &&
              other.minGuests <= other.maxGuests &&
              other.minGuests <= (rule.maxGuests as number) &&
              (rule.minGuests as number) <= other.maxGuests,
          )
          if (overlaps) {
            errors[`${path}.minGuests`] = t('reservationSettings.validation.overlap')
          }
        }
        errors[`${path}.durationMinutes`] = durationError(rule.durationMinutes)
      })
      return errors
    },
  })

  const submit = form.onSubmit((values) => {
    save.mutate(
      {
        confirmationMode: values.confirmationMode,
        tableSelectionMode: values.tableSelectionMode,
        defaultDurationMinutes: Number(values.defaultDurationMinutes),
        durationRules: values.durationRules.map((rule) => ({
          minGuests: Number(rule.minGuests),
          maxGuests: Number(rule.maxGuests),
          durationMinutes: Number(rule.durationMinutes),
        })),
      },
      {
        onSuccess: (saved) => {
          const values = toFormValues(saved)
          form.setValues(values)
          form.resetDirty(values)
          notifications.show({ color: 'green', message: t('reservationSettings.saved') })
        },
      },
    )
  })

  const addRule = () => {
    const maxima = form.values.durationRules.map((rule) => Number(rule.maxGuests)).filter((max) => Number.isInteger(max))
    const minGuests = maxima.length > 0 ? Math.max(...maxima) + 1 : 1
    form.insertListItem('durationRules', {
      key: randomId(),
      minGuests,
      maxGuests: minGuests + 1,
      durationMinutes: form.values.defaultDurationMinutes,
    })
  }

  const durationInputProps = { min: durationLimits.min, max: durationLimits.max, step: durationLimits.step, allowDecimal: false, allowNegative: false }

  // Preview with the values as they are in the form, before saving.
  const previewRule = isWholeNumber(previewGuests) && previewGuests >= 1
    ? matchingRule(
        form.values.durationRules.map((rule) => ({ ...rule, minGuests: Number(rule.minGuests), maxGuests: Number(rule.maxGuests) })),
        previewGuests,
      )
    : undefined
  const previewMinutes = previewRule !== undefined ? previewRule.durationMinutes : form.values.defaultDurationMinutes

  const error = save.error
  const errorCode = error instanceof ApiError ? error.code : null

  return (
    <form onSubmit={submit}>
      <Stack gap="lg">
        <Card>
          <Radio.Group label={<Title order={3}>{t('reservationSettings.confirmation.title')}</Title>} {...form.getInputProps('confirmationMode')}>
            <Stack gap="sm" mt="sm">
              {confirmationOptions.map((option) => (
                <OptionCard key={option.value} value={option.value} label={t(option.label)} description={t(option.description)} />
              ))}
            </Stack>
          </Radio.Group>
        </Card>

        <Card>
          <Radio.Group label={<Title order={3}>{t('reservationSettings.tableSelection.title')}</Title>} {...form.getInputProps('tableSelectionMode')}>
            <Stack gap="sm" mt="sm">
              {tableSelectionOptions.map((option) => (
                <OptionCard key={option.value} value={option.value} label={t(option.label)} description={t(option.description)} />
              ))}
            </Stack>
          </Radio.Group>
        </Card>

        <Card>
          <Stack gap="md">
            <Title order={3}>{t('reservationSettings.duration.title')}</Title>

            <NumberInput
              label={t('reservationSettings.duration.default')}
              description={t('reservationSettings.duration.defaultDescription')}
              suffix={t('reservationSettings.duration.minutesSuffix')}
              maw={260}
              {...durationInputProps}
              {...form.getInputProps('defaultDurationMinutes')}
            />

            <Stack gap={4}>
              <Text fw={500} size="sm">
                {t('reservationSettings.duration.rules')}
              </Text>
              <Text c="dimmed" size="xs">
                {t('reservationSettings.duration.rulesDescription')}
              </Text>
            </Stack>

            {form.values.durationRules.length === 0 ? (
              <Text c="dimmed" size="sm">
                {t('reservationSettings.duration.noRules')}
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={420}>
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('reservationSettings.duration.from')}</Table.Th>
                      <Table.Th>{t('reservationSettings.duration.to')}</Table.Th>
                      <Table.Th>{t('reservationSettings.duration.minutes')}</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {form.values.durationRules.map((rule, index) => (
                      <Table.Tr key={rule.key}>
                        <Table.Td valign="top">
                          <NumberInput
                            aria-label={t('reservationSettings.duration.from')}
                            min={1}
                            allowDecimal={false}
                            allowNegative={false}
                            {...form.getInputProps(`durationRules.${index}.minGuests`)}
                          />
                        </Table.Td>
                        <Table.Td valign="top">
                          <NumberInput
                            aria-label={t('reservationSettings.duration.to')}
                            min={1}
                            allowDecimal={false}
                            allowNegative={false}
                            {...form.getInputProps(`durationRules.${index}.maxGuests`)}
                          />
                        </Table.Td>
                        <Table.Td valign="top">
                          <NumberInput
                            aria-label={t('reservationSettings.duration.minutes')}
                            {...durationInputProps}
                            {...form.getInputProps(`durationRules.${index}.durationMinutes`)}
                          />
                        </Table.Td>
                        <Table.Td valign="top">
                          <CloseButton
                            mt={4}
                            aria-label={t('reservationSettings.duration.deleteRule')}
                            onClick={() => form.removeListItem('durationRules', index)}
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}

            <Group>
              <Button variant="light" onClick={addRule}>
                {t('reservationSettings.duration.addRule')}
              </Button>
            </Group>

            <Card withBorder={false} shadow="none" bg="gray.0" padding="md">
              <Stack gap="xs">
                <NumberInput
                  label={t('reservationSettings.duration.previewGuests')}
                  min={1}
                  allowDecimal={false}
                  allowNegative={false}
                  maw={200}
                  value={previewGuests}
                  onChange={setPreviewGuests}
                />
                {isWholeNumber(previewGuests) && previewGuests >= 1 && isWholeNumber(previewMinutes) && (
                  <Text size="sm">
                    {t('reservationSettings.duration.previewResult', { guests: previewGuests, count: previewMinutes })}{' '}
                    <Text span c="dimmed" size="sm">
                      {previewRule !== undefined
                        ? t('reservationSettings.duration.previewRule', { min: previewRule.minGuests, max: previewRule.maxGuests })
                        : t('reservationSettings.duration.previewDefault')}
                    </Text>
                  </Text>
                )}
              </Stack>
            </Card>
          </Stack>
        </Card>

        {error !== null &&
          (isSaveError(errorCode) ? (
            <Alert color="red" variant="light" title={t('reservationSettings.errors.title')}>
              {t(saveErrors[errorCode])}
            </Alert>
          ) : (
            <ErrorAlert error={error} />
          ))}

        <Group>
          <Button type="submit" loading={save.isPending}>
            {t('reservationSettings.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

/** One option of a radio group as a card with a short explanation. */
function OptionCard({ value, label, description }: { value: string; label: string; description: string }) {
  return (
    <Radio.Card value={value} p="md" radius="md">
      <Group wrap="nowrap" align="flex-start">
        <Radio.Indicator />
        <Stack gap={2}>
          <Text fw={600}>{label}</Text>
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        </Stack>
      </Group>
    </Radio.Card>
  )
}
