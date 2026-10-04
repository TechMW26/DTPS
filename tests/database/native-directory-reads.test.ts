import {listNativeUsers} from '@/lib/db/repository/native-user-directory';
import {listNativeAdminClients} from '@/lib/db/repository/native-client-directory';
const clientId='a'.repeat(24),actorId='b'.repeat(24);
function fixture(){
 const data={firstName:'Example',role:'client',status:'active',createdAt:new Date('2026-01-01'),onboardingCompleted:false};
 const row={id:clientId,exists:true,data:()=>data};
 const paymentsGet=jest.fn(async()=>({docs:[],size:0}));
 const usersGet=jest.fn(async()=>({docs:[row],size:1}));
 function query(get:jest.Mock){const q:any={get,count:()=>({get:async()=>({data:()=>({count:1})})})};for(const key of ['where','orderBy','offset','limit','select'])q[key]=()=>q;return q;}
 const users=query(usersGet),payments=query(paymentsGet);
 const getAll=jest.fn(async()=>[row]);
 const db:any={getAll,collection:(name:string)=>name==='users'?{...users,doc:()=>({get:async()=>({exists:true,get:(field:string)=>field==='role'?'admin':field==='status'?'active':undefined})})}:name==='unifiedpayments'?payments:{doc:()=>({get:async()=>({get:()=>0})})}};
 return {db,getAll,paymentsGet};
}
test.each(['users','clients'])('reuses allowlisted page projections without fetching profiles twice: %s',async(kind)=>{const {db,getAll,paymentsGet}=fixture();const result:any=kind==='users'?await listNativeUsers(db,actorId,new URLSearchParams()):await listNativeAdminClients(db,new URLSearchParams());expect((result.users||result.clients)[0]._id).toBe(clientId);expect(getAll).not.toHaveBeenCalled();expect(paymentsGet).toHaveBeenCalledTimes(1);});
test.each(['users','clients'])('reuses computed filter status instead of querying payment history twice: %s',async(kind)=>{const {db,getAll,paymentsGet}=fixture();const params=new URLSearchParams('status=lead');const result:any=kind==='users'?await listNativeUsers(db,actorId,params):await listNativeAdminClients(db,params);expect((result.users||result.clients)[0].clientStatus).toBe('lead');expect(getAll).toHaveBeenCalledTimes(1);expect(paymentsGet).toHaveBeenCalledTimes(1);});
