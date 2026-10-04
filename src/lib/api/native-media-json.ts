import type {Firestore} from 'firebase-admin/firestore';
import {nativeResponsePayload} from './native-response';
/** Compatibility for existing response boundaries; media requests perform the indexed access check. */
export async function nativeMediaJson<T>(_db:Firestore,payload:T):Promise<T>{return nativeResponsePayload(payload);}
