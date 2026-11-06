import { Card, Grid, Skeleton, Stack, Textarea, TextInput, Title } from '@mantine/core'
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
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { SaveBar } from '../components/SaveBar.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

type FormValues = Record<keyof Profile, string>

/** The API's error codes, each shown at its field. */
const saveErrors: Record<ProfileError, { field: keyof FormValues; message: ParseKeys }> = {
  invalid_street: { field: 'street', message: 'profile.errors.tooLong' },
  invalid_postal_code: { field: 'postalCode', message: 'profile.errors.tooLong' },
  invalid_city: { field: 'city', message: 'profile.errors.tooLong' },
  invalid_phone: { field: 'phone', message: 'profile.errors.tooLong' },
  invalid_description: { field: 'description', message: 'profile.errors.tooLong' },
  invalid_email: { field: 'email', message: 'profile.validation.email' },
  invalid_website: { field: 'website', message: 'profile.validation.website' },
}

function isSaveError(code: string | null): code is ProfileError {
  return code !== null && code in saveErrors
}

function toFormValues(profile: Profile): FormValues {
  return {
    street: profile.street ?? '',
    postalCode: profile.postalCode ?? '',
    city: profile.city ?? '',
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    website: profile.website ?? '',
    description: profile.description ?? '',
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

/** Admin page: address, contact and short description of the restaurant, which guests will see. */
export function ProfilePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('profile.title'))
  const profile = useProfile()

  return (
    <Stack gap="lg">
      <PageHeader title={t('profile.title')} description={t('profile.subtitle')} />

      {profile.isPending ? (
        <Stack gap="lg">
          <Skeleton h={220} radius="md" />
          <Skeleton h={180} radius="md" />
        </Stack>
      ) : profile.isError ? (
        <ErrorAlert error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <ProfileForm profile={profile.data} />
      )}
    </Stack>
  )
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const save = useSaveProfile()

  const form = useForm<FormValues>({
    mode: 'controlled',
    initialValues: toFormValues(profile),
    validate: {
      email: (value) => (value.trim() === '' || isValidEmail(value.trim()) ? null : t('profile.validation.email')),
      website: (value) => (value.trim() === '' || isValidWebsite(value.trim()) ? null : t('profile.validation.website')),
    },
  })

  const submit = form.onSubmit((values) =>
    save.mutate(toProfile(values), {
      onSuccess: (saved) => {
        const savedValues = toFormValues(saved)
        form.setValues(savedValues)
        form.resetDirty(savedValues)
        notifications.show({ color: 'green', message: t('profile.saved') })
      },
      onError: (error) => {
        const code = error instanceof ApiError ? error.code : null
        if (isSaveError(code)) {
          form.setFieldError(saveErrors[code].field, t(saveErrors[code].message))
        }
      },
    }),
  )

  const error = save.error
  const errorCode = error instanceof ApiError ? error.code : null

  const discard = () => {
    save.reset()
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
              description={t('profile.fields.descriptionDescription', { count: profileMaxLengths.description })}
              autosize
              minRows={3}
              maxLength={profileMaxLengths.description}
              {...form.getInputProps('description')}
            />
          </Stack>
        </Card>

        {error !== null && !isSaveError(errorCode) && <ErrorAlert error={error} />}
      </Stack>

      <SaveBar dirty={form.isDirty()} saving={save.isPending} onDiscard={discard} />
    </form>
  )
}
