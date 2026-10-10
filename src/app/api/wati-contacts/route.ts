import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
import {requireNativeAuditAdmin} from '@/lib/db/repository/native-admin-audit';
import {listNativeWatiContacts,importNativeWatiContact} from '@/lib/db/repository/native-admin-wati';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(r:NextRequest){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await listNativeWatiContacts(getNativeDatabase(),session.user.id,r.nextUrl.searchParams));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to fetch contacts'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export async function POST(){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const db=getNativeDatabase();await requireNativeAuditAdmin(db,session.user.id);const raw:any[]=await import('@/app/data/wati_contacts.contacts.json').then(m=>m.default||m);let imported=0,failed=0;for(const r of raw){
      const externalId = r.id || r._id?.$oid || undefined;
      const importedAt = r.importedAt?.$date ? String(r.importedAt.$date) : (typeof r.importedAt === 'string' ? r.importedAt : null);
      const lastUpdated = r.lastUpdated?.$date ? String(r.lastUpdated.$date) : (typeof r.lastUpdated === 'string' ? r.lastUpdated : null);

      // derive level from customParams
      let level: number = 0;
      if (Array.isArray(r.customParams)) {
        const levelParam = r.customParams.find((p: any) => String(p.name).toLowerCase() === 'level');
        if (levelParam) {
          const n = Number(levelParam.value);
          if (!Number.isNaN(n)) level = n;
        }
      }

      const doc: any = {
        wAid: r.wAid,
        allowBroadcast: r.allowBroadcast,
        allowSMS: r.allowSMS,
        channelId: r.channelId ?? null,
        channelType: r.channelType,
        contactLink: r.contactLink ?? null,
        contactLinkId: r.contactLinkId ?? null,
        contactStatus: r.contactStatus,
        created: r.created,
        ctwaFollowUpCount: r.ctwaFollowUpCount,
        ctwaFollowUpNotice: r.ctwaFollowUpNotice,
        ctwaFollowUpStatus: r.ctwaFollowUpStatus,
        currentFlowNodeId: r.currentFlowNodeId ?? null,
        customLabel: r.customLabel ?? null,
        customParams: r.customParams || [],
        deletedFromSMB: r.deletedFromSMB,
        displayId: r.displayId ?? null,
        displayName: r.displayName ?? null,
        firstName: r.firstName ?? null,
        fullName: r.fullName ?? null,
        externalId,
        igPhoneSource: r.igPhoneSource,
        importedAt,
        instagramConversationId: r.instagramConversationId ?? null,
        isDeleted: r.isDeleted,
        isInFlow: r.isInFlow,
        isInTestFlow: r.isInTestFlow,
        isSendBCLimit: r.isSendBCLimit,
        isShowCTWAFollowUpNotice: r.isShowCTWAFollowUpNotice,
        lastFlowId: r.lastFlowId ?? null,
        lastUpdated,
        messengerConversationId: r.messengerConversationId ?? null,
        messengerPageName: r.messengerPageName ?? '',
        mgPhoneSource: r.mgPhoneSource,
        operatorIds: r.operatorIds ?? null,
        optedIn: r.optedIn,
        paylinkSettings: r.paylinkSettings ?? null,
        phone: r.phone,
        photo: r.photo ?? null,
        regionCode: r.regionCode ?? null,
        segments: r.segments ?? null,
        selectedHubspotId: r.selectedHubspotId ?? null,
        source: r.source ?? null,
        tagName: r.tagName ?? null,
        teamIds: r.teamIds ?? null,
        tenantId: r.tenantId ?? null,
        waChannelPhone: r.waChannelPhone ?? null,
        level,
        city: r.city ?? null
      };

try{await importNativeWatiContact(db,session.user.id,doc);imported++;}catch(e){if(e instanceof NativeDirectoryError&&e.status===403)throw e;failed++;}}
return nativeResponseJson({imported,failed});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to import contacts'},{status:e instanceof NativeDirectoryError?e.status:500});}}
