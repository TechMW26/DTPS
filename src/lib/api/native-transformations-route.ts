import {randomBytes,randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {type DocumentData,type Query} from 'firebase-admin/firestore';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {uploadToBlob} from '@/lib/storage/blob-storage';
import {compressImageServer} from '@/lib/imageCompressionServer';
import {NativeAlertError} from '@/lib/db/repository/native-system-alerts';
import {nativeJson} from '@/lib/db/repository/native-history';
import {nativeMediaJson} from './native-media-json';
import {z} from 'zod';
const schema=z.object({title:z.string().trim().min(1).max(200),description:z.string().max(500).optional(),clientName:z.string().max(100).optional(),durationWeeks:z.number().nonnegative().optional().nullable(),weightLoss:z.number().nonnegative().optional().nullable(),isActive:z.boolean().optional(),displayOrder:z.number().int().optional()});
export async function nativeTransformationsRoute(request:NextRequest,context?:{params?:Promise<{id?:string}>}){try{
 const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
 const db=getNativeDatabase(),actorRef=db.collection('users').doc(session.user.id),actor=await actorRef.get();if(!actor.exists||['inactive','deleted'].includes(actor.get('status')))throw new NativeAlertError('Forbidden',403);
 const admin=actor.get('role')==='admin',id=(await context?.params)?.id;if(id&&!/^[a-f0-9]{24}$/.test(id))throw new NativeAlertError('Invalid transformation ID',400);
 const ref=db.collection('transformations').doc(id||randomBytes(12).toString('hex'));
 const present=id?await ref.get():null;if(id&&!present?.exists)throw new NativeAlertError('Transformation not found',404);
 const view=async(row:FirebaseFirestore.DocumentSnapshot)=>{const data=await hydrateNativeDocument(row.data()!);delete data._nativeExternalFields;delete data._nativeSource;return {...data,_id:row.id};};
 if(request.method==='GET'){
  if(present){if(!admin&&!present.get('isActive'))throw new NativeAlertError('Transformation not found',404);return NextResponse.json(await nativeMediaJson(db,{transformation:nativeJson(await view(present))}));}
  let query:Query=db.collection('transformations');if(!admin||request.nextUrl.searchParams.get('showInactive')!=='true')query=query.where('isActive','==',true);
  const rows=await query.orderBy('displayOrder','asc').orderBy('createdAt','desc').get();return NextResponse.json(await nativeMediaJson(db,{transformations:nativeJson(await Promise.all(rows.docs.map(view)))}));
 }
 if(!admin)throw new NativeAlertError('Forbidden',403);
 const remove=request.method==='DELETE';let patch:DocumentData={};
 if(!remove){
  const form=await request.formData(),raw:DocumentData={};for(const key of ['title','description','clientName'])if(form.has(key))raw[key]=form.get(key);
  for(const key of ['durationWeeks','weightLoss','displayOrder'])if(form.has(key))raw[key]=form.get(key)===''?key==='displayOrder'?0:null:Number(form.get(key));
  if(form.has('isActive'))raw.isActive=form.get('isActive')==='true';patch=(id?schema.partial():schema).parse(raw);
  for(const field of ['beforeImage','afterImage']){const file=form.get(field);if(file instanceof File&&file.size){if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)||file.size>10*1024*1024)throw new NativeAlertError('Use a supported image under 10 MB',400);const buffer=await compressImageServer(Buffer.from(await file.arrayBuffer()),{quality:85,maxWidth:1200,maxHeight:1200,format:'jpeg'});const media=await uploadToBlob(buffer,{type:'transformation',filename:`${ref.id}_${field}_${randomUUID()}.jpg`,contentType:'image/jpeg',compress:false});if(!media)throw new NativeAlertError('Media service unavailable',503);patch[field]=media.url;patch[field+'FileId']=media.pathname;}else if(!id)throw new NativeAlertError('Before and after images are required',400);}
 }
 await db.runTransaction(async tx=>{const [currentActor,current]=await tx.getAll(actorRef,ref);if(currentActor.get('role')!=='admin'||['inactive','deleted'].includes(currentActor.get('status')))throw new NativeAlertError('Forbidden',403);if(id&&!current.exists)throw new NativeAlertError('Transformation not found',404);const now=new Date();if(remove){tx.set(db.collection('_nativeDeletedContent').doc('transformations-'+ref.id),{...current.data(),deletedAt:now,deletedBy:session.user.id});tx.delete(ref);}else if(current.exists)tx.update(ref,await prepareNativePatch(current.data()!,{...patch,updatedAt:now}));else tx.create(ref,await prepareNativeDocument({_id:ref.id,uuid:randomUUID(),isActive:true,displayOrder:0,...patch,createdBy:session.user.id,createdAt:now,updatedAt:now}));});
 return NextResponse.json(await nativeMediaJson(db,remove?{success:true}:{success:true,transformation:nativeJson(await view(await ref.get()))}),{status:!id?201:200});
 }catch(e){return NextResponse.json({error:e instanceof NativeAlertError?e.message:e instanceof z.ZodError?'Invalid transformation':'Transformation operation failed'},{status:e instanceof NativeAlertError?e.status:e instanceof z.ZodError?400:503});}}
