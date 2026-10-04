import {nativeStaffTemplateHandlers} from '@/lib/db/repository/native-staff-templates-route';
export const dynamic='force-dynamic';
export const POST=nativeStaffTemplateHandlers('diettemplates').restore;
