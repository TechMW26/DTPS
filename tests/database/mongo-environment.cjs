const {TestEnvironment}=require('jest-environment-node');
const realDriver=require('mongodb');
module.exports=class MongoEnvironment extends TestEnvironment {
 async setup(){await super.setup();this.global.__DTPS_REAL_MONGODB__=realDriver;}
};
