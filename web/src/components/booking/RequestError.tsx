import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { requestErrorMessage } from '../../api/client.ts'
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'

/**
 * A failed request of the booking in the guest's language (no connection, too many requests, …), with "Try again".
 * The design system's counterpart of ErrorAlert.
 */
export function RequestError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{t('errors.title')}</AlertTitle>
      <AlertDescription>
        <p>{requestErrorMessage(error, t)}</p>
        <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
          <RefreshCwIcon aria-hidden="true" />
          {t('common.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
