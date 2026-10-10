import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeStaffClientError} from './native-staff-client';
import {listStaffTemplates,readStaffTemplate,mutateStaffTemplate,type NativeTemplateCollection} from './native-staff-templates';
import {nativeMediaJson} from '@/lib/api/native-media-json';
type Context={params:Promise<{id:string}>};
export function nativeStaffTemplateHandlers(collection:NativeTemplateCollection){
 async function run(req:NextRequest,context?:Context,operation:'list'|'get'|'save'|'delete'|'restore'='list'){
  try{const session=await getServerSession(authOptions);if(session?.user&&!session.user.id)throw new NativeStaffClientError('Authentication required',401);const actor=session?.user?.id?{id:session.user.id,role:session.user.role}:null,db=getNativeDatabase(),id=context?(await context.params).id:undefined;
   if(operation==='list')return nativeResponseJson(await nativeMediaJson(db,await listStaffTemplates(db,collection,actor,req.nextUrl.searchParams)));
   if(operation==='get')return nativeResponseJson({success:true,template:await nativeMediaJson(db,await readStaffTemplate(db,collection,id!,actor))});
   if(!actor)throw new NativeStaffClientError('Authentication required',401);
   const template=await mutateStaffTemplate(db,collection,actor.id,operation==='save'?await req.json():{},id,operation,collection==='mealplantemplates'&&req.method==='PATCH');
   return nativeResponseJson({success:true,template:await nativeMediaJson(db,template),message:operation==='delete'?'Template archived successfully':operation==='restore'?'Template restored successfully':'Template saved successfully'},{status:operation==='save'&&!id?201:200});
  }catch(e){return nativeResponseJson({success:false,error:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid template fields':'Unable to process template'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}
 }
 return {list:(req:NextRequest)=>run(req),create:(req:NextRequest)=>run(req,undefined,'save'),GET:(req:NextRequest,ctx:Context)=>run(req,ctx,'get'),PUT:(req:NextRequest,ctx:Context)=>run(req,ctx,'save'),PATCH:(req:NextRequest,ctx:Context)=>run(req,ctx,'save'),DELETE:(req:NextRequest,ctx:Context)=>run(req,ctx,'delete'),restore:(req:NextRequest,ctx:Context)=>run(req,ctx,'restore')};
}
