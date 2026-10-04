/** Existing event API backed by durable native Firestore events, hosted through Vercel SSE. */
import { after } from 'next/server';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { publishNativeEvent } from './native-events';

class SocketManager {
  private static instance: SocketManager;
  static getInstance() { return this.instance ||= new SocketManager(); }
  private publish(targets: string[], event: string, data: unknown): Promise<void> {
    const pending = publishNativeEvent(getNativeDatabase(), targets, event, data).then(() => undefined);
    // Preserve fire-and-forget callers while keeping the Vercel request alive until durable commit.
    try { after(async () => { await pending; }); } catch { /* CLI/tests await the returned promise. */ }
    void pending.catch(() => console.error('[Realtime] Event publication failed'));
    return pending;
  }
  sendToUser(userId: string, event: string, data: unknown) { return this.publish([`user:${userId}`], event, data); }
  async sendToUsers(userIds: string[], event: string, data: unknown) {
    const ids = [...new Set(userIds)];
    const pending=Promise.all(Array.from({length:Math.ceil(ids.length/100)},(_,index)=>this.publish(ids.slice(index*100,index*100+100).map(id=>`user:${id}`),event,data))).then(()=>undefined);
    try { after(async()=>{await pending;}); } catch {}
    await pending;
  }
  broadcast(event: string, data: unknown) { return this.publish(['all'], event, data); }
  broadcastToRole(role: string, event: string, data: unknown) { return this.publish([`role:${role}`], event, data); }
  broadcastClientUpdate(event: string, data: unknown) { return this.broadcastToRole('admin',event,data); }

}
export const socketManager = SocketManager.getInstance();
export { SocketManager };
