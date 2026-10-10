/** One unsorted source pass, with explicit readTime; avoids repeated unindexed sorts/sequential scans. */
export async function streamNames(stream,group,expected){
 const names=[],seen=new Set();
 for await(const row of stream){const id=row.ref?.path;if(!id||id.split('/').at(-2)!==group||seen.has(id))throw new Error('Missing or duplicate streamed identity');seen.add(id);names.push(id);if(names.length%50000===0)console.log(JSON.stringify({inventoryStream:true,group,completedNames:names.length,expected}));}
 if(names.length!==expected)throw new Error('Streamed group count differs from fixed snapshot');return names;
}
export function fixedTimeStream(_require,db,Timestamp,readTime){
 // Public Pipeline.stream() omits readTime. The pinned SDK's raw transport preserves it.
 // Keep raw chunks: constructing 826k PipelineResult/DocumentReference objects can exceed the server deadline.
 return async function* (query){
  const tag='private-migration-export';await db.initializeIfNeeded(tag);
  const request={database:db.formattedName,structuredPipeline:query._toStructuredPipeline()._toProto(db._serializer),readTime:Timestamp.fromDate(new Date(readTime)).toProto().timestampValue};
  const prefix=db.formattedName+'/documents/',stream=await db.requestStream('executePipeline',false,request,tag);
  for await(const chunk of stream)for(const result of chunk.results||[]){const name=result.name||result.fields?.__name__?.referenceValue;if(!name?.startsWith(prefix))throw new Error('Stream source identity mismatch');yield {ref:{path:name.slice(prefix.length)}};}
 };
}
