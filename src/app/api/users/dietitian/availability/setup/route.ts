import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeUserAvailability} from '@/lib/db/repository/native-user-availability';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
async function handle(write=false){try{const s=await getServerSession(authOptions);if(!s?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});if(!['dietitian','health_counselor'].includes(s.user.role))throw new NativeDirectoryError('Professional access required',403);const input=write?{availability:['monday','tuesday','wednesday','thursday','friday','saturday'].flatMap(day=>[{day,startTime:'10:00',endTime:'13:00'},{day,startTime:'14:00',endTime:'18:00'}])}:undefined;const result=await nativeUserAvailability(getNativeDatabase(),s.user.id,s.user.id,input);if(write)return nativeResponseJson({...result,message:'Default availability setup completed successfully',summary:{days:'Monday to Saturday',hours:'10:00 AM - 1:00 PM, 2:00 PM - 6:00 PM',duration:'60 minutes per consultation',bufferTime:'15 minutes between appointments'}});const a=result.availability,count=Array.isArray(a)?a.length:a.schedule?.length||0;return nativeResponseJson({needsSetup:count===0,hasAvailability:count>0,currentScheduleCount:count});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to set up availability'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=()=>handle();
export const POST=()=>handle(true);
