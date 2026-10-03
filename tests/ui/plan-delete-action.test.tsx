import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanDeleteAction } from '@/components/clientDashboard/PlanDeleteAction';

it.each(['dietitian', 'health-counselor', 'client', undefined])('hides deletion for %s', (role) => {
  render(<PlanDeleteAction role={role} planName="Fat loss phase" onDelete={jest.fn()} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('requires confirmation, supports cancellation, and prevents repeated submission', async () => {
  let finish!: (success: boolean) => void;
  const onDelete = jest.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  render(<PlanDeleteAction role="admin" planName="Fat loss phase" compact onDelete={onDelete} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete plan Fat loss phase' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Fat loss phase');
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete plan Fat loss phase' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }));
  expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(onDelete).toHaveBeenCalledTimes(1);
  await act(async () => finish(true));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
});

it('keeps confirmation open for retry when deletion fails', async () => {
  const onDelete = jest.fn().mockResolvedValue(false);
  render(<PlanDeleteAction role="admin" planName="Fat loss phase" onDelete={onDelete} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete plan Fat loss phase' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete plan' })).toBeEnabled());
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
});

it.each(['admin', 'dietitian', 'health_counselor', 'dietician'])('shows draft deletion for %s', (role) => {
  render(<PlanDeleteAction role={role} isDraft planName="Draft phase" onDelete={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Delete plan Draft phase' })).toBeVisible();
});

it.each(['client', undefined])('does not expose staff draft actions to %s', (role) => {
  render(<PlanDeleteAction role={role} isDraft planName="Draft phase" onDelete={jest.fn()} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
