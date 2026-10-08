import {createPrivateBlobArchive} from './private-blob.mjs';

export interface NativeStoredFile {
  provider: 'vercel-blob';
  storeId: string;
  pathname: string;
  url: string;
  sha256: string;
  size: number;
  contentType: string;
}

function archive() {
  const deployed = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
  if (deployed && process.env.FIRESTORE_NATIVE_PRODUCTION_ENABLED !== 'true') throw new Error('Native Blob production cutover has not been enabled');
  return createPrivateBlobArchive({
    cacheReads:true,
    storeId:process.env.NATIVE_BLOB_STORE_ID || (!deployed ? process.env.MIGRATION_BLOB_STORE_ID : undefined),
    token:process.env.NATIVE_BLOB_READ_WRITE_TOKEN || (!deployed ? process.env.MIGRATION_BLOB_READ_WRITE_TOKEN : undefined),
    oidcToken:process.env.NATIVE_BLOB_OIDC_TOKEN || (!deployed ? process.env.MIGRATION_BLOB_OIDC_TOKEN : undefined),
  });
}

export async function storeNativeFile(bytes: Buffer,contentType: string): Promise<NativeStoredFile> {
  return await archive().store(bytes,contentType) as NativeStoredFile;
}
export async function readNativeFile(ref: NativeStoredFile): Promise<Buffer> {
  return archive().read(ref);
}
