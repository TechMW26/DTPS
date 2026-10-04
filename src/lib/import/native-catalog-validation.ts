import type {RegisteredModel,SchemaFieldInfo} from './modelRegistry';
export function validateNativeCatalogRow(model:RegisteredModel|undefined,row:Record<string,unknown>){
 const errors:Array<{field:string;message:string;value:unknown}>=[];if(!model)return [{field:'_model',message:'Unknown model',value:null}];
 const check=(field:SchemaFieldInfo,value:any)=>{const error=(message:string)=>errors.push({field:field.path,message,value});if(value===undefined||value===null||value===''){if(field.required&&field.default===undefined&&!field.defaultKind)error('Required field');return;}if(field.isArray||field.type.startsWith('Array')){if(!Array.isArray(value)){error('Expected an array');return;}if(field.nestedFields)for(const entry of value)for(const nested of field.nestedFields){const suffix=nested.path.slice(field.path.length+1);check(nested,suffix.split('.').reduce((o:any,k)=>o?.[k],entry));}else{const inner=field.type.match(/^Array<(.+)>$/)?.[1];if(inner)for(const entry of value)check({...field,type:inner,isArray:false,required:false},entry);}return;}
 if(field.nestedFields&&typeof value==='object'){for(const nested of field.nestedFields)check(nested,nested.path.slice(field.path.length+1).split('.').reduce((o:any,k)=>o?.[k],value));return;}
 if(field.type==='Number'){if(!Number.isFinite(Number(value)))error('Expected a finite number');else if(field.min!==undefined&&Number(value)<field.min||field.max!==undefined&&Number(value)>field.max)error('Number outside allowed range');}
 if(field.type==='Date'&&!Number.isFinite(new Date(value).getTime()))error('Invalid date');
 if(field.type==='ObjectId'&&!/^[a-f0-9]{24}$/i.test(String(value)))error('Expected a 24-character record ID');
 if(field.type==='Boolean'&&!['true','false','1','0'].includes(String(value).toLowerCase()))error('Expected a boolean');
 if(field.type==='String'&&typeof value!=='string')error('Expected text');if(typeof value==='string'&&field.pattern&&!new RegExp(field.pattern,field.patternFlags).test(value))error('Invalid format');
 if(field.enum&&!field.enum.includes(value))error('Value is not one of the allowed options');
 if(typeof value==='string'&&(field.minLength!==undefined&&value.length<field.minLength||field.maxLength!==undefined&&value.length>field.maxLength))error('Text length outside allowed range');};
 for(const field of model.fields){if(field.path==='_id'||model.name==='User'&&field.path==='password')continue;check(field,field.path in row?row[field.path]:field.path.split('.').reduce((o:any,k)=>o?.[k],row));}return errors;
}
