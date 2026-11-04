import {createHash} from 'node:crypto';
import type * as MongoTypes from '@/lib/db/mongo-types';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';

/**
 * Phone/email "locks" stop two accounts from using the same contact.
 * When an account is deleted its locks must go too, or the number stays blocked.
 * Read the locks before any write in the transaction, then release them after deleting the user.
 */
export async function readNativeContactLocks(db:MongoDatabase,tx:MongoTypes.Transaction,data:DocumentData|undefined){
 const refs=(['email','phone'] as const).filter(k=>typeof data?.[k]==='string'&&data[k]).map(k=>db.collection('_nativeUserKeys').doc(createHash('sha256').update(k+'\0'+data![k]).digest('hex')));
 return refs.length?tx.getAll(...refs):[];
}
export function releaseNativeContactLocks(tx:MongoTypes.Transaction,locks:MongoTypes.DocumentSnapshot[],userId:string){
 for(const lock of locks)if(lock.exists&&lock.get('userId')===userId)tx.delete(lock.ref);
}
