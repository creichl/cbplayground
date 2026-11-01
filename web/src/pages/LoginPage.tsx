import { Alert, Box, Button, Card, Center, Container, Group, Loader, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router'
import { homePath, useCurrentUser, useLogin } from '../api/auth.ts'
import { ApiError } from '../api/client.ts'
import { Brand } from '../components/Brand.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'
import { Photo } from '../components/Photo.tsx'
import { useDocumentTitle } from '../i18n/title.ts'

const loginErrors = {
  invalid_credentials: 'login.errors.invalidCredentials',
  locked_out: 'login.errors.lockedOut',
  deactivated: 'login.errors.deactivated',
  restaurant_deactivated: 'login.errors.restaurantDeactivated',
  too_many_requests: 'login.errors.tooManyRequests',
} as const

function isLoginError(code: string | null): code is keyof typeof loginErrors {
  return code !== null && code in loginErrors
}

/** The demo users of the development seed (see the README). Only shown in development. */
const demoPassword = 'Demo1234!'
const demoAccounts = [
  { email: 'admin@zur-linde.local', role: 'login.demo.tenantAdmin', restaurant: 'Gasthaus zur Linde' },
  { email: 'frontdesk@zur-linde.local', role: 'login.demo.frontDesk', restaurant: 'Gasthaus zur Linde' },
  { email: 'admin@kafana-dunav.local', role: 'login.demo.tenantAdmin', restaurant: 'Kafana Dunav' },
  { email: 'frontdesk@kafana-dunav.local', role: 'login.demo.frontDesk', restaurant: 'Kafana Dunav' },
  { email: 'superadmin@cbplayground.local', role: 'login.demo.superadmin', restaurant: null },
] as const

/** Only paths inside the app, so the login cannot be used to redirect to another site. */
function safeReturnTo(value: string | null) {
  return value !== null && value.startsWith('/') && !value.startsWith('//') ? value : null
}

/** The photo beside the sign-in, in `web/public/` (see CREDITS.md there). */
const loginPhoto = '/login-photo.webp'

/**
 * Staff sign-in. From about 992 px on it is split: on the left the card with email and password, centred, on the right a
 * photo of a restaurant, filling the height. On smaller screens only the form; the photo is not loaded there.
 */
export function LoginPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('login.title'), null)
  const [searchParams] = useSearchParams()
  const currentUser = useCurrentUser()
  const login = useLogin()

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { email: '', password: '' },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value.trim()) ? null : t('login.validation.email')),
      password: (value) => (value.length > 0 ? null : t('login.validation.password')),
    },
  })

  // Signed in, either just now or from an earlier visit: continue where the user wanted to go.
  if (currentUser.data) {
    return <Navigate to={safeReturnTo(searchParams.get('returnTo')) ?? homePath(currentUser.data.role)} replace />
  }

  if (currentUser.isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  const error = login.error
  const errorCode = error instanceof ApiError ? error.code : null

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0} mih="100vh">
      <Center mih="100vh" bg="gray.0" py="xl">
        <Container size={440} w="100%">
          <Stack gap="lg">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Brand to="/" />
              <LanguageSwitcher />
            </Group>

            <Card padding="xl">
              <form onSubmit={form.onSubmit((values) => login.mutate({ email: values.email.trim(), password: values.password }))}>
                <Stack gap="md">
                  <Stack gap={4}>
                    <Title order={2}>{t('login.title')}</Title>
                    <Text c="dimmed" size="sm">
                      {t('login.subtitle')}
                    </Text>
                  </Stack>

                  {error !== null &&
                    (isLoginError(errorCode) ? (
                      <Alert color="red" variant="light">
                        {t(loginErrors[errorCode])}
                      </Alert>
                    ) : (
                      <ErrorAlert error={error} />
                    ))}

                  <TextInput
                    label={t('login.email')}
                    type="email"
                    autoComplete="username"
                    autoFocus
                    key={form.key('email')}
                    {...form.getInputProps('email')}
                  />
                  <PasswordInput
                    label={t('login.password')}
                    autoComplete="current-password"
                    key={form.key('password')}
                    {...form.getInputProps('password')}
                  />
                  <Button type="submit" fullWidth size="md" loading={login.isPending}>
                    {t('login.submit')}
                  </Button>
                </Stack>
              </form>
            </Card>

            {import.meta.env.DEV && (
              <DemoAccounts
                onPick={(email) => {
                  form.setValues({ email, password: demoPassword })
                  form.clearErrors()
                }}
              />
            )}
          </Stack>
        </Container>
      </Center>
      {/* Only a picture of the place; the photo fills the right half, cropped to fit. */}
      <Box visibleFrom="md" pos="relative" mih="100vh">
        <Box pos="sticky" top={0} h="100vh">
          <Photo src={loginPhoto} alt="" placeholder="var(--mantine-color-dark-7)" fallback={null} />
        </Box>
      </Box>
    </SimpleGrid>
  )
}

/** Development only: the demo users; a click fills in the sign-in form. */
function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const { t } = useTranslation()

  return (
    <Alert color="yellow" variant="light" title={t('login.demo.title')}>
      <Stack gap="xs">
        <Text size="sm">{t('login.demo.text', { password: demoPassword })}</Text>
        {demoAccounts.map((account) => (
          <UnstyledButton key={account.email} onClick={() => onPick(account.email)}>
            <Text size="sm" fw={600} c="brand.8">
              {account.email}
            </Text>
            <Text size="xs" c="dimmed">
              {account.restaurant !== null ? `${t(account.role)} · ${account.restaurant}` : t(account.role)}
            </Text>
          </UnstyledButton>
        ))}
      </Stack>
    </Alert>
  )
}
