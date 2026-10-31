import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '../api/auth.ts'

/**
 * Sets the title of the browser tab to the page and the restaurant, e.g. "Tischübersicht · Gasthaus zur Linde".
 * The restaurant defaults to the signed-in user's restaurant; without a restaurant the product name is used.
 * While the page's name is not known yet (null), only the restaurant or product name is shown.
 */
export function useDocumentTitle(page: string | null, restaurant?: string | null) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const name = (restaurant === undefined ? currentUser.data?.tenant?.name : restaurant) ?? t('app.name')
  const title = page === null ? name : t('app.title', { page, name })

  useEffect(() => {
    document.title = title
  }, [title])
}
