import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
const version=process.env.NEXT_PUBLIC_APP_VERSION||process.env.npm_package_version||'1.0.0';
export async function GET(){
 const started=Date.now(),headers={'Cache-Control':'no-store','X-App-Version':version};
 try{
  // A server read verifies credentials and connectivity even when the sentinel does not exist.
  await getNativeDatabase().collection('_nativeHealth').doc('connectivity').get();
  return nativeResponseJson({status:'healthy',database:'connected',connectionStats:{provider:'firestore-native'},timestamp:new Date().toISOString(),responseTimeMs:Date.now()-started,version},{headers});
 }catch{return nativeResponseJson({status:'degraded',database:'disconnected',connectionStats:{provider:'firestore-native'},timestamp:new Date().toISOString(),responseTimeMs:Date.now()-started,version,error:'Database temporarily unavailable'},{status:503,headers:{...headers,'Retry-After':'5'}});}
}
