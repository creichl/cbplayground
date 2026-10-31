import { Alert, Button, Card, Grid, Group, Skeleton, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
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

const saveErrors: Record<ProfileError, ParseKeys> = {
  invalid_street: 'profile.errors.tooLong',
  invalid_postal_code: 'profile.errors.tooLong',
  invalid_city: 'profile.errors.tooLong',
  invalid_phone: 'profile.errors.tooLong',
  invalid_description: 'profile.errors.tooLong',
  invalid_email: 'profile.validation.email',
  invalid_website: 'profile.validation.website',
}

function isSaveError(code: string | null): code is ProfileError {
  return code !== null && code in saveErrors
}

type FormValues = Record<keyof Profile, string>

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
  const profile = useProfile()

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>{t('profile.title')}</Title>
        <Text c="dimmed">{t('profile.subtitle')}</Text>
      </Stack>

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
    mode: 'uncontrolled',
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
    }),
  )

  const error = save.error
  const errorCode = error instanceof ApiError ? error.code : null

  return (
    <form onSubmit={submit}>
      <Stack gap="lg">
        <Card>
          <Stack gap="md">
            <Title order={3}>{t('profile.address.title')}</Title>
            <TextInput
              label={t('profile.fields.street')}
              autoComplete="street-address"
              maxLength={profileMaxLengths.street}
              key={form.key('street')}
              {...form.getInputProps('street')}
            />
            <Grid>
              <Grid.Col span={{ base: 12, xs: 4 }}>
                <TextInput
                  label={t('profile.fields.postalCode')}
                  autoComplete="postal-code"
                  maxLength={profileMaxLengths.postalCode}
                  key={form.key('postalCode')}
                  {...form.getInputProps('postalCode')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, xs: 8 }}>
                <TextInput
                  label={t('profile.fields.city')}
                  autoComplete="address-level2"
                  maxLength={profileMaxLengths.city}
                  key={form.key('city')}
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
              key={form.key('phone')}
              {...form.getInputProps('phone')}
            />
            <TextInput
              label={t('profile.fields.email')}
              type="email"
              autoComplete="email"
              maxLength={profileMaxLengths.email}
              key={form.key('email')}
              {...form.getInputProps('email')}
            />
            <TextInput
              label={t('profile.fields.website')}
              description={t('profile.fields.websiteDescription')}
              type="url"
              autoComplete="url"
              placeholder="https://"
              maxLength={profileMaxLengths.website}
              key={form.key('website')}
              {...form.getInputProps('website')}
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <Title order={3}>{t('profile.description.title')}</Title>
            <Textarea
              label={t('profile.fields.description')}
              description={t('profile.fields.descriptionDescription', { max: profileMaxLengths.description })}
              autosize
              minRows={3}
              maxLength={profileMaxLengths.description}
              key={form.key('description')}
              {...form.getInputProps('description')}
            />
          </Stack>
        </Card>

        {error !== null &&
          (isSaveError(errorCode) ? (
            <Alert color="red" variant="light" title={t('profile.errors.title')}>
              {t(saveErrors[errorCode])}
            </Alert>
          ) : (
            <ErrorAlert error={error} />
          ))}

        <Group>
          <Button type="submit" loading={save.isPending}>
            {t('profile.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
