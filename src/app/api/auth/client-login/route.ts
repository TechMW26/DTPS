import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import jwt from 'jsonwebtoken';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativePasswordLogin,recordNativeLogin} from '@/lib/db/repository/native-auth';

function secret(){const value=process.env.NEXTAUTH_SECRET;if(!value)throw new Error('Authentication secret is not configured');return value;}
async function clientProfile(id:string) {
 if(!id||id.includes('/'))return null;
 const doc=await getNativeDatabase().collection('woocommerceclients').doc(id).get(),data=doc.data();
 if(!data||(data.status&&data.status!=='active'))return null;
 return {id:doc.id,...Object.fromEntries(['name','email','phone','city','country','totalOrders','totalSpent'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]])),lastOrderDate:data.lastOrderDate?.toDate?data.lastOrderDate.toDate().toISOString():data.lastOrderDate};
}
export async function POST(request:NextRequest) {
 try {
  const {email,password}=await request.json();
  if(typeof email!=='string'||typeof password!=='string'||!email||!password)return nativeResponseJson({error:'Email and password are required'},{status:400});
  const user=await nativePasswordLogin(getNativeDatabase(),email,password,'client');
  if(!user?.isWooCommerceClient)return nativeResponseJson({error:'Invalid email or password'},{status:401});
  const client=await clientProfile(user._id);if(!client)return nativeResponseJson({error:'Invalid email or password'},{status:401});
  const token=jwt.sign({clientId:user._id,email:user.email,name:user.fullName,role:'client'},secret(),{expiresIn:'7d'});
  try{await recordNativeLogin(getNativeDatabase(),{userId:user._id,userRole:'client',userName:user.fullName,userEmail:user.email,action:'Logged In',actionType:'login',category:'auth',description:'Client logged in',ipAddress:request.headers.get('x-forwarded-for')||'',userAgent:request.headers.get('user-agent')||''});}catch{console.error('Failed to record client login');}
  return nativeResponseJson({message:'Login successful',client,token,expiresIn:'7d'});
 }catch{return nativeResponseJson({error:'Login failed'},{status:500});}
}
export async function GET(request:NextRequest) {
 const header=request.headers.get('authorization');
 if(!header?.startsWith('Bearer '))return nativeResponseJson({error:'No token provided'},{status:401});
 try {
  const decoded=jwt.verify(header.slice(7),secret()) as {role?:string;clientId?:string};
  if(decoded.role!=='client'||typeof decoded.clientId!=='string')return nativeResponseJson({error:'Invalid token type'},{status:401});
  const client=await clientProfile(decoded.clientId);if(!client)return nativeResponseJson({error:'Client not found'},{status:404});
  return nativeResponseJson({valid:true,client});
 }catch{return nativeResponseJson({error:'Invalid token'},{status:401});}
}
