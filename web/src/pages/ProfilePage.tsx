import { Card, Chip, Grid, Group, Input, MultiSelect, SegmentedControl, Skeleton, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.ts'
import {
  isValidEmail,
  isValidWebsite,
  type Profile,
  type ProfileError,
  profileMaxLengths,
  useProfile,
  useSaveProfile,
} from '../api/profile.ts'
import {
  type Cuisine,
  cuisines,
  maxCuisines,
  maxHouseRulesLength,
  type PriceLevel,
  priceLevels,
  type RestaurantDetails,
  type RestaurantDetailsError,
  restaurantFeatures,
  useRestaurantDetails,
  useSaveRestaurantDetails,
} from '../api/restaurantDetails.ts'
import { featureIcons } from '../components/booking/featureIcons.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { FaqManager } from '../components/FaqManager.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { SaveBar } from '../components/SaveBar.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

/** The profile's fields as text, and the details: the price level as "1"–"4", "" when not set. */
type FormValues = Record<keyof Profile, string> & {
  cuisines: string[]
  priceLevel: string
  features: string[]
  houseRules: string
}

/** The API's error codes of the profile and the details, each shown at its field. */
const saveErrors: Record<ProfileError | RestaurantDetailsError, { field: keyof FormValues; message: ParseKeys }> = {
  invalid_street: { field: 'street', message: 'profile.errors.tooLong' },
  invalid_postal_code: { field: 'postalCode', message: 'profile.errors.tooLong' },
  invalid_city: { field: 'city', message: 'profile.errors.tooLong' },
  invalid_phone: { field: 'phone', message: 'profile.errors.tooLong' },
  invalid_description: { field: 'description', message: 'profile.errors.tooLong' },
  invalid_email: { field: 'email', message: 'profile.validation.email' },
  invalid_website: { field: 'website', message: 'profile.validation.website' },
  invalid_cuisine: { field: 'cuisines', message: 'restaurantDetails.admin.errors.invalidChoice' },
  too_many_cuisines: { field: 'cuisines', message: 'restaurantDetails.admin.errors.tooManyCuisines' },
  invalid_price_level: { field: 'priceLevel', message: 'restaurantDetails.admin.errors.invalidPriceLevel' },
  invalid_feature: { field: 'features', message: 'restaurantDetails.admin.errors.invalidChoice' },
  invalid_house_rules: { field: 'houseRules', message: 'profile.errors.tooLong' },
}

function isSaveError(code: string | null): code is ProfileError | RestaurantDetailsError {
  return code !== null && code in saveErrors
}

function toFormValues(profile: Profile, details: RestaurantDetails): FormValues {
  return {
    street: profile.street ?? '',
    postalCode: profile.postalCode ?? '',
    city: profile.city ?? '',
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    website: profile.website ?? '',
    description: profile.description ?? '',
    cuisines: details.cuisines,
    priceLevel: details.priceLevel === null ? '' : String(details.priceLevel),
    features: details.features,
    houseRules: details.houseRules ?? '',
  }
}

/** The cuisines in the order they were chosen (the select only offers those of the list), the features in the order of the list. */
function toDetails(values: FormValues): RestaurantDetails {
  return {
    cuisines: values.cuisines as Cuisine[],
    priceLevel: values.priceLevel === '' ? null : (Number(values.priceLevel) as PriceLevel),
    features: restaurantFeatures.filter((feature) => values.features.includes(feature)),
    houseRules: values.houseRules.trim() === '' ? null : values.houseRules.trim(),
  }
}

/** An empty field is sent as null. */
function toProfile(values: FormValues): Profile {
  const value = (text: string) => (text.trim() === '' ? null : text.trim())
  return {
    street: value(values.street),
    postalCode: value(values.postalCode),
    city: value(values.city),
    phone: value(values.phone),
    email: value(values.email),
    website: value(values.website),
    description: value(values.description),
  }
}

/**
 * Admin page: address, contact, description and details (cuisines, price level, features, house rules) of the restaurant,
 * which guests will see, saved together with the save bar; below them the frequently asked questions, saved one by one.
 */
export function ProfilePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('profile.title'))
  const profile = useProfile()
  const details = useRestaurantDetails()

  return (
    <Stack gap="lg">
      <PageHeader title={t('profile.title')} description={t('profile.subtitle')} />

      {profile.isPending || details.isPending ? (
        <Stack gap="lg">
          <Skeleton h={220} radius="md" />
          <Skeleton h={180} radius="md" />
        </Stack>
      ) : profile.isError ? (
        <ErrorAlert error={profile.error} onRetry={() => void profile.refetch()} />
      ) : details.isError ? (
        <ErrorAlert error={details.error} onRetry={() => void details.refetch()} />
      ) : (
        <ProfileForm profile={profile.data} details={details.data} />
      )}

      {/* Outside the form: every change of a question is saved right away, without the save bar. */}
      <Card>
        <Stack gap="md">
          <div>
            <Title order={3}>{t('restaurantDetails.admin.faq.title')}</Title>
            <Text size="sm" c="dimmed" mt={4}>
              {t('restaurantDetails.admin.faq.description')}
            </Text>
          </div>
          <FaqManager />
        </Stack>
      </Card>
    </Stack>
  )
}

