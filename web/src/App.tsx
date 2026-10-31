import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { RouterProvider } from 'react-router/dom'
import { dayjsLocales, type Language } from './i18n/index.ts'
import { router } from './router.tsx'
import { theme } from './theme.ts'

const queryClient = new QueryClient({
  defaultOptions: {
    // One retry is enough to bridge a short hiccup without keeping the user waiting on a real error.
    queries: { retry: 1 },
  },
})

function App() {
  const { i18n } = useTranslation()
  const language = (i18n.resolvedLanguage ?? 'en') as Language

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
        <DatesProvider settings={{ locale: dayjsLocales[language] }}>
          <Notifications />
          <RouterProvider router={router} />
        </DatesProvider>
      </MantineProvider>
    </QueryClientProvider>
  )
}

export default App
