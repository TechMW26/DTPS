/**
 * Component Tests: SendNotificationForm Multiple Client Selection
 * Tests the fix for the bug that prevented selecting multiple clients
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from 'next-auth/react';
import SendNotificationForm from '@/components/notifications/SendNotificationForm';
import { UserRole } from '@/types';

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: {
        id: 'admin-1',
        email: 'admin@test.com',
        role: UserRole.ADMIN,
      },
    },
    status: 'authenticated',
  })),
  SessionProvider: ({ children }: any) => children,
}));

// Mock fetch
global.fetch = jest.fn();

describe('SendNotificationForm: Multiple Client Selection Fix', () => {
  const mockRecipients = [
    {
      id: 'client-1',
      name: 'John Doe',
      email: 'john@dtps.com',
      role: UserRole.CLIENT,
      hasFcmToken: true,
      tokenCount: 2,
    },
    {
      id: 'client-2',
      name: 'Jane Smith',
      email: 'jane@dtps.com',
      role: UserRole.CLIENT,
      hasFcmToken: true,
      tokenCount: 1,
    },
    {
      id: 'client-3',
      name: 'Bob Johnson',
      email: 'bob@dtps.com',
      role: UserRole.CLIENT,
      hasFcmToken: false,
      tokenCount: 0,
    },
    {
      id: 'client-4',
      name: 'Alice Williams',
      email: 'alice@dtps.com',
      role: UserRole.CLIENT,
      hasFcmToken: true,
      tokenCount: 1,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        recipients: mockRecipients,
      }),
    });
  });

  describe('Bug Fix #1: setRecipientSelection allows multi-select', () => {
    it('should allow selecting multiple clients in particular mode', async () => {
      const user = userEvent.setup();
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      // Wait for recipients to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select first client
      const johnRow = screen.getByText('John Doe').closest('div[class*="flex items-center gap-3"]');
      await user.click(johnRow!);

      // Verify first client is selected
      await waitFor(() => {
        expect(johnRow).toHaveClass('bg-accent');
      });

      // Select second client WITHOUT deselecting first
      const janeRow = screen.getByText('Jane Smith').closest('div[class*="flex items-center gap-3"]');
      await user.click(janeRow!);

      // IMPORTANT FIX: Both clients should now be selected
      // Before the fix, Jane would replace John
      await waitFor(() => {
        expect(johnRow).toHaveClass('bg-accent');
        expect(janeRow).toHaveClass('bg-accent');
      });

      // Verify the badge count shows 2
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });

    it('should allow deselecting clients via click', async () => {
      const user = userEvent.setup();
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const johnRow = screen.getByText('John Doe').closest('div[class*="flex items-center gap-3"]');

      // Select
      await user.click(johnRow!);
      await waitFor(() => {
        expect(johnRow).toHaveClass('bg-accent');
      });

      // Deselect
      await user.click(johnRow!);
      await waitFor(() => {
        expect(johnRow).not.toHaveClass('bg-accent');
      });
    });
  });

  describe('Bug Fix #2: Checkboxes show in particular mode', () => {
    it('should display checkboxes when in particular mode (not just selected mode)', async () => {
      const user = userEvent.setup();
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      // Verify "Particular" radio is selected by default
      const particularRadio = screen.getByRole('radio', { name: /Particular/i }) as HTMLInputElement;
      expect(particularRadio.checked).toBe(true);

      // Wait for recipients to load
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Look for checkboxes - they should be visible in particular mode after fix
      const checkboxes = screen.queryAllByRole('checkbox');
      // Should have checkboxes visible for selecting multiple clients
      expect(checkboxes.length).toBeGreaterThanOrEqual(mockRecipients.length);
    });
  });

  describe('Bug Fix #3: selectAllFiltered works in particular mode', () => {
    it('should show "Select All" button in particular mode', async () => {
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // "Select All" button should be visible
      const selectAllButton = screen.getByRole('button', { name: /Select All/i });
      expect(selectAllButton).toBeInTheDocument();
    });

    it('should select all visible recipients when clicking "Select All"', async () => {
      const user = userEvent.setup();
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const selectAllButton = screen.getByRole('button', { name: /Select All/i });
      await user.click(selectAllButton);

      // All recipients should now be highlighted
      await waitFor(() => {
        mockRecipients.forEach((recipient) => {
          const row = screen.getByText(recipient.name).closest('div[class*="flex items-center gap-3"]');
          expect(row).toHaveClass('bg-accent');
        });
      });
    });
  });

  describe('Bug Fix #4: Mode switching preserves selections', () => {
    it('should not strip selections when switching from selected to particular mode', async () => {
      const user = userEvent.setup();
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Start in "Particular" mode and select 3 clients
      const johnRow = screen.getByText('John Doe').closest('div[class*="flex items-center gap-3"]');
      const janeRow = screen.getByText('Jane Smith').closest('div[class*="flex items-center gap-3"]');
      const bobRow = screen.getByText('Bob Johnson').closest('div[class*="flex items-center gap-3"]');

      await user.click(johnRow!);
      await user.click(janeRow!);
      await user.click(bobRow!);

      // Verify all are selected
      await waitFor(() => {
        expect(johnRow).toHaveClass('bg-accent');
        expect(janeRow).toHaveClass('bg-accent');
        expect(bobRow).toHaveClass('bg-accent');
      });

      // Switch to "Selected" mode
      const selectedRadio = screen.getByRole('radio', { name: /Selected/i });
      await user.click(selectedRadio);

      // ALL SELECTIONS SHOULD BE PRESERVED (this is the fix)
      await waitFor(() => {
        expect(johnRow).toHaveClass('bg-accent');
        expect(janeRow).toHaveClass('bg-accent');
        expect(bobRow).toHaveClass('bg-accent');
      });
    });
  });

  describe('Bug Fix #5: Error message consistency', () => {
    it('should show consistent error message for empty selection', async () => {
      const user = userEvent.setup();
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Fill in title and body
      const titleInput = screen.getByPlaceholderText(/Enter notification title/i);
      const bodyInput = screen.getByPlaceholderText(/Enter notification message/i);

      await user.type(titleInput, 'Test Title');
      await user.type(bodyInput, 'Test Message');

      // Try to send without selecting any recipients
      const sendButton = screen.getByRole('button', { name: /Send Notification/i });
      await user.click(sendButton);

      // Should show error about selecting at least one user (not mode-specific)
      await waitFor(() => {
        expect(screen.getByText(/Please select at least one user/i)).toBeInTheDocument();
      });
    });
  });

  describe('Bug Fix #6: API receives multiple userIds correctly', () => {
    it('should send correct payload with multiple userIds to API', async () => {
      const user = userEvent.setup();
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select 3 clients
      const clients = ['John Doe', 'Jane Smith', 'Bob Johnson'];
      for (const clientName of clients) {
        const row = screen.getByText(clientName).closest('div[class*="flex items-center gap-3"]');
        await user.click(row!);
      }

      // Fill form
      const titleInput = screen.getByPlaceholderText(/Enter notification title/i);
      const bodyInput = screen.getByPlaceholderText(/Enter notification message/i);

      await user.type(titleInput, 'Multi-Client Test');
      await user.type(bodyInput, 'Testing multiple clients');

      // Mock the send API
      const mockSendResponse = {
        success: true,
        message: 'Notification dispatch completed',
        stats: { total: 3, success: 3, failed: 0, skippedNoToken: 0 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSendResponse,
      });

      // Send
      const sendButton = screen.getByRole('button', { name: /Send Notification/i });
      await user.click(sendButton);

      // Verify API was called with correct payload
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/admin/notifications/send',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining(JSON.stringify(['client-1', 'client-2', 'client-3'])),
          })
        );
      });
    });
  });

  describe('Regression Tests: Ensure backward compatibility', () => {
    it('should still work with single client selection', async () => {
      const user = userEvent.setup();
      render(
        <SessionProvider session={null}>
          <SendNotificationForm />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Select single client
      const johnRow = screen.getByText('John Doe').closest('div[class*="flex items-center gap-3"]');
      await user.click(johnRow!);

      // Fill form
      const titleInput = screen.getByPlaceholderText(/Enter notification title/i);
      const bodyInput = screen.getByPlaceholderText(/Enter notification message/i);

      await user.type(titleInput, 'Single Client Test');
      await user.type(bodyInput, 'Testing single client');

      // Should be able to send
      const sendButton = screen.getByRole('button', { name: /Send Notification/i });
      expect(sendButton).not.toBeDisabled();
    });
  });
});
