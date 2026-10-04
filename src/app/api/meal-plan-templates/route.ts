import {nativeStaffTemplateHandlers} from '@/lib/db/repository/native-staff-templates-route';
export const dynamic='force-dynamic';
const handlers=nativeStaffTemplateHandlers('mealplantemplates');
export const GET=handlers.list;
export const POST=handlers.create;
