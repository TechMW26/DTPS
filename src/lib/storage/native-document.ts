import {createHash} from 'node:crypto';
import {readNativeFile,storeNativeFile} from './migration-blob-storage';
import {prepareBlobDocument,hydrateBlobDocument} from './blob-document.mjs';

export const prepareNativeDocument = (source: Record<string,unknown>) => prepareBlobDocument(source,storeNativeFile);
export const hydrateNativeDocument = (source: Record<string,unknown>) => hydrateBlobDocument(source,readNativeFile);

/** Restore only proxies already represented by the same source field; never grant a new media reference. */
export function restoreNativeMediaRoundTrip(current:unknown,incoming:unknown):any {
  if(typeof incoming==='string'&&typeof current==='string') {
    const originals=new Map<string,string>();
    for(const raw of current.match(/https?:\/\/(?:ik\.imagekit\.io\/|dtps\.tech\/uploads\/)[^\s<>"'`]+/gi)||[]) {
      try {originals.set(createHash('sha256').update(new URL(raw.replace(/&amp;/g,'&')).href).digest('hex'),raw);}catch{}
    }
    return incoming.replace(/\/api\/media\/([a-f0-9]{64})(?![a-f0-9])/g,(proxy,hash)=>originals.get(hash)||proxy);
  }
  if(Array.isArray(incoming))return incoming.map((value,index)=>restoreNativeMediaRoundTrip(Array.isArray(current)?current[index]:undefined,value));
  if(incoming&&typeof incoming==='object'&&(Object.getPrototypeOf(incoming)===Object.prototype||Object.getPrototypeOf(incoming)===null))return Object.fromEntries(Object.entries(incoming).map(([key,value])=>[key,restoreNativeMediaRoundTrip(current&&typeof current==='object'?(current as Record<string,unknown>)[key]:undefined,value)]));
  return incoming;
}

/** Replace external-field mappings together with the fields they describe. */
export async function prepareNativePatch(current: Record<string,any>, patch: Record<string,unknown>) {
  if (Object.keys(patch).some(key=>key.includes('.'))) throw new Error('Native patches require top-level field replacements');
  const containsProxy=JSON.stringify(patch).includes('/api/media/');
  let source=current;
  if(containsProxy && (current._nativeExternalFields||[]).some((ref:any)=>Object.hasOwn(patch,ref.path?.[0]))) {
    const relevant=(current._nativeExternalFields||[]).filter((ref:any)=>Object.hasOwn(patch,ref.path?.[0]));
    source=await hydrateNativeDocument({...current,_nativeExternalFields:relevant});
  }
  const prepared = await prepareNativeDocument(containsProxy?restoreNativeMediaRoundTrip(source,patch):patch);
  const changed = Object.keys(patch).map(key => key.split('.'));
  const retained = (current._nativeExternalFields || []).filter((ref:any) =>
    !changed.some(path => path.every((part,index) => ref.path?.[index] === part)));
  const references = [...retained, ...(prepared._nativeExternalFields || [])];
  return {...prepared, ...((current._nativeExternalFields || references.length) ? {_nativeExternalFields:references} : {})};
}
