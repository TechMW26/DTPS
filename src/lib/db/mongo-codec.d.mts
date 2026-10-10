export function typeKey(path:string[]):string;
export function encodeMongoData(input:unknown):{data:any;types:Record<string,any>};
export function decodeMongoData(data:any,types?:Record<string,any>,reference?:(path:string)=>any):any;
