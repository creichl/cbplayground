import { createBrowserRouter } from 'react-router'
import { RequireRole } from './components/RequireRole.tsx'
import { ToServiceScreen } from './components/ToServiceScreen.tsx'
import { HomePage } from './pages/HomePage.tsx'

// Every page except the start page, and its layout, is loaded when its route is first visited, so the start page does not carry the code
// of the restaurant's pages, the admin area, the front desk and the Superadmin (README, "Design system").
export const router = createBrowserRouter([
  {
    // Nothing is shown while the page of the first visited route loads.
    HydrateFallback: () => null,
    children: [
      // The start page brings its own header and footer (design system, src/ui).
      { index: true, element: <HomePage /> },
      { path: 'login', lazy: () => import('./pages/LoginPage.tsx').then(({ LoginPage }) => ({ Component: LoginPage })) },
      // Development only: the styleguide of the design system. The production build contains neither the route nor the page.
      ...(import.meta.env.DEV
        ? [
            {
              path: 'dev/ui',
              lazy: () => import('./pages/StyleguidePage.tsx').then(({ StyleguidePage }) => ({ Component: StyleguidePage })),
            },
          ]
        : []),
      {
        lazy: () => import('./layouts/EmbedLayout.tsx').then(({ EmbedLayout }) => ({ Component: EmbedLayout })),
        children: [{ path: 'embed/:slug', lazy: () => import('./pages/EmbedBookingPage.tsx').then(({ EmbedBookingPage }) => ({ Component: EmbedBookingPage })) }],
      },
      {
        lazy: () => import('./layouts/GuestLayout.tsx').then(({ GuestLayout }) => ({ Component: GuestLayout })),
        children: [
          { path: 'r/:slug', lazy: () => import('./pages/RestaurantPage.tsx').then(({ RestaurantPage }) => ({ Component: RestaurantPage })) },
          { path: 'r/:slug/reservation/:code', lazy: () => import('./pages/GuestReservationPage.tsx').then(({ GuestReservationPage }) => ({ Component: GuestReservationPage })) },
          { path: '*', lazy: () => import('./pages/NotFoundPage.tsx').then(({ NotFoundPage }) => ({ Component: NotFoundPage })) },
        ],
      },
      {
        path: 'superadmin',
        lazy: () =>
          import('./layouts/SuperadminLayout.tsx').then(({ SuperadminLayout }) => ({
            element: (
              <RequireRole roles={['Superadmin']}>
                <SuperadminLayout />
              </RequireRole>
            ),
          })),
        children: [
          { index: true, lazy: () => import('./pages/SuperadminTenantsPage.tsx').then(({ SuperadminTenantsPage }) => ({ Component: SuperadminTenantsPage })) },
          { path: 'tenants/:id', lazy: () => import('./pages/SuperadminTenantPage.tsx').then(({ SuperadminTenantPage }) => ({ Component: SuperadminTenantPage })) },
          { path: '*', lazy: () => import('./pages/NotFoundPage.tsx').then(({ NotFoundPage }) => ({ Component: NotFoundPage })) },
        ],
      },
      {
        path: 'admin',
        lazy: () =>
          import('./layouts/AdminLayout.tsx').then(({ AdminLayout }) => ({
            element: (
              <RequireRole roles={['TenantAdmin']}>
                <AdminLayout />
              </RequireRole>
            ),
          })),
        children: [
          { index: true, lazy: () => import('./pages/AdminOverviewPage.tsx').then(({ AdminOverviewPage }) => ({ Component: AdminOverviewPage })) },
          { path: 'reservations', element: <ToServiceScreen /> },
          { path: 'tables', element: <ToServiceScreen tableOverview /> },
          { path: 'profile', lazy: () => import('./pages/ProfilePage.tsx').then(({ ProfilePage }) => ({ Component: ProfilePage })) },
          { path: 'design', lazy: () => import('./pages/BrandingPage.tsx').then(({ BrandingPage }) => ({ Component: BrandingPage })) },
          { path: 'areas', lazy: () => import('./pages/AreasPage.tsx').then(({ AreasPage }) => ({ Component: AreasPage })) },
          { path: 'opening-hours', lazy: () => import('./pages/OpeningHoursPage.tsx').then(({ OpeningHoursPage }) => ({ Component: OpeningHoursPage })) },
          { path: 'reservation-settings', lazy: () => import('./pages/ReservationSettingsPage.tsx').then(({ ReservationSettingsPage }) => ({ Component: ReservationSettingsPage })) },
          { path: 'staff', lazy: () => import('./pages/StaffPage.tsx').then(({ StaffPage }) => ({ Component: StaffPage })) },
          { path: 'embed', lazy: () => import('./pages/EmbedSnippetPage.tsx').then(({ EmbedSnippetPage }) => ({ Component: EmbedSnippetPage })) },
          { path: '*', lazy: () => import('./pages/NotFoundPage.tsx').then(({ NotFoundPage }) => ({ Component: NotFoundPage })) },
        ],
      },
      {
        path: 'frontdesk',
        lazy: () =>
          import('./layouts/FrontdeskLayout.tsx').then(({ FrontdeskLayout }) => ({
            element: (
              <RequireRole roles={['TenantAdmin', 'FrontDesk']}>
                <FrontdeskLayout />
              </RequireRole>
            ),
          })),
        children: [
          { index: true, lazy: () => import('./pages/FrontdeskPage.tsx').then(({ FrontdeskPage }) => ({ Component: FrontdeskPage })) },
          { path: 'reservations', element: <ToServiceScreen /> },
          { path: 'tables', element: <ToServiceScreen tableOverview /> },
          { path: '*', lazy: () => import('./pages/NotFoundPage.tsx').then(({ NotFoundPage }) => ({ Component: NotFoundPage })) },
        ],
      },
    ],
  },
])
