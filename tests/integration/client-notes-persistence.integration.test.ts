/// <reference types="jest" />

import ClientNote from '@/lib/db/models/ClientNote';
import { entityId } from '../utils/assertions';
import { createAssignedDietitianClientPair, ensureDatabaseConnection } from '../utils/database';
import { invokeRouteWithParams } from '../utils/routes';

describe('client notes persistence', () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it('persists text and voice attachments and returns them after a fresh read', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const route = await import('@/app/api/users/[id]/notes/route');
    const clientId = entityId(client);

    const created = await invokeRouteWithParams(route.POST, {
      method: 'POST',
      url: `http://localhost/api/users/${clientId}/notes`,
      user: dietitian,
      params: { id: clientId },
      body: {
        topicType: 'General',
        content: 'Persistent follow-up note',
        showToClient: true,
        attachments: [
          {
            type: 'audio',
            url: 'https://test.public.blob.vercel-storage.com/notes/follow-up.m4a',
            filename: 'follow-up.m4a',
            mimeType: 'audio/mp4',
            size: 2048,
          },
        ],
      },
    });

    expect(created.status).toBe(200);
    expect(created.json.note.content).toBe('Persistent follow-up note');
    expect(await ClientNote.countDocuments({ client: client._id })).toBe(1);

    const fetched = await invokeRouteWithParams(route.GET, {
      method: 'GET',
      url: `http://localhost/api/users/${clientId}/notes`,
      user: dietitian,
      params: { id: clientId },
    });

    expect(fetched.status).toBe(200);
    expect(fetched.json.notes).toHaveLength(1);
    expect(fetched.json.notes[0]).toEqual(
      expect.objectContaining({
        content: 'Persistent follow-up note',
        attachments: [expect.objectContaining({ type: 'audio', mimeType: 'audio/mp4' })],
      }),
    );
  });
});
