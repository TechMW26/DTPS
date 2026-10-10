import {createHash} from 'node:crypto';
import type {MongoDatabase} from '@/lib/db/mongo-types';
import {canSendNativeMessage,NativeMessageError} from './native-messages';
export async function authorizeNativeSignal(db:MongoDatabase,actorId:string,peerId:string,callId:string,event:string){
 if(!/^[a-f0-9]{24}$/.test(actorId)||!/^[a-f0-9]{24}$/.test(peerId)||!/^[a-zA-Z0-9._:-]{1,150}$/.test(callId)||actorId===peerId)throw new NativeMessageError('Invalid call participants',400);
 const ref=db.collection('_nativeCalls').doc(createHash('sha256').update(callId).digest('hex'));
 return db.runTransaction(async tx=>{
  const [actor,peer,call]=await tx.getAll(db.collection('users').doc(actorId),db.collection('users').doc(peerId),ref);
  if(!actor.exists||!peer.exists||actor.get('status')==='inactive'||peer.get('status')==='inactive')throw new NativeMessageError('Call participant unavailable',403);
  const now=new Date();
  if(event==='incoming_call'){
   if(!canSendNativeMessage(actor.data()!,peer.data()!,actorId,peerId))throw new NativeMessageError('You cannot call this user',403);
   if(call.exists){if(call.get('callerId')!==actorId||call.get('receiverId')!==peerId||call.get('status')!=='ringing'||call.get('expiresAt').toMillis()<now.getTime())throw new NativeMessageError('Call identity conflict',409);return;}
   tx.create(ref,{callId,callerId:actorId,receiverId:peerId,status:'ringing',createdAt:now,expiresAt:new Date(now.getTime()+120000)});return;
  }
  if(!call.exists||call.get('expiresAt').toMillis()<now.getTime()||![call.get('callerId'),call.get('receiverId')].includes(actorId)||![call.get('callerId'),call.get('receiverId')].includes(peerId))throw new NativeMessageError('Unknown or expired call',403);
  if(['ended','rejected','missed'].includes(call.get('status')))throw new NativeMessageError('Call has ended',409);
  if(['call_accepted','call_rejected'].includes(event)&&call.get('receiverId')!==actorId)throw new NativeMessageError('Only the invited participant can answer',403);
  if(event==='missed_call'&&call.get('callerId')!==actorId)throw new NativeMessageError('Invalid missed-call sender',403);
  const status=event==='call_accepted'?'active':event==='call_rejected'?'rejected':event==='call_ended'?'ended':event==='missed_call'?'missed':call.get('status');
  tx.update(ref,{status,updatedAt:now,expiresAt:new Date(now.getTime()+(status==='active'?2*60*60_000:120000))});
 });
}
