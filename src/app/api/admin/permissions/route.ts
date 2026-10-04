import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {PermissionCategories,PermissionLabels,PermissionDescriptions} from '@/types/permissions';
import {seedNativePermissions,updateNativePermissions,nativePermissionView} from '@/lib/db/repository/native-permissions';
export async function GET(){
 try{
  const session=await getServerSession(authOptions);if(!session?.user||session.user.role!=='admin')return nativeResponseJson({error:'Unauthorized'},{status:401});
  const db=getNativeDatabase();await seedNativePermissions(db);
  const [rows,staff]=await Promise.all([db.collection('permissions').orderBy('category').orderBy('name').get(),db.collection('users').where('role','in',['dietitian','health_counselor']).where('status','==','active').select('firstName','lastName','email','role').get()]);
  const staffUsers=staff.docs.map(doc=>({...doc.data(),_id:doc.id})).sort((a:any,b:any)=>String(a.firstName||'').localeCompare(String(b.firstName||''))||String(a.lastName||'').localeCompare(String(b.lastName||'')));
  return nativeResponseJson({success:true,permissions:await nativePermissionView(db,rows.docs),staffUsers,categories:Object.keys(PermissionCategories),labels:PermissionLabels,descriptions:PermissionDescriptions});
 }catch{return nativeResponseJson({error:'Failed to fetch permissions'},{status:500});}
}
async function change(req:NextRequest,bulk:boolean){
 const session=await getServerSession(authOptions);if(!session?.user||session.user.role!=='admin')return nativeResponseJson({error:'Unauthorized'},{status:401});
 let body;try{body=await req.json();}catch{return nativeResponseJson({error:'Invalid JSON'},{status:400});}
 const updates=bulk?body?.updates:[body];if(!Array.isArray(updates)||updates.some(item=>!item||typeof item!=='object'))return nativeResponseJson({error:'Invalid updates'},{status:400});
 const db=getNativeDatabase();
 try{
  const results=await updateNativePermissions(db,updates);
  if(bulk)return nativeResponseJson({success:true,results,message:'Permissions updated successfully'});
  if(!results[0].success)return nativeResponseJson({error:'Permission not found'},{status:404});
  const [permission]=await nativePermissionView(db,[await db.collection('permissions').doc(body.permissionId).get()]);
  return nativeResponseJson({success:true,permission,message:'Permission updated successfully'});
 }catch(error){const invalid=error instanceof Error&&/Invalid|Provide/.test(error.message);return nativeResponseJson({error:invalid?error.message:'Failed to update permissions'},{status:invalid?400:500});}
}
export async function PUT(req:NextRequest){return change(req,false);}
export async function POST(req:NextRequest){return change(req,true);}
