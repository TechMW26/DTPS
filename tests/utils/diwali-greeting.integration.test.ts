/**
 * @jest-environment jsdom
 */
import {createElement} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {isDiwaliPopupTime, isDiwaliPushTime, DIWALI_PUSH_IMAGE} from '@/lib/festive/diwali';
import {DiwaliPopup} from '@/components/client/DiwaliPopup';

describe('Diwali dates (IST)', () => {
  it('popup runs from 8 Nov 12:00 AM to the end of 10 Nov', () => {
    expect(isDiwaliPopupTime(new Date('2026-11-07T23:59:59+05:30'))).toBe(false);
    expect(isDiwaliPopupTime(new Date('2026-11-08T00:00:00+05:30'))).toBe(true);
    expect(isDiwaliPopupTime(new Date('2026-11-10T23:59:59+05:30'))).toBe(true);
    expect(isDiwaliPopupTime(new Date('2026-11-11T00:00:00+05:30'))).toBe(false);
  });
  it('push goes out only on 8 Nov', () => {
    expect(isDiwaliPushTime(new Date('2026-11-07T23:59:00+05:30'))).toBe(false);
    expect(isDiwaliPushTime(new Date('2026-11-08T00:00:00+05:30'))).toBe(true);
    expect(isDiwaliPushTime(new Date('2026-11-09T00:00:00+05:30'))).toBe(false);
    expect(DIWALI_PUSH_IMAGE).toBe('https://dtps.tech/api/festive/diwali-banner');
  });
});

describe('Diwali popup', () => {
  afterEach(() => jest.useRealTimers());

  it('shows on every app open during Diwali and closes with the cross', async () => {
    jest.useFakeTimers({now: new Date('2026-11-08T00:05:00+05:30')});
    const first = render(createElement(DiwaliPopup));
    await act(async () => {});
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    first.unmount();
    // Refresh = mount again: it comes back.
    render(createElement(DiwaliPopup));
    await act(async () => {});
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText(/Celebrate with DTPS/));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not show before 8 Nov or after 10 Nov', async () => {
    for (const when of ['2026-11-07T23:59:00+05:30', '2026-11-11T00:00:01+05:30']) {
      jest.useFakeTimers({now: new Date(when)});
      const view = render(createElement(DiwaliPopup));
      await act(async () => {});
      expect(screen.queryByRole('dialog')).toBeNull();
      view.unmount();
    }
  });
});
