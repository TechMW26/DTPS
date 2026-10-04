import {nativeStaffTemplateHandlers} from '@/lib/db/repository/native-staff-templates-route';
export const dynamic='force-dynamic';
const handlers=nativeStaffTemplateHandlers('mealplantemplates');
export const GET=handlers.GET;
export const PUT=handlers.PUT;
export const DELETE=handlers.DELETE;
export const PATCH=handlers.PATCH;
