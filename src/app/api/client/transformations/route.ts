import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeTransformations} from '@/lib/db/repository/native-content';
export async function GET(){try{return nativeResponseJson({transformations:await nativeTransformations(getNativeDatabase())});}catch{return nativeResponseJson({error:'Failed to fetch transformations'},{status:500});}}
