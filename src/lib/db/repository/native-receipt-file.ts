import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {lookupNativeFile,nativeMediaParentAccess,type MediaActor} from './native-media';
export async function lookupNativeReceipt(db:Firestore,id:string,actor:MediaActor){
 if(!/^[a-f0-9]{24}$/.test(id))return null;
 const [account,receipt]=await db.getAll(db.collection('users').doc(actor.id),db.collection('receipts.files').doc(id));
 if(!account.exists||['inactive','suspended','deleted'].includes(account.get('status'))||account.get('isDeleted')||account.get('deletedAt'))return null;
 const current={id:actor.id,role:account.get('role')};
 if(!receipt.exists)return lookupNativeFile(db,id,current);
 if(receipt.get('deletedAt'))return null;
 const client=receipt.get('metadata.clientId');
 if(!await nativeMediaParentAccess(db,'unifiedpayments',{client},current))return null;
 const asset=await db.collection('_mediaAssets').doc(createHash('sha256').update('receipts.files\0'+id).digest('hex')).get();
 return asset.exists?{...asset.data(),mimeType:receipt.get('contentType'),originalName:receipt.get('metadata.originalName')||receipt.get('filename')}:null;
}
