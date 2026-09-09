import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { coalesceRead } from '@/lib/api/coalesce-read';

export async function getUserDirectorySummary() {
  // Global counts contain no user records. Caller must authorize the request.
  // The role/clientId index covers this one pass, replacing four counts and a
  // separate client-ID scan/sort on every directory page request.
  return coalesceRead('user-directory-summary', async () => {
    const rows = await User.aggregate<{ _id: string; count: number; latestClientIdNumber: number }>([
      { $match: { role: { $in: Object.values(UserRole) } } },
      { $group: {
        _id: '$role',
        count: { $sum: 1 },
        latestClientIdNumber: { $max: { $cond: [
          { $regexMatch: { input: { $ifNull: ['$clientId', ''] }, regex: /^C-\d+$/ } },
          { $convert: { input: { $substrBytes: ['$clientId', 2, -1] }, to: 'int', onError: 0, onNull: 0 } },
          0,
        ] } },
      } },
    ]);
    const byRole = new Map(rows.map(row => [row._id, row]));
    return {
      adminsCount: byRole.get(UserRole.ADMIN)?.count || 0,
      dietitiansCount: byRole.get(UserRole.DIETITIAN)?.count || 0,
      healthCounselorsCount: byRole.get(UserRole.HEALTH_COUNSELOR)?.count || 0,
      clientsCount: byRole.get(UserRole.CLIENT)?.count || 0,
      latestClientIdNumber: byRole.get(UserRole.CLIENT)?.latestClientIdNumber || 0,
    };
  });
}
