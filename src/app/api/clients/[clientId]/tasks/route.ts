import {nativeStaffTaskHandlers} from '@/lib/db/repository/native-staff-tasks-route';
export const dynamic='force-dynamic';
const handlers=nativeStaffTaskHandlers();
export const GET=handlers.GET;
export const POST=handlers.POST;
