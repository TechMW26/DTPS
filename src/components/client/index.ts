// Client components barrel export
// Layout Components
export { default as ClientLayout } from './ClientLayout';
export { default as ClientHeader } from './ClientHeader';
export { default as UserNavBar } from './UserNavBar';
// export { default as ClientBottomNav } from './ClientBottomNav';

// Responsive Utilities
export { 
  Container, 
  PageHeader, 
  Section, 
  ResponsiveGrid,
  MobileOnly,
  DesktopOnly,
  TabletAndUp,
  MobileAndTablet,
  Stack,
  Flex
} from './ResponsiveUtils';

// Core Components
export { default as ContactDietitian } from './ContactDietitian';

// Stats Components
export { default as ClientStatCard } from './ClientStats';
export { ClientStatsGrid } from './ClientStats';

// Meal Components
export { default as ClientMealCard } from './ClientMealCard';
export { ClientMealCardList } from './ClientMealCard';

// Progress Components
export { default as ClientProgressChart } from './ClientProgressChart';
export { ClientCircularProgress } from './ClientProgressChart';

// Appointment Components
export { default as ClientAppointmentCard } from './ClientAppointmentCard';
export { ClientAppointmentList } from './ClientAppointmentCard';

// Billing Components
export { default as ClientBillingCard } from './ClientBillingCard';
export { ClientBillingList, ClientBillingSummary } from './ClientBillingCard';
