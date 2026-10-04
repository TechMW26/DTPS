import {dashboardRelated} from '@/lib/db/repository/native-staff-dashboard';
import {hydrateBlobDocument} from '@/lib/storage/blob-document.mjs';

test('dashboard membership queries cover all IDs without duplicating work or exceeding disjunction limits',async()=>{
 const batches:string[][]=[];
 const db:any={collection:()=>({where:(_field:string,_op:string,ids:string[])=>{
  batches.push(ids);const q:any={where:()=>q,orderBy:()=>q,select:()=>q,get:async()=>({docs:ids.map(id=>({id,data:()=>({clientId:id})}))})};return q;
 }})};
 const ids=Array.from({length:205},(_,i)=>String(i));
 expect(await dashboardRelated(db,'plans','clientId',[...ids,ids[0]],['clientId'])).toHaveLength(205);
 expect(batches).toHaveLength(7);expect(Math.max(...batches.map(b=>b.length))).toBe(30);
 batches.length=0;
 expect(await dashboardRelated(db,'plans','clientId',ids,['clientId'],q=>q.where('status','in',['active','paused','completed']),10)).toHaveLength(205);
 expect(batches).toHaveLength(21);expect(Math.max(...batches.map(b=>b.length))*3).toBeLessThanOrEqual(30);
});

test('private fields hydrate concurrently with a bounded number of reads and preserve exact values',async()=>{
 let active=0,peak=0;
 const data={items:Array(9).fill(null),_nativeExternalFields:Array.from({length:9},(_,i)=>({path:['items',String(i)],encoding:'utf8',file:{value:String(i)}}))};
 const result=await hydrateBlobDocument(data,async(file:any)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return Buffer.from(file.value);});
 expect(peak).toBe(4);expect(result.items).toEqual(Array.from({length:9},(_,i)=>String(i)));expect(data.items).toEqual(Array(9).fill(null));
});

test('invalid and duplicate Blob paths fail before fetching private data',async()=>{
 const read=jest.fn();const field={path:['photo'],encoding:'utf8',file:{}};
 await expect(hydrateBlobDocument({photo:null,_nativeExternalFields:[field,field]},read)).rejects.toThrow('Duplicate');
 await expect(hydrateBlobDocument({photo:null,_nativeExternalFields:[field,{...field,path:['missing']}]},read)).rejects.toThrow('placeholder');
 expect(read).not.toHaveBeenCalled();
});
