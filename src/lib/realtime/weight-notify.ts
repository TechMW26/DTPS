import User from '@/lib/db/models/User';
import { socketManager } from '@/lib/realtime/socket-manager';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';

interface EmitClientWeightUpdateParams {
    clientId: string;
    weightKg: number;
    bmi?: string | number;
    source: 'client_progress' | 'client_profile' | 'onboarding' | 'staff_update';
}

export async function emitClientWeightUpdate({
    clientId,
    weightKg,
    bmi,
    source,
}: EmitClientWeightUpdateParams): Promise<void> {
    try {
        const client = await User.findById(clientId)
            .select('assignedDietitian assignedDietitians assignedHealthCounselor assignedHealthCounselors')
            .lean() as any;

        const recipients = new Set<string>();
        recipients.add(clientId);

        if (client?.assignedDietitian) {
            recipients.add(String(client.assignedDietitian));
        }

        if (Array.isArray(client?.assignedDietitians)) {
            client.assignedDietitians.forEach((id: any) => recipients.add(String(id)));
        }

        if (client?.assignedHealthCounselor) {
            recipients.add(String(client.assignedHealthCounselor));
        }

        if (Array.isArray(client?.assignedHealthCounselors)) {
            client.assignedHealthCounselors.forEach((id: any) => recipients.add(String(id)));
        }

        socketManager.sendToUsers(Array.from(recipients), SOCKET_EVENTS.CLIENT_WEIGHT_UPDATED, {
            clientId,
            weightKg,
            bmi,
            source,
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to emit client weight update:', error);
    }
}
