import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';

export interface NativeUploadMetadata {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  type: string;
  imageKitFileId: string;
  imageKitUrl: string;
  uploadedBy: string;
}

export const nativeUploadId = (pathname: string) => createHash('sha256').update('blob\0'+pathname).digest('hex').slice(0,24);

/** Bind a direct-upload pathname to one account before issuing a Blob token. */
export async function reserveNativeUpload(db: Firestore, pathname: string, userId: string, fingerprint: string) {
  const ref=db.collection('_nativeUploadReservations').doc(createHash('sha256').update(pathname).digest('hex'));
  await db.runTransaction(async tx=>{
    const row=await tx.get(ref);
    if(row.exists){
      if(row.get('userId')!==userId || row.get('fingerprint')!==fingerprint) throw new Error('Upload identity conflict');
      return;
    }
    tx.create(ref,{pathname,userId,fingerprint,createdAt:new Date()});
  });
}

/** A successful response requires durable metadata; retries cannot change ownership. */
export async function saveNativeUpload(db: Firestore, id: string, metadata: NativeUploadMetadata) {
  if(!/^[a-f0-9]{24}$/.test(id) || !metadata.uploadedBy || !Number.isFinite(metadata.size) || metadata.size<=0) throw new Error('Invalid file metadata');
  const ref=db.collection('files').doc(id);
  await db.runTransaction(async tx=>{
    const row=await tx.get(ref);
    if(row.exists){
      if(row.get('uploadedBy')!==metadata.uploadedBy || row.get('imageKitFileId')!==metadata.imageKitFileId || row.get('deletedAt')) throw new Error('Upload identity conflict');
      if(row.get('imageKitUrl')!==metadata.imageKitUrl || row.get('size')!==metadata.size || row.get('mimeType')!==metadata.mimeType) throw new Error('Upload content conflict');
      return;
    }
    const now=new Date();
    tx.create(ref,{...metadata,_id:id,uploadedAt:now,createdAt:now,updatedAt:now,storage:'vercel-blob'});
  });
}

/** Retain the physical object until reference-aware garbage collection can prove it is unused. */
export async function deleteNativeUpload(db: Firestore, id: string, userId: string) {
  if(!/^[a-f0-9]{24}$/.test(id)) return false;
  return db.runTransaction(async tx=>{
    const ref=db.collection('files').doc(id),row=await tx.get(ref);
    if(!row.exists || row.get('uploadedBy')!==userId) return false;
    if(!row.get('deletedAt')) tx.update(ref,{deletedAt:new Date(),updatedAt:new Date()});
    return true;
  });
}
