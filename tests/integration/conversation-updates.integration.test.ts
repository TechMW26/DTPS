import {applyConversationMessage} from '@/lib/chat/conversation-updates';
const rows=()=>[{user:{_id:'other'},lastMessage:{_id:'old1',createdAt:'2026-10-09T10:00:00Z'},unreadCount:0},{user:{_id:'client'},lastMessage:{_id:'old2',createdAt:'2026-10-08T10:00:00Z'},unreadCount:0}];
const incoming={_id:'new',sender:{_id:'client'},receiver:{_id:'staff'},createdAt:'2026-10-09T11:00:00Z'};
it('moves new incoming messages to the top and counts a replay only once',()=>{
 const result=applyConversationMessage(rows(),incoming,'staff',null);
 expect(result[0].user._id).toBe('client');expect(result[0].unreadCount).toBe(1);
 expect(applyConversationMessage(result,incoming,'staff',null)[0].unreadCount).toBe(1);
});
it('does not count own sends or an open conversation as unread',()=>{
 expect(applyConversationMessage(rows(),incoming,'staff','client')[0].unreadCount).toBe(0);
 expect(applyConversationMessage(rows(),{...incoming,sender:'staff',receiver:'client'},'staff',null)[0].unreadCount).toBe(0);
});
it('ignores older and unrelated messages',()=>{
 const current=applyConversationMessage(rows(),incoming,'staff',null);
 expect(applyConversationMessage(current,{...incoming,_id:'late',createdAt:'2026-10-08T00:00:00Z'},'staff',null)).toEqual(current);
 expect(applyConversationMessage(current,{...incoming,receiver:'stranger'},'staff',null)).toEqual(current);
});
