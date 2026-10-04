import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;if(!/^[a-f0-9]{24}$/i.test(id))return nativeResponseJson({error:'Invalid service plan ID'},{status:400});
 const row=await getNativeDatabase().collection('serviceplans').doc(id).get();
 if(!row.exists||!row.get('isActive')||!row.get('showToClients'))return nativeResponseJson({error:'Service plan not found'},{status:404});
 const data=nativeDates(await hydrateNativeDocument(row.data()!));
 const plan=Object.fromEntries(['name','description','category','features','pricingTiers','isActive','showToClients','maxDiscountPercent','createdAt','updatedAt'].filter(key=>data[key]!==undefined).map(key=>[key,data[key]]));
 return nativeResponseJson({success:true,plan:{...plan,_id:id}});
 }catch{return nativeResponseJson({error:'Unable to load service plan'},{status:503});}
}
