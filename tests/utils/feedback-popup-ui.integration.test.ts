/**
 * @jest-environment jsdom
 */
import {createElement} from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

let mockPath = '/user';
jest.mock('next/navigation', () => ({usePathname: () => mockPath}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({href, children, ...rest}: {href: string; children: unknown}) => createElement('a', {href, ...rest}, children as never),
}));
jest.mock('@/contexts/ThemeContext', () => ({useTheme: () => ({isDarkMode: false})}));

import {FeedbackPopup, FeedbackReminderBanner} from '@/components/client/FeedbackPrompts';

type Prompts = {onboardingDue: boolean; feedbackDue: boolean; feedbackDueFrom: string | null; showPopup: boolean; nextPopupAt: string | null};
const later = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

function mockApi(get: Prompts) {
  const calls: string[] = [];
  global.fetch = jest.fn(async (_url: unknown, init?: {method?: string}) => {
    calls.push(init?.method || 'GET');
    const body = init?.method === 'POST' ? {...get, showPopup: false, nextPopupAt: later} : get;
    return {ok: true, json: async () => body} as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe('feedback popup in the client app', () => {
  beforeEach(() => {
    mockPath = '/user';
  });

  it('shows both forms on app open, records it once, and closes with the cross', async () => {
    const calls = mockApi({onboardingDue: true, feedbackDue: true, feedbackDueFrom: null, showPopup: true, nextPopupAt: null});
    render(createElement(FeedbackPopup));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Onboarding form').closest('a')?.getAttribute('href')).toBe('/user/onboarding-feedback');
    expect(screen.getByText('Feedback form').closest('a')?.getAttribute('href')).toBe('/user/feedback');
    await waitFor(() => expect(calls).toEqual(['GET', 'POST']));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not come back in Meals / Messages / Profile within 24 hours', async () => {
    const calls = mockApi({onboardingDue: true, feedbackDue: false, feedbackDueFrom: null, showPopup: true, nextPopupAt: null});
    const view = render(createElement(FeedbackPopup));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() => expect(calls).toEqual(['GET', 'POST']));
    for (const path of ['/user/plan', '/user/messages', '/user/profile']) {
      mockPath = path;
      await act(async () => view.rerender(createElement(FeedbackPopup)));
    }
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).toEqual(['GET', 'POST']);
  });

  it('only shows the onboarding form before the 10th day', async () => {
    mockApi({onboardingDue: true, feedbackDue: false, feedbackDueFrom: null, showPopup: true, nextPopupAt: null});
    render(createElement(FeedbackPopup));
    await screen.findByRole('dialog');
    expect(screen.queryByText('Feedback form')).toBeNull();
  });

  it('stays hidden when the server says the 24 hours are not over', async () => {
    const calls = mockApi({onboardingDue: true, feedbackDue: true, feedbackDueFrom: null, showPopup: false, nextPopupAt: later});
    render(createElement(FeedbackPopup));
    await waitFor(() => expect(calls).toEqual(['GET']));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never opens on the form pages', async () => {
    mockPath = '/user/feedback';
    const calls = mockApi({onboardingDue: true, feedbackDue: true, feedbackDueFrom: null, showPopup: true, nextPopupAt: null});
    render(createElement(FeedbackPopup));
    await act(async () => {});
    expect(calls).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps working (no popup, no crash) when the server is down', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    render(createElement(FeedbackPopup));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('red feedback reminder on home', () => {
  it('shows a link to the feedback form while it is due', async () => {
    mockApi({onboardingDue: false, feedbackDue: true, feedbackDueFrom: null, showPopup: false, nextPopupAt: later});
    render(createElement(FeedbackReminderBanner));
    const link = (await screen.findByText(/feedback form is pending/i)).closest('a');
    expect(link?.getAttribute('href')).toBe('/user/feedback');
  });

  it('is not shown for the onboarding form alone or after submission', async () => {
    mockApi({onboardingDue: true, feedbackDue: false, feedbackDueFrom: null, showPopup: true, nextPopupAt: null});
    render(createElement(FeedbackReminderBanner));
    await act(async () => {});
    expect(screen.queryByText(/feedback form is pending/i)).toBeNull();
  });
});
