#!/usr/bin/env python3
"""Private local staging only: full typed REST payloads stay compressed and paths survive orphan parents."""
import sys,json,sqlite3,gzip,zlib,os,hashlib

def emit(value): print(json.dumps(value,separators=(',',':')),flush=True)
def connect(filename):
 os.umask(0o077); db=sqlite3.connect(filename);db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA synchronous=FULL');db.execute('PRAGMA cache_size=-32768');return db

def build(archive,filename,allow_incomplete=False):
 manifest=json.load(open(os.path.join(archive,'manifest.json')))
 if not manifest.get('complete') and not allow_incomplete: raise Exception('Complete baseline archive required')
 if allow_incomplete and manifest.get('complete'): raise Exception('Partial baseline bootstrap requires an incomplete manifest')
 for entry in manifest['files']:
  h=hashlib.sha256()
  with open(os.path.join(archive,entry['file']),'rb') as stream:
   for block in iter(lambda:stream.read(1048576),b''):h.update(block)
  if h.hexdigest()!=entry['sha256']:raise Exception('Baseline shard checksum mismatch')
 if os.path.exists(filename):
  db=connect(filename)
  try:
   info=json.loads(db.execute("SELECT value FROM info WHERE key='baseline'").fetchone()[0])
   if info['readTime']==manifest['readTime'] and info['project']==manifest['project'] and info['database']==manifest['database'] and info.get('files')==manifest['files'] and info['complete'] and bool(info.get('partialSource'))==allow_incomplete: emit(info);return
  except (sqlite3.Error,TypeError): pass
  finally: db.close()
  os.unlink(filename)
 db=connect(filename);db.execute('CREATE TABLE docs(path TEXT PRIMARY KEY, groupId TEXT, createTime TEXT, updateTime TEXT, payload BLOB, seen INTEGER DEFAULT 0, changed INTEGER DEFAULT 0)');db.execute('CREATE TABLE info(key TEXT PRIMARY KEY,value TEXT)');count=0
 prefix='projects/'+manifest['project']+'/databases/'+manifest['database']+'/documents/'
 for file in manifest['files']:
  for raw in gzip.open(os.path.join(archive,file['file']),'rb'):
   doc=json.loads(raw);name=doc['name']
   if not name.startswith(prefix):raise Exception('Baseline source mismatch')
   p=name[len(prefix):];db.execute('INSERT INTO docs(path,groupId,createTime,updateTime,payload) VALUES(?,?,?,?,?)',(p,p.split('/')[-2],doc['createTime'],doc['updateTime'],zlib.compress(raw,1)));count+=1
   if count%10000==0:db.commit()
 if count!=manifest['documents']:raise Exception('Baseline count mismatch')
 db.execute('CREATE INDEX group_lookup ON docs(groupId)');info={'complete':True,'partialSource':allow_incomplete,'project':manifest['project'],'database':manifest['database'],'readTime':manifest['readTime'],'documents':count,'files':manifest['files']};db.execute('INSERT INTO info VALUES(?,?)',('baseline',json.dumps(info)));db.commit();db.execute('PRAGMA wal_checkpoint(TRUNCATE)');db.close();emit(info)

