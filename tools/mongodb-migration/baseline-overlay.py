#!/usr/bin/env python3
"""A compact writable identity overlay over an immutable, proved source baseline."""
import sys, os, json, sqlite3, gzip, zlib, urllib.parse

def emit(value): print(json.dumps(value,separators=(',',':')),flush=True)

def serve(base, overlay, output, min_free, max_extra):
 os.umask(0o077)
 base=os.path.abspath(base);overlay=os.path.abspath(overlay);output=os.path.abspath(output)
 if base==overlay: raise Exception('Overlay must be separate from immutable baseline')
 if os.path.exists(base+'-wal') and os.path.getsize(base+'-wal'): raise Exception('Baseline has uncheckpointed writes')
 signature=(os.stat(base).st_size,os.stat(base).st_mtime_ns)
 def guard():
  if signature!=(os.stat(base).st_size,os.stat(base).st_mtime_ns): raise Exception('Immutable baseline changed')
  disk=os.statvfs(output)
  if disk.f_bavail*disk.f_frsize<min_free: raise Exception('Capture paused: less than required free disk')
  size=sum(os.path.getsize(os.path.join(root,name)) for root,_,names in os.walk(output) for name in names)
  if os.path.commonpath([overlay,output])!=output:
   size+=sum(os.path.getsize(overlay+s) for s in ['', '-wal','-shm'] if os.path.exists(overlay+s))
  if size>max_extra: raise Exception('Capture paused: extra disk budget exceeded')
 guard()
 db=sqlite3.connect(overlay,uri=True);db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA synchronous=FULL');db.execute('PRAGMA wal_autocheckpoint=256');db.execute('PRAGMA cache_size=-32768')
 db.execute('ATTACH DATABASE ? AS baseline',('file:'+urllib.parse.quote(base)+'?mode=ro&immutable=1',))
 baseline=json.loads(db.execute("SELECT value FROM baseline.info WHERE key='baseline'").fetchone()[0])
 if db.execute("SELECT COUNT(*) FROM baseline.info WHERE key='capture'").fetchone()[0]:raise Exception('Baseline belongs to a mutable capture')
 db.execute('CREATE TABLE IF NOT EXISTS docs(path TEXT PRIMARY KEY,createTime TEXT,updateTime TEXT,payload BLOB) WITHOUT ROWID');db.execute('CREATE TABLE IF NOT EXISTS info(key TEXT PRIMARY KEY,value TEXT)');db.commit()
 db.create_function('group_of',1,lambda p:p.split('/')[-2],deterministic=True)
 prefix='projects/'+baseline['project']+'/databases/'+baseline['database']+'/documents/'
 for line in sys.stdin:
  request=json.loads(line);rid=request['id'];cmd=request['cmd']
  try:
   guard()
   if cmd=='begin':
    old=db.execute("SELECT value FROM info WHERE key='capture'").fetchone()
    identity={'readTime':request['readTime'],'baseline':baseline,'signature':list(signature)}
    if old and json.loads(old[0])!=identity:raise Exception('Overlay belongs to another capture or baseline')
    db.execute('INSERT OR REPLACE INTO info VALUES(?,?)',('capture',json.dumps(identity)));db.commit();result={'baseline':baseline}
   elif cmd=='group_progress':
    state=db.execute("SELECT value FROM info WHERE key='capture'").fetchone()
    if not state or json.loads(state[0])['readTime']!=request['readTime']:raise Exception('Resume metadata belongs to another snapshot')
    rows=db.execute('SELECT path,payload IS NOT NULL FROM docs WHERE group_of(path)=?',(request['group'],)).fetchall()
    result={'paths':[p for p,_ in rows],'changed':sum(changed for _,changed in rows)}
   elif cmd=='check':
    changed=[];unchanged=0
    for doc in request['documents']:
     if not doc['name'].startswith(prefix):raise Exception('Metadata source mismatch')
     p=doc['name'][len(prefix):]
     row=db.execute('SELECT coalesce(d.createTime,b.createTime),coalesce(d.updateTime,b.updateTime) FROM baseline.docs b LEFT JOIN docs d ON d.path=b.path WHERE b.path=?',(p,)).fetchone()
     if not row:row=db.execute('SELECT createTime,updateTime FROM docs WHERE path=?',(p,)).fetchone()
     if row and row==(doc['createTime'],doc['updateTime']):db.execute('INSERT OR IGNORE INTO docs(path) VALUES(?)',(p,));unchanged+=1
     else:changed.append(doc['name'])
    db.commit();result={'changed':changed,'unchanged':unchanged}
   elif cmd=='apply':
    for doc in request['documents']:
     if not doc['name'].startswith(prefix):raise Exception('Changed source mismatch')
     p=doc['name'][len(prefix):];raw=(json.dumps(doc,separators=(',',':'),ensure_ascii=False)+'\n').encode()
     db.execute('INSERT OR REPLACE INTO docs VALUES(?,?,?,?)',(p,doc['createTime'],doc['updateTime'],zlib.compress(raw,1)))
    db.commit();result={'applied':len(request['documents'])}
   elif cmd=='finish':
    if os.path.abspath(request['output'])!=output:raise Exception('Overlay output mismatch')
    count=db.execute('SELECT COUNT(*) FROM docs').fetchone()[0]
    if count!=request['expected']:raise Exception('Current identity count mismatch')
    groups={};paths={};changed=0;deleted=0;checked=0
    with gzip.open(os.path.join(output,'documents.jsonl.gz'),'wb',compresslevel=6) as full,gzip.open(os.path.join(output,'changed.jsonl.gz'),'wb',compresslevel=6) as delta,gzip.open(os.path.join(output,'metadata.jsonl.gz'),'wb',compresslevel=6) as meta:
     for p,create,update,payload,is_changed in db.execute('SELECT d.path,coalesce(d.createTime,b.createTime),coalesce(d.updateTime,b.updateTime),coalesce(d.payload,b.payload),d.payload IS NOT NULL FROM docs d LEFT JOIN baseline.docs b ON b.path=d.path ORDER BY d.path'):
      if payload is None:raise Exception('Seen identity has no complete body')
      raw=zlib.decompress(payload);full.write(raw);checked+=1
      meta.write((json.dumps({'path':p,'createTime':create,'updateTime':update,'changed':bool(is_changed)},separators=(',',':'))+'\n').encode())
      if is_changed:delta.write(raw);changed+=1
      group=p.split('/')[-2];parent=p.rsplit('/',1)[0];groups[group]=groups.get(group,0)+1;paths[parent]=paths.get(parent,0)+1
      if checked%10000==0:guard()
    with gzip.open(os.path.join(output,'deleted.jsonl.gz'),'wb',compresslevel=6) as deletes:
     for (p,) in db.execute('SELECT b.path FROM baseline.docs b LEFT JOIN docs d ON d.path=b.path WHERE d.path IS NULL ORDER BY b.path'):
      deletes.write((json.dumps({'path':p},separators=(',',':'))+'\n').encode());deleted+=1
    db.execute('PRAGMA wal_checkpoint(TRUNCATE)');guard();result={'documents':count,'changed':changed,'deleted':deleted,'metadata':count,'collections':[{'path':p,'documents':n} for p,n in paths.items()],'groups':[{'collection':g,'total':n} for g,n in groups.items()]}
   elif cmd=='close':db.close();emit({'id':rid,'result':{}});return
   else:raise Exception('Unknown local command')
   emit({'id':rid,'result':result})
  except Exception as error:emit({'id':rid,'error':str(error)})
 db.close()

if __name__=='__main__':serve(sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),int(sys.argv[5]))