function ProfileForm({ profile, details }: { profile: Profile; details: RestaurantDetails }) {
  const { t } = useTranslation()
  const saveProfile = useSaveProfile()
  const saveDetails = useSaveRestaurantDetails()

  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: toFormValues(profile, details),
    validate: {
      email: (value) => (value.trim() === '' || isValidEmail(value.trim()) ? null : t('profile.validation.email')),
      website: (value) => (value.trim() === '' || isValidWebsite(value.trim()) ? null : t('profile.validation.website')),
    },
  })

  // The profile first, then the details; the form stays changed until both are saved.
  const submit = form.onSubmit(async (values) => {
    saveProfile.reset()
    saveDetails.reset()
    try {
      const savedProfile = await saveProfile.mutateAsync(toProfile(values))
      const savedDetails = await saveDetails.mutateAsync(toDetails(values))
      const savedValues = toFormValues(savedProfile, savedDetails)
      form.setValues(savedValues)
      form.resetDirty(savedValues)
      notifications.show({ color: 'green', message: t('profile.saved') })
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null
      if (isSaveError(code)) {
        form.setFieldError(saveErrors[code].field, t(saveErrors[code].message))
      }
    }
  })

  const error = saveProfile.error ?? saveDetails.error
  const errorCode = error instanceof ApiError ? error.code : null
  const priceLevel = form.values.priceLevel

  const discard = () => {
    saveProfile.reset()
    saveDetails.reset()
    form.reset()
  }

  return (
    // The fields are checked by the form, which shows its errors at the fields, not by the browser.
    <form onSubmit={submit} noValidate>
      <Stack gap="lg">
        <Card>
          <Stack gap="md">
            <Title order={3}>{t('profile.address.title')}</Title>
            <TextInput
              label={t('profile.fields.street')}
              autoComplete="street-address"
              maxLength={profileMaxLengths.street}
              {...form.getInputProps('street')}
            />
            <Grid>
              <Grid.Col span={{ base: 12, xs: 4 }}>
                <TextInput
                  label={t('profile.fields.postalCode')}
                  autoComplete="postal-code"
                  maxLength={profileMaxLengths.postalCode}
                  {...form.getInputProps('postalCode')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, xs: 8 }}>
                <TextInput
                  label={t('profile.fields.city')}
                  autoComplete="address-level2"
                  maxLength={profileMaxLengths.city}
                  {...form.getInputProps('city')}
                />
              </Grid.Col>
            </Grid>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <Title order={3}>{t('profile.contact.title')}</Title>
            <TextInput
              label={t('profile.fields.phone')}
              type="tel"
              autoComplete="tel"
              maxLength={profileMaxLengths.phone}
              {...form.getInputProps('phone')}
            />
            <TextInput
              label={t('profile.fields.email')}
              type="email"
              autoComplete="email"
              maxLength={profileMaxLengths.email}
              {...form.getInputProps('email')}
            />
            <TextInput
              label={t('profile.fields.website')}
              description={t('profile.fields.websiteDescription')}
              type="url"
              autoComplete="url"
              placeholder={t('profile.fields.websitePlaceholder')}
              maxLength={profileMaxLengths.website}
              {...form.getInputProps('website')}
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <Title order={3}>{t('profile.description.title')}</Title>
            <Textarea
              label={t('profile.fields.description')}
              description={t('restaurantDetails.admin.counter', { length: form.values.description.length, max: profileMaxLengths.description })}
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              autosize
              minRows={5}
              maxLength={profileMaxLengths.description}
              {...form.getInputProps('description')}
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <Title order={3}>{t('restaurantDetails.admin.cuisineTitle')}</Title>
            <MultiSelect
              label={t('restaurantDetails.admin.cuisines')}
              description={t('restaurantDetails.admin.cuisinesDescription')}
              placeholder={form.values.cuisines.length < maxCuisines ? t('restaurantDetails.admin.cuisinesPlaceholder') : undefined}
              data={cuisines.map((cuisine) => ({ value: cuisine, label: t(`restaurantDetails.cuisines.${cuisine}`) }))}
              maxValues={maxCuisines}
              searchable
              clearable
              hidePickedOptions
              {...form.getInputProps('cuisines')}
            />
            <Input.Wrapper
              label={t('restaurantDetails.admin.priceLevel')}
              description={t(`restaurantDetails.admin.priceLevelHints.${priceLevel === '' ? 'none' : (priceLevel as `${PriceLevel}`)}`)}
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              error={form.errors.priceLevel}
            >
              <div>
                <SegmentedControl
                  aria-label={t('restaurantDetails.admin.priceLevel')}
                  data={[
                    { value: '', label: t('restaurantDetails.admin.notSet') },
                    ...priceLevels.map((level) => ({ value: String(level), label: '€'.repeat(level) })),
                  ]}
                  value={priceLevel}
                  onChange={(value) => form.setFieldValue('priceLevel', value)}
                />
              </div>
            </Input.Wrapper>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div>
              <Title order={3}>{t('restaurantDetails.admin.featuresTitle')}</Title>
              <Text size="sm" c="dimmed" mt={4}>
                {t('restaurantDetails.admin.featuresDescription')}
              </Text>
            </div>
            <Chip.Group multiple value={form.values.features} onChange={(value) => form.setFieldValue('features', value)}>
              <Group gap="xs" role="group" aria-label={t('restaurantDetails.admin.featuresTitle')}>
                {restaurantFeatures.map((feature) => {
                  const Icon = featureIcons[feature]
                  return (
                    <Chip key={feature} value={feature} variant="outline">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon size={14} aria-hidden="true" />
                        {t(`restaurantDetails.features.${feature}`)}
                      </span>
                    </Chip>
                  )
                })}
              </Group>
            </Chip.Group>
            {typeof form.errors.features === 'string' && (
              <Text c="red" size="sm">
                {form.errors.features}
              </Text>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <Title order={3}>{t('restaurantDetails.admin.houseRulesTitle')}</Title>
            <Textarea
              label={t('restaurantDetails.admin.houseRules')}
              description={`${t('restaurantDetails.admin.houseRulesDescription')} ${t('restaurantDetails.admin.counter', { length: form.values.houseRules.length, max: maxHouseRulesLength })}`}
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              autosize
              minRows={3}
              maxLength={maxHouseRulesLength}
              {...form.getInputProps('houseRules')}
            />
          </Stack>
        </Card>

        {error !== null && !isSaveError(errorCode) && <ErrorAlert error={error} />}
      </Stack>

      <SaveBar dirty={form.isDirty()} saving={saveProfile.isPending || saveDetails.isPending} onDiscard={discard} />
    </form>
  )
}