def serve(filename):
 db=connect(filename);baseline=json.loads(db.execute("SELECT value FROM info WHERE key='baseline'").fetchone()[0]);prefix='projects/'+baseline['project']+'/databases/'+baseline['database']+'/documents/'
 for line in sys.stdin:
  request=json.loads(line);rid=request['id'];cmd=request['cmd']
  try:
   if cmd=='begin':
    old=db.execute("SELECT value FROM info WHERE key='capture'").fetchone();old=json.loads(old[0]) if old else None
    if old and old['readTime']!=request['readTime']:raise Exception('Index already belongs to another final capture')
    if not old:db.execute('UPDATE docs SET seen=0,changed=0');db.execute('INSERT OR REPLACE INTO info VALUES(?,?)',('capture',json.dumps({'readTime':request['readTime']})))
    db.commit();result={'baseline':baseline}
   elif cmd=='check':
    changed=[];unchanged=0
    for doc in request['documents']:
     if not doc['name'].startswith(prefix):raise Exception('Metadata source mismatch')
     p=doc['name'][len(prefix):];row=db.execute('SELECT createTime,updateTime FROM docs WHERE path=?',(p,)).fetchone()
     if row and row==(doc['createTime'],doc['updateTime']): db.execute('UPDATE docs SET seen=1 WHERE path=?',(p,));unchanged+=1
     else:changed.append(doc['name'])
    db.commit();result={'changed':changed,'unchanged':unchanged}
   elif cmd=='apply':
    for doc in request['documents']:
     if not doc['name'].startswith(prefix):raise Exception('Changed source mismatch')
     p=doc['name'][len(prefix):];raw=(json.dumps(doc,separators=(',',':'),ensure_ascii=False)+'\n').encode('utf8');db.execute('INSERT INTO docs(path,groupId,createTime,updateTime,payload,seen,changed) VALUES(?,?,?,?,?,1,1) ON CONFLICT(path) DO UPDATE SET createTime=excluded.createTime,updateTime=excluded.updateTime,payload=excluded.payload,seen=1,changed=1',(p,p.split('/')[-2],doc['createTime'],doc['updateTime'],zlib.compress(raw,1)))
    db.commit();result={'applied':len(request['documents'])}
   elif cmd=='finish':
    output=request['output'];expected=request['expected'];count=db.execute('SELECT COUNT(*) FROM docs WHERE seen=1').fetchone()[0]
    if count!=expected:raise Exception('Final identity count mismatch')
    paths={};groups={};changed=0;deleted=0;metadata=0
    with gzip.open(os.path.join(output,'documents.jsonl.gz'),'wb',compresslevel=6) as full,gzip.open(os.path.join(output,'changed.jsonl.gz'),'wb',compresslevel=6) as delta,gzip.open(os.path.join(output,'metadata.jsonl.gz'),'wb',compresslevel=6) as meta:
     for p,g,create,update,payload,is_changed in db.execute('SELECT path,groupId,createTime,updateTime,payload,changed FROM docs WHERE seen=1 ORDER BY path'):
      raw=zlib.decompress(payload);full.write(raw);metadata+=1
      meta.write((json.dumps({'path':p,'createTime':create,'updateTime':update,'changed':bool(is_changed)},separators=(',',':'))+'\n').encode())
      if is_changed:delta.write(raw);changed+=1
      parent=p.rsplit('/',1)[0];paths[parent]=paths.get(parent,0)+1;groups[g]=groups.get(g,0)+1
    with gzip.open(os.path.join(output,'deleted.jsonl.gz'),'wb',compresslevel=6) as deletes:
     for (p,) in db.execute('SELECT path FROM docs WHERE seen=0 ORDER BY path'):deletes.write((json.dumps({'path':p},separators=(',',':'))+'\n').encode());deleted+=1
    db.execute('PRAGMA wal_checkpoint(TRUNCATE)');result={'documents':count,'changed':changed,'deleted':deleted,'metadata':metadata,'collections':[{'path':p,'documents':n} for p,n in paths.items()],'groups':[{'collection':g,'total':n} for g,n in groups.items()]}
   elif cmd=='close':db.close();emit({'id':rid,'result':{}});return
   else:raise Exception('Unknown local command')
   emit({'id':rid,'result':result})
  except Exception as error:emit({'id':rid,'error':str(error)})
 db.close()

