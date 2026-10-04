import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeStaffClientError} from './native-staff-client';
import {readWooClients,deleteWooClients,saveWooClients,readWooDatabase,migrateWooClients} from './native-staff-woocommerce';
export async function nativeWooRoute(req:NextRequest,scope:'clients'|'database'|'save'|'migrate',method:string){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase(),actor=session.user.id;let result:unknown;if(scope==='save')result=await saveWooClients(db,actor,await req.json());else if(scope==='migrate')result=await migrateWooClients(db,actor,method==='POST');else if(method==='DELETE'){const id=scope==='clients'?req.nextUrl.searchParams.get('id'):undefined;if(scope==='clients'&&!id)throw new NativeStaffClientError('Client ID required');result=await deleteWooClients(db,actor,id||undefined);}else if(scope==='database')result=await readWooDatabase(db,actor,req.nextUrl.searchParams);else result=await readWooClients(db,actor,req.nextUrl.searchParams,method==='POST'?(await req.json()).clientId:undefined);return nativeResponseJson(result);}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid WooCommerce data':'Unable to process WooCommerce data'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
