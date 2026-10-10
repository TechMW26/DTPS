import { nativeDatabaseSettings } from '@/lib/db/database';
const local={MONGODB_URI:'mongodb://127.0.0.1:27017/test',MONGODB_DATABASE:'dtps',DATABASE_PROVIDER:'mongodb'};
it('requires dedicated MongoDB configuration',()=>{expect(nativeDatabaseSettings(local)).toEqual({databaseId:'dtps',provider:'mongodb'});expect(()=>nativeDatabaseSettings({})).toThrow();expect(()=>nativeDatabaseSettings({...local,DATABASE_PROVIDER:'firestore-native'})).toThrow();});
it('requires explicit verified production cutover',()=>{expect(()=>nativeDatabaseSettings({...local,VERCEL:'1'})).toThrow();expect(nativeDatabaseSettings({...local,VERCEL:'1',MONGODB_PRODUCTION_ENABLED:'true'}).provider).toBe('mongodb');});
it.each(['bad/name','bad.name','bad$name','bad name'])('rejects invalid database names: %s',MONGODB_DATABASE=>{expect(()=>nativeDatabaseSettings({...local,MONGODB_DATABASE})).toThrow();});
