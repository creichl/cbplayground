import { Alert, Button, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { requestErrorMessage } from '../api/client.ts'

type ErrorAlertProps = {
  error: Error
  onRetry?: () => void
}

/** Shows a failed request in the user's language, optionally with a retry button. */
export function ErrorAlert({ error, onRetry }: ErrorAlertProps) {
  const { t } = useTranslation()

  const message = requestErrorMessage(error, t)

  return (
    <Alert color="red" variant="light" title={t('errors.title')}>
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{message}</Text>
        {onRetry !== undefined && (
          <Button size="xs" variant="white" color="red" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </Stack>
    </Alert>
  )
}
