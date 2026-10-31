import { Alert, Button, Card, Center, Container, Group, Loader, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router'
import { homePath, useCurrentUser, useLogin } from '../api/auth.ts'
import { ApiError } from '../api/client.ts'
import { Brand } from '../components/Brand.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'

const loginErrors = {
  invalid_credentials: 'login.errors.invalidCredentials',
  locked_out: 'login.errors.lockedOut',
  deactivated: 'login.errors.deactivated',
} as const

function isLoginError(code: string | null): code is keyof typeof loginErrors {
  return code !== null && code in loginErrors
}

/** Only paths inside the app, so the login cannot be used to redirect to another site. */
function safeReturnTo(value: string | null) {
  return value !== null && value.startsWith('/') && !value.startsWith('//') ? value : null
}

/** Staff sign-in: a centred card with email and password. */
export function LoginPage() {
  const { t } = useTranslation()
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
        </Stack>
      </Container>
    </Center>
  )
}
