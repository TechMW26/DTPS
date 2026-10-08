/** One same-origin authenticated Firestore-backed event stream per browser tab. */
import { SOCKET_EVENTS } from './socket-events';
type EventCallback = (data: any) => void;
class SocketClient {
  private static instance: SocketClient;
  private source: EventSource | null = null;
  private listeners = new Map<string, Set<EventCallback>>();
  private seen = new Set<string>();
  private cursor = '';
  private _connected = false;
  private _down = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private requested = false;
  private lifecycleBound = false;
  private suspended = false;
  private resyncOnConnect = false;
  private hideGraceTimer: ReturnType<typeof setTimeout> | null = null;

  private canStream() {
    return (typeof document === 'undefined' || document.visibilityState !== 'hidden') &&
      (typeof navigator === 'undefined' || navigator.onLine !== false);
  }
  private suspend = () => {
    if (!this.requested) return;
    if (this.hideGraceTimer) clearTimeout(this.hideGraceTimer);
    this.hideGraceTimer = null;
    const wasOpen = !!this.source || this._connected;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    // Keep the replay cursor and subscriptions, unlike an explicit sign-out.
    const source = this.source; this.source = null; source?.close();
    this._connected = false; this.suspended = true;
    if (wasOpen) this.deliver('disconnect', {});
  };
  private resume = () => {
    if (!this.requested) return;
    if (!this.canStream()) {
      // Avoid reconnecting on quick tab switches. Offline/pagehide still stop
      // immediately; an initially hidden tab never opens a stream at all.
      if (typeof navigator !== 'undefined' && navigator.onLine === false || !this.source) this.suspend();
      else if (!this.hideGraceTimer) this.hideGraceTimer = setTimeout(this.suspend, 10_000);
      return;
    }
    if (this.hideGraceTimer) clearTimeout(this.hideGraceTimer);
    this.hideGraceTimer = null;
    if (this.suspended) {
      this.resyncOnConnect = true;
      this.failures = 0;
      this.suspended = false;
    }
    this.connect();
  };
  private bindLifecycle() {
    if (this.lifecycleBound || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.lifecycleBound = true;
    document.addEventListener('visibilitychange', this.resume);
    window.addEventListener('offline', this.suspend);
    window.addEventListener('online', this.resume);
    window.addEventListener('pagehide', this.suspend);
    window.addEventListener('pageshow', this.resume);
  }
  private unbindLifecycle() {
    if (!this.lifecycleBound) return;
    this.lifecycleBound = false;
    document.removeEventListener('visibilitychange', this.resume);
    window.removeEventListener('offline', this.suspend);
    window.removeEventListener('online', this.resume);
    window.removeEventListener('pagehide', this.suspend);
    window.removeEventListener('pageshow', this.resume);
  }
  static getInstance() { return this.instance ||= new SocketClient(); }
  get connected() { return this._connected; }
  get isDown() { return this._down; }
  getSocket() { return this.source; }
  getReconnectPolicy() { return { initialDelay:1000,maxDelay:30000,maxRetries:15,multiplier:1.5 }; }
  connect(): EventSource | null {
    this.requested = true;
    this.bindLifecycle();
    if (!this.canStream()) { this.suspend(); return null; }
    if (this.source || typeof EventSource === 'undefined') return this.source;
    if (this.retryTimer) { clearTimeout(this.retryTimer);this.retryTimer=null; }
    const source = new EventSource(`/api/realtime/events${this.cursor ? `?cursor=${encodeURIComponent(this.cursor)}` : ''}`);
    this.source=source;
    source.onmessage=event=>{
      if(this.source!==source)return;
      if(event.lastEventId){
        this.cursor=event.lastEventId;
        if(this.seen.has(event.lastEventId))return;
        this.seen.add(event.lastEventId);
        if(this.seen.size>2000)this.seen.delete(this.seen.values().next().value!);
      }
      try {
        const payload=JSON.parse(event.data);
        if(payload.event==='connected'){
          // The server only replays a bounded history. Refresh subscribers after
          // a hidden/offline interval so older changes are not silently missed.
          const recovered=this._down||this.resyncOnConnect;
          this.resyncOnConnect=false;
          this._connected=true;this._down=false;this.failures=0;
          this.deliver('connect',payload.data);
          if(recovered)this.deliver(SOCKET_EVENTS.SOCKET_RECOVERED,{});
        }
        this.deliver(payload.event,payload.data);
      } catch { /* Ignore malformed transport frames. */ }
    };
    source.onerror=()=>{
      if(this.source!==source)return;
      this._connected=false;
      this.deliver('disconnect',{});
      // Close automatic retries so rejected authentication cannot produce a tight retry loop.
      source.close();this.source=null;
      this.failures++;
      if(this.failures>=15){this._down=true;this.deliver(SOCKET_EVENTS.SOCKET_DOWN,{});return;}
      this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.connect();},Math.min(30000,1000*Math.pow(1.5,this.failures-1)));
    };
    return source;
  }
  disconnect() {
    this.requested=false;this.unbindLifecycle();this.suspended=false;this.resyncOnConnect=false;
    if(this.hideGraceTimer)clearTimeout(this.hideGraceTimer);this.hideGraceTimer=null;
    if(this.retryTimer)clearTimeout(this.retryTimer);this.retryTimer=null;
    this.source?.close();this.source=null;this._connected=false;
    this.cursor='';this.seen.clear();this.failures=0;
    this.deliver('disconnect',{});
  }
  forceReconnect(){this.disconnect();this._down=false;this.connect();}
  on(event:string,callback:EventCallback){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event)!.add(callback);return()=>this.off(event,callback);}
  off(event:string,callback:EventCallback){this.listeners.get(event)?.delete(callback);}
  emit(event:string,data?:unknown){
    if(event!==SOCKET_EVENTS.SEND_TYPING)return;
    void fetch('/api/realtime/typing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).catch(()=>{});
  }
  private deliver(event:string,data:unknown){for(const callback of this.listeners.get(event)||[])try{callback(data);}catch{ /* A consumer must not break other subscribers. */ }}
}
export const socketClient=SocketClient.getInstance();
export {SocketClient};
