import {coalesceRead} from '@/lib/api/coalesce-read';
import {getNativeDatabase} from '@/lib/db/database';
/** Counts expose no profile fields. The caller must authorize administrative access. */
export async function getUserDirectorySummary(){return coalesceRead('native-user-directory-summary',async()=>{const db=getNativeDatabase();const [admins,dietitians,counselors,clients]=await Promise.all(['admin','dietitian','health_counselor','client'].map(role=>db.collection('users').where('role','==',role).count().get()));return {adminsCount:admins.data().count,dietitiansCount:dietitians.data().count,healthCounselorsCount:counselors.data().count,clientsCount:clients.data().count,latestClientIdNumber:(await db.collection('_nativeCounters').doc('clientIds').get()).get('seq')||0};});}
