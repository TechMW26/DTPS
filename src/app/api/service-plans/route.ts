import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeServiceCatalog} from '@/lib/db/repository/native-client-services';
export async function GET(){try{return nativeResponseJson({success:true,plans:await nativeServiceCatalog(getNativeDatabase())});}catch{return nativeResponseJson({error:'Unable to load service plans'},{status:503});}}
