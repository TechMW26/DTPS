import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeCatalogError,saveNativeCatalog} from '@/lib/db/repository/native-plan-catalog';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import type {Query} from 'firebase-admin/firestore';
export async function GET(request:NextRequest){try{
 const db=getNativeDatabase(),session=await getServerSession(authOptions),staff=session?.user&&['admin','dietitian'].includes(session.user.role);
 let query:Query=db.collection('subscriptionplans');
 if(!staff||request.nextUrl.searchParams.get('isActive')==='true')query=query.where('isActive','==',true);
 const category=request.nextUrl.searchParams.get('category');if(category)query=query.where('category','==',category);
 const rows=await query.orderBy('price').get();
 return nativeResponseJson({plans:rows.docs.map(row=>{const data=nativeDates(row.data());return {...Object.fromEntries(['name','description','category','features','duration','durationType','price','currency','consultationsIncluded','dietPlanIncluded','followUpsIncluded','chatSupport','videoCallsIncluded','isActive','createdAt','updatedAt'].filter(key=>data[key]!==undefined).map(key=>[key,data[key]])),_id:row.id};})});
 }catch{return nativeResponseJson({error:'Unable to load plans'},{status:503});}}
export async function POST(request:NextRequest){try{
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const db=getNativeDatabase(),actor=await db.collection('users').doc(session.user.id).get();
 if(!actor.exists||actor.get('status')==='inactive'||!['admin','dietitian'].includes(actor.get('role')))return nativeResponseJson({error:'Forbidden'},{status:403});
 const plan=await saveNativeCatalog(db,'subscriptionplans',session.user.id,await request.json());return nativeResponseJson({success:true,plan},{status:201});
 }catch(error){return nativeResponseJson({error:error instanceof NativeCatalogError?error.message:'Unable to create plan'},{status:error instanceof NativeCatalogError?error.status:error instanceof SyntaxError?400:503});}}
