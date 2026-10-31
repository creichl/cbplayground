import { createBrowserRouter } from 'react-router'
import { RequireRole } from './components/RequireRole.tsx'
import { AdminLayout } from './layouts/AdminLayout.tsx'
import { FrontdeskLayout } from './layouts/FrontdeskLayout.tsx'
import { GuestLayout } from './layouts/GuestLayout.tsx'
import { AdminOverviewPage } from './pages/AdminOverviewPage.tsx'
import { AreasPage } from './pages/AreasPage.tsx'
import { FrontdeskTodayPage } from './pages/FrontdeskTodayPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { OpeningHoursPage } from './pages/OpeningHoursPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'
import { ReservationSettingsPage } from './pages/ReservationSettingsPage.tsx'
import { ReservationsPage } from './pages/ReservationsPage.tsx'
import { RestaurantPage } from './pages/RestaurantPage.tsx'
import { StaffPage } from './pages/StaffPage.tsx'
import { TableOverviewPage } from './pages/TableOverviewPage.tsx'

export const router = createBrowserRouter([
  { path: 'login', element: <LoginPage /> },
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
    element: (
      <RequireRole roles={['TenantAdmin']}>
        <AdminLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <AdminOverviewPage /> },
      { path: 'reservations', element: <ReservationsPage /> },
      { path: 'tables', element: <TableOverviewPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'areas', element: <AreasPage /> },
      { path: 'opening-hours', element: <OpeningHoursPage /> },
      { path: 'reservation-settings', element: <ReservationSettingsPage /> },
      { path: 'staff', element: <StaffPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: 'frontdesk',
    element: (
      <RequireRole roles={['TenantAdmin', 'FrontDesk']}>
        <FrontdeskLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <FrontdeskTodayPage /> },
      { path: 'reservations', element: <ReservationsPage /> },
      { path: 'tables', element: <TableOverviewPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
