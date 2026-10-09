// Apply realtime events immediately without counting retries or our own sends as unread.
export function applyConversationMessage<T extends {user:{_id:string};lastMessage:any;unreadCount:number}>(rows:T[],message:any,userId:string,openPeer:string|null):T[]{
 const sender=typeof message.sender==='string'?message.sender:message.sender?._id;
 const receiver=typeof message.receiver==='string'?message.receiver:message.receiver?._id;
 if(!message._id||![sender,receiver].includes(userId))return rows;
 const peer=sender===userId?receiver:sender;
 return rows.map(row=>{
  if(row.user._id!==peer||row.lastMessage?._id===message._id)return row;
  if(new Date(row.lastMessage?.createdAt||0).getTime()>new Date(message.createdAt).getTime())return row;
  return {...row,lastMessage:message,unreadCount:sender!==userId&&peer!==openPeer?row.unreadCount+1:peer===openPeer?0:row.unreadCount};
 }).sort((a,b)=>new Date(b.lastMessage?.createdAt||0).getTime()-new Date(a.lastMessage?.createdAt||0).getTime());
}
