// Never allow the database integration suite to contact a live provider.
const crypto=require('node:crypto');
if(process.env.DTPS_MONGODB_LOCAL_TEST!=='true'||!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(process.env.MONGODB_URI||''))throw new Error('Mongo integration tests require an isolated loopback replica set');
const testPath=expect.getState().testPath||'';
process.env.MONGODB_DATABASE='dtps_test_'+crypto.createHash('sha256').update(testPath).digest('hex').slice(0,16);
process.env.DATABASE_PROVIDER='mongodb';
process.env.REDIS_CACHE_ENABLED='false';
process.env.DTPS_NATIVE_PREVIEW='true';
// The real driver is initialized by the Node environment outside Jest's VM.
jest.mock('mongodb',()=>global.__DTPS_REAL_MONGODB__);
