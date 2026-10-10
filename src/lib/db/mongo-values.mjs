/** Mongo-owned values. No database service SDK or network transport is loaded. */
export class Timestamp {
 constructor(seconds,nanoseconds){if(!Number.isInteger(seconds)||seconds<-62135596800||seconds>253402300799)throw new RangeError('Timestamp seconds outside supported range');if(!Number.isInteger(nanoseconds)||nanoseconds<0||nanoseconds>=1e9)throw new RangeError('Timestamp nanoseconds outside supported range');this._seconds=seconds;this._nanoseconds=nanoseconds;}
 get seconds(){return this._seconds;} get nanoseconds(){return this._nanoseconds;}
 static now(){return Timestamp.fromMillis(Date.now());}
 static fromDate(date){return Timestamp.fromMillis(date.getTime());}
 static fromMillis(milliseconds){if(!Number.isFinite(milliseconds))throw new RangeError('Invalid timestamp milliseconds');const seconds=Math.floor(milliseconds/1000);return new Timestamp(seconds,Math.floor((milliseconds-seconds*1000)*1e6));}
 toDate(){return new Date(this.seconds*1000+Math.round(this.nanoseconds/1e6));} toMillis(){return this.seconds*1000+Math.floor(this.nanoseconds/1e6);}
 isEqual(other){return !!other&&this.seconds===other.seconds&&this.nanoseconds===other.nanoseconds;}
 valueOf(){return String(this.seconds+62135596800).padStart(12,'0')+'.'+String(this.nanoseconds).padStart(9,'0');}
}
export class GeoPoint {
 constructor(latitude,longitude){if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180)throw new RangeError('Invalid geographic point');this._latitude=latitude;this._longitude=longitude;}
 get latitude(){return this._latitude;} get longitude(){return this._longitude;}
 isEqual(other){return !!other&&this.latitude===other.latitude&&this.longitude===other.longitude;}
}
export class WriteResult {constructor(writeTime){this._writeTime=writeTime;}get writeTime(){return this._writeTime;}isEqual(other){return !!other&&this.writeTime.isEqual(other.writeTime);}}
export class FieldPath {constructor(...segments){if(!segments.length||segments.some(v=>typeof v!=='string'||!v))throw new Error('FieldPath requires nonempty string segments');this.segments=Object.freeze([...segments]);}static documentId(){return new FieldPath('__name__');}isEqual(other){return other instanceof FieldPath&&JSON.stringify(this.segments)===JSON.stringify(other.segments);}}
const operators=new Set(['==','!=','<','<=','>','>=','in','not-in','array-contains','array-contains-any']);
export class Filter {constructor(field,operator,value,filters){this.field=field;this.operator=operator;this.value=value;if(filters)this.filters=filters;}static where(field,operator,value){if(!operators.has(operator))throw new Error('Unsupported query operator '+operator);if(typeof field!=='string'&&!(field instanceof FieldPath))throw new Error('Invalid query field');return new Filter(field,operator,value);}static and(...filters){if(!filters.length||filters.some(f=>!(f instanceof Filter)))throw new Error('Composite filter requires filters');return new Filter(undefined,'AND',undefined,filters);}static or(...filters){if(!filters.length||filters.some(f=>!(f instanceof Filter)))throw new Error('Composite filter requires filters');return new Filter(undefined,'OR',undefined,filters);}}
export class AggregateField {constructor(aggregateType,field){this.aggregateType=aggregateType;this._field=field;}static count(){return new AggregateField('count');}static sum(field){return new AggregateField('sum',field);}static average(field){return new AggregateField('average',field);}}
export class FieldValue {static delete(){return new DeleteTransform();}static serverTimestamp(){return new ServerTimestampTransform();}static arrayUnion(...elements){return new ArrayUnionTransform(elements);}static arrayRemove(...elements){return new ArrayRemoveTransform(elements);}static increment(operand){if(typeof operand!=='number'||!Number.isFinite(operand))throw new Error('Increment requires finite number');return new NumericIncrementTransform(operand);}}
class DeleteTransform extends FieldValue {} class ServerTimestampTransform extends FieldValue {}
class ArrayUnionTransform extends FieldValue {constructor(elements){super();this.elements=elements;}} class ArrayRemoveTransform extends FieldValue {constructor(elements){super();this.elements=elements;}} class NumericIncrementTransform extends FieldValue {constructor(operand){super();this.operand=operand;}}
