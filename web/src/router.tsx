import { createBrowserRouter } from 'react-router'
import { AdminLayout } from './layouts/AdminLayout.tsx'
import { FrontdeskLayout } from './layouts/FrontdeskLayout.tsx'
import { GuestLayout } from './layouts/GuestLayout.tsx'
import { FrontdeskTodayPage } from './pages/FrontdeskTodayPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { PlaceholderPage } from './pages/PlaceholderPage.tsx'
import { RestaurantPage } from './pages/RestaurantPage.tsx'

export const router = createBrowserRouter([
  {
    element: <GuestLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'r/:slug', element: <RestaurantPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: 'admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <PlaceholderPage titleKey="admin.nav.overview" /> },
      { path: 'areas', element: <PlaceholderPage titleKey="admin.nav.areas" /> },
      { path: 'opening-hours', element: <PlaceholderPage titleKey="admin.nav.openingHours" /> },
      { path: 'reservation-settings', element: <PlaceholderPage titleKey="admin.nav.reservationSettings" /> },
      { path: 'staff', element: <PlaceholderPage titleKey="admin.nav.staff" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: 'frontdesk',
    element: <FrontdeskLayout />,
    children: [
      { index: true, element: <FrontdeskTodayPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
