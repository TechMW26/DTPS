/// <reference types="jest" />

import Appointment from '@/lib/db/models/Appointment';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { socketManager } from '@/lib/realtime/socket-manager';
import { entityId } from '../utils/assertions';
import { createAssignedDietitianClientPair, ensureDatabaseConnection } from '../utils/database';
import { invokeRoute } from '../utils/routes';

jest.mock('@/lib/firebase/firebaseNotification', () => ({
  sendNotificationToUser: jest.fn(),
}));

const mockedSendNotification = sendNotificationToUser as jest.MockedFunction<
  typeof sendNotificationToUser
>;

describe('client appointment booking delivery', () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
    mockedSendNotification.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
      responses: [],
    });
  });

  it('invalidates the dietitian list and delivers realtime + push notifications', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const appointmentsRoute = await import('@/app/api/appointments/route');
    const clientAppointmentsRoute = await import('@/app/api/client/appointments/route');
    const sendToUserSpy = jest.spyOn(socketManager, 'sendToUser');

    const initial = await invokeRoute(appointmentsRoute.GET, {
      method: 'GET',
      url: 'http://localhost/api/appointments?limit=50',
      user: dietitian,
    });
    expect(initial.status).toBe(200);
    expect(initial.json.appointments).toHaveLength(0);

    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const booked = await invokeRoute(clientAppointmentsRoute.POST, {
      method: 'POST',
      url: 'http://localhost/api/client/appointments',
      user: client,
      body: {
        dietitianId: entityId(dietitian),
        scheduledAt: scheduledAt.toISOString(),
        duration: 45,
        type: 'video_consultation',
      },
    });

    expect(booked.status).toBe(200);
    expect(booked.json.success).toBe(true);
    expect(await Appointment.countDocuments({ client: client._id })).toBe(1);
    expect(sendToUserSpy).toHaveBeenCalledWith(
      entityId(dietitian),
      'appointment_booked',
      expect.objectContaining({ client: expect.objectContaining({ _id: entityId(client) }) }),
    );
    expect(mockedSendNotification).toHaveBeenCalledWith(
      entityId(dietitian),
      expect.objectContaining({
        data: expect.objectContaining({ type: 'appointment_booked' }),
        clickAction: '/appointments',
      }),
    );

    const refreshed = await invokeRoute(appointmentsRoute.GET, {
      method: 'GET',
      url: 'http://localhost/api/appointments?limit=50',
      user: dietitian,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.json.appointments).toHaveLength(1);
    expect(String(refreshed.json.appointments[0].client._id)).toBe(entityId(client));
  });
});
