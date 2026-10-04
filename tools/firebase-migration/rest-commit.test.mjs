import test from 'node:test';import assert from 'node:assert/strict';
import {restValue} from './rest-commit.mjs';
test('REST import preserves native numeric, binary, date and container values',()=>{
 assert.deepEqual(restValue({n:7,f:1.25,date:new Date('2026-10-03T00:00:00Z'),bytes:Buffer.from([0,255]),items:[null,false],empty:{}}),{mapValue:{fields:{n:{integerValue:'7'},f:{doubleValue:1.25},date:{timestampValue:'2026-10-03T00:00:00.000Z'},bytes:{bytesValue:'AP8='},items:{arrayValue:{values:[{nullValue:null},{booleanValue:false}]}},empty:{mapValue:{fields:{}}}}}});
 assert.deepEqual(restValue(NaN),{doubleValue:'NaN'});assert.deepEqual(restValue(Infinity),{doubleValue:'Infinity'});assert.throws(()=>restValue(undefined),/Unsupported/);
});
