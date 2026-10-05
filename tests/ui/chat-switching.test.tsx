import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useConversationRequests } from '@/hooks/useConversationRequests';
import { renderHook } from '@testing-library/react';

const mockSession = { user: { id: 'staff', role: 'dietitian', firstName: 'Staff' } };
const mockParams = new URLSearchParams('user=alice');
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: mockSession, status: 'authenticated' }) }));
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/client-upload', () => ({ uploadFileReliably: jest.fn() }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('@/hooks/useRealtime', () => ({ useRealtime: () => ({ isConnected: true, onlineUsers: new Set(), forceReconnect: jest.fn() }) }));
jest.mock('@/hooks/useSimpleWebRTC', () => ({ useSimpleWebRTC: () => ({}) }));
jest.mock('@/components/layout/DashboardLayout', () => ({ __esModule: true, default: ({ children }: any) => <div>{children}</div> }));
jest.mock('@/components/messages/BulkMessageModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/chat/DocumentViewerModal', () => ({ DocumentViewerModal: () => null }));
import DesktopMessagesPage from '@/app/messages/page-old-desktop';

const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data });
const conversation = (id: string) => ({ user: { _id: id, firstName: id, lastName: 'Client', role: 'client' }, unreadCount: 0, lastMessage: { content: 'Preview', createdAt: new Date().toISOString() } });
const message = (id: string) => ({ _id: id, content: `History for ${id}`, type: 'text', sender: { _id: id }, receiver: { _id: 'staff' }, createdAt: new Date().toISOString(), isRead: true });

beforeEach(() => {
  window.HTMLElement.prototype.scrollTo = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

it.each(['dietitian', 'health_counselor'])('keeps the newly selected %s chat when a deep link and older failure arrive', async (role) => {
  mockSession.user.role = role;
  let failAlice!: (value: unknown) => void;
  global.fetch = jest.fn(async (url: any) => {
    const path = String(url);
    if (path.includes('/conversations')) return response({ conversations: [conversation('alice'), conversation('bob')] });
    if (path.includes('/users/alice')) return response(conversation('alice').user);
    if (path.includes('conversationWith=alice')) return await new Promise(resolve => { failAlice = resolve; });
    if (path.includes('conversationWith=bob')) return response({ messages: [message('bob')], pagination: { pages: 1 } });
    return response({ users: {} });
  }) as any;
  render(<DesktopMessagesPage />);
  await waitFor(() => expect(failAlice).toBeDefined());
  fireEvent.click((await screen.findAllByText('bob Client'))[0]);
  await screen.findByText('History for bob');
  await act(async () => { failAlice(response({}, false)); });
  expect(screen.queryByText('History for bob')).not.toBeNull();
  fireEvent.click(screen.getAllByText('bob Client')[0]);
  expect(screen.queryByText('History for bob')).not.toBeNull();
  expect(screen.queryByText('Unable to load this conversation. Please try again.')).toBeNull();
});

it('invalidates old requests even when returning to the same conversation', () => {
  const { result, rerender, unmount } = renderHook(({ id }) => useConversationRequests(id), { initialProps: { id: 'a' } });
  const old = result.current.begin('a')!;
  rerender({ id: 'b' });
  const current = result.current.begin('b')!;
  expect(old.signal.aborted).toBe(true);
  expect(old.isCurrent()).toBe(false);
  expect(current.isCurrent()).toBe(true);
  rerender({ id: 'a' });
  expect(old.isCurrent()).toBe(false);
  const latest = result.current.begin('a')!;
  unmount();
  expect(latest.signal.aborted).toBe(true);
});

it('does not let polling cancel an initial load or an older completion release a newer request', () => {
  const { result } = renderHook(() => useConversationRequests('a'));
  const initial = result.current.begin('a')!;
  expect(result.current.begin('a', 'messages', true)).toBeNull();
  const retry = result.current.begin('a')!;
  initial.finish();
  expect(retry.isCurrent()).toBe(true);
  retry.finish();
  expect(result.current.begin('a', 'messages', true)).not.toBeNull();
  expect(result.current.begin('b')).toBeNull();
});
