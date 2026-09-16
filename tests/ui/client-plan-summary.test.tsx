import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { ClientPlanSummary } from '@/components/client/ClientPlanSummary';

it('shows the full purchased term and expiry separately from a ten-day meal phase', () => {
  render(<ClientPlanSummary purchase={{ planName: 'Weight Loss', durationLabel: '3 Months', durationDays: 90,
    startDate: '2026-09-09T05:57:04Z', endDate: '2026-12-08T05:57:04Z',
    expectedStartDate: '2026-09-15T00:00:00Z', expectedEndDate: '2026-12-15T00:00:00Z',
    mealPlanName: 'Detox Plan', ongoingMealPlanDuration: 10,
    ongoingMealPlanStartDate: '2026-09-15T00:00:00Z', ongoingMealPlanEndDate: '2026-09-24T00:00:00Z',
  }} />);
  const subscription = within(screen.getByRole('region', { name: 'Subscription details' }));
  expect(subscription.getByText('3 Months')).toBeInTheDocument();
  expect(subscription.getByText('15 Dec 2026')).toBeInTheDocument();
  expect(subscription.queryByText(/10 days/)).not.toBeInTheDocument();
  const phase = within(screen.getByRole('region', { name: 'Current meal phase' }));
  expect(phase.getByText('Detox Plan · 10 days')).toBeInTheDocument();
  expect(phase.getByText('15 Sep 2026 – 24 Sep 2026')).toBeInTheDocument();
});

it('uses saved purchase dates when expected dates are absent and never fabricates an expiry', () => {
  const { rerender } = render(<ClientPlanSummary purchase={{ planName: 'Wellness', durationDays: 90, endDate: '2026-12-08T00:00:00Z' }} />);
  expect(screen.getByText('08 Dec 2026')).toBeInTheDocument();
  rerender(<ClientPlanSummary purchase={{ planName: 'Wellness', durationDays: 90 }} />);
  expect(screen.getAllByText('To be confirmed')).toHaveLength(2);
});
