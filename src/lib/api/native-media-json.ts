import type {MongoDatabase} from '@/lib/db/mongo-types';
import {nativeResponsePayload} from './native-response';
/** Compatibility for existing response boundaries; media requests perform the indexed access check. */
export async function nativeMediaJson<T>(_db:MongoDatabase,payload:T):Promise<T>{return nativeResponsePayload(payload);}