def rebase(archive,source_filename,filename):
 """Copy a completed capture, proving every compressed row against its immutable full archive."""
 os.umask(0o077)
 if os.path.realpath(source_filename)==os.path.realpath(filename) or os.path.exists(filename):raise Exception('Rebase requires a fresh separate output index')
 manifest_path=os.path.join(archive,'manifest.json');manifest=json.load(open(manifest_path))
 if not manifest.get('complete') or len(manifest.get('files',[]))!=1:raise Exception('Complete single-file coherent capture required')
 entry=manifest['files'][0];archive_file=os.path.join(archive,entry['file']);h=hashlib.sha256()
 with open(archive_file,'rb') as stream:
  for block in iter(lambda:stream.read(1048576),b''):h.update(block)
 if h.hexdigest()!=entry['sha256']:raise Exception('Coherent archive checksum mismatch')
 temporary=filename+'.rebase-part';db=None;source=None
 if os.path.exists(temporary):raise Exception('Unfinished rebase output exists; inspect before retrying')
 try:
  source=sqlite3.connect('file:'+os.path.abspath(source_filename)+'?mode=ro',uri=True)
  old=json.loads(source.execute("SELECT value FROM info WHERE key='baseline'").fetchone()[0]);capture=json.loads(source.execute("SELECT value FROM info WHERE key='capture'").fetchone()[0])
  if old['project']!=manifest['project'] or old['database']!=manifest['database'] or capture['readTime']!=manifest['readTime']:raise Exception('Capture index and coherent archive identity differ')
  db=sqlite3.connect(temporary);source.backup(db);source.close();source=None
  db.execute('PRAGMA cache_size=-32768');rows=db.execute('SELECT path,groupId,createTime,updateTime,payload FROM docs WHERE seen=1 ORDER BY path')
  prefix='projects/'+manifest['project']+'/databases/'+manifest['database']+'/documents/';count=0;groups={};paths={};payload_hash=hashlib.sha256()
  with gzip.open(archive_file,'rb') as full:
   for raw in full:
    row=rows.fetchone()
    if row is None or zlib.decompress(row[4])!=raw:raise Exception('Capture payload differs from coherent archive')
    doc=json.loads(raw);p,g,create,update,_=row
    if doc['name']!=prefix+p or doc['createTime']!=create or doc['updateTime']!=update or p.split('/')[-2]!=g:raise Exception('Capture system metadata mismatch')
    count+=1;groups[g]=groups.get(g,0)+1;parent=p.rsplit('/',1)[0];paths[parent]=paths.get(parent,0)+1;payload_hash.update(raw)
    if count%500000==0:emit({'rebaseProgress':count,'expected':manifest['documents']})
  if rows.fetchone() is not None or count!=manifest['documents'] or count!=entry['records']:raise Exception('Capture row count differs from coherent archive')
  if manifest.get('groups') and groups!={g['collection']:g['total'] for g in manifest['groups']}:raise Exception('Capture group inventory differs')
  if manifest.get('collections') and paths!={c['path']:c['documents'] for c in manifest['collections']}:raise Exception('Capture parent path inventory differs')
  removed=db.execute('SELECT COUNT(*) FROM docs WHERE seen=0').fetchone()[0];db.execute('DELETE FROM docs WHERE seen=0');db.execute("DELETE FROM info WHERE key='capture'")
  info={'complete':True,'partialSource':False,'project':manifest['project'],'database':manifest['database'],'readTime':manifest['readTime'],'documents':count,'files':manifest['files']}
  proof={'complete':True,'readTime':manifest['readTime'],'documents':count,'groups':len(groups),'collectionPaths':len(paths),'locallyOmittedOldPaths':removed,'archiveSha256':entry['sha256'],'payloadSha256':payload_hash.hexdigest(),'manifestSha256':hashlib.sha256(open(manifest_path,'rb').read()).hexdigest()}
  db.execute('INSERT OR REPLACE INTO info VALUES(?,?)',('baseline',json.dumps(info)));db.execute('INSERT OR REPLACE INTO info VALUES(?,?)',('rebaseProof',json.dumps(proof)));db.commit();db.execute('PRAGMA wal_checkpoint(TRUNCATE)');db.close();db=None
  os.replace(temporary,filename);emit(proof)
 except:
  if db:db.close()
  if source:source.close()
  for suffix in ['', '-wal','-shm']:
   if os.path.exists(temporary+suffix):os.unlink(temporary+suffix)
  raise

if __name__=='__main__':
 if sys.argv[1]=='build':build(sys.argv[2],sys.argv[3],'--allow-incomplete' in sys.argv[4:])
 elif sys.argv[1]=='serve':serve(sys.argv[2])
 elif sys.argv[1]=='rebase':rebase(sys.argv[2],sys.argv[3],sys.argv[4])
 else:raise Exception('Unknown mode')
