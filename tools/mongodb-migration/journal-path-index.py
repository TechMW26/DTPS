#!/usr/bin/env python3
"""Private durable path set; sequence receipts must never be replaced on resume."""
import sys,json,sqlite3,os
os.umask(0o077)
db=sqlite3.connect(sys.argv[1]);db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA synchronous=FULL')
db.execute('CREATE TABLE IF NOT EXISTS paths(path TEXT PRIMARY KEY) WITHOUT ROWID');db.execute('CREATE TABLE IF NOT EXISTS events(shard INTEGER,seq INTEGER,hash TEXT,PRIMARY KEY(shard,seq)) WITHOUT ROWID');db.execute('CREATE TABLE IF NOT EXISTS info(key TEXT PRIMARY KEY,value TEXT)');db.commit()
def emit(value):print(json.dumps(value,separators=(',',':')),flush=True)
for line in sys.stdin:
 r=json.loads(line);rid=r['id']
 try:
  if r['cmd']=='begin':
   identity=json.dumps(r['identity'],sort_keys=True,separators=(',',':'));old=db.execute("SELECT value FROM info WHERE key='identity'").fetchone()
   if old and old[0]!=identity:raise Exception('Path set belongs to another journal fence')
   db.execute('INSERT OR IGNORE INTO info VALUES(?,?)',('identity',identity));db.commit();value={}
  elif r['cmd']=='events':
   try:
    db.execute('BEGIN')
    for e in r['events']:
     old=db.execute('SELECT hash FROM events WHERE shard=? AND seq=?',(e['shard'],e['seq'])).fetchone()
     if old and old[0]!=e['hash']:raise Exception('Resumed sequence content differs')
     db.execute('INSERT OR IGNORE INTO events VALUES(?,?,?)',(e['shard'],e['seq'],e['hash']))
     for p in e['paths']:db.execute('INSERT OR IGNORE INTO paths VALUES(?)',(p,))
    db.commit()
   except:db.rollback();raise
   value={}
  elif r['cmd']=='counts':value={'events':db.execute('SELECT COUNT(*) FROM events').fetchone()[0],'paths':db.execute('SELECT COUNT(*) FROM paths').fetchone()[0]}
  elif r['cmd']=='paths':
   limit=r['limit']
   if not isinstance(limit,int) or not 1<=limit<=300:raise Exception('Bounded path page required')
   value={'paths':[row[0] for row in db.execute('SELECT path FROM paths WHERE path>? ORDER BY path LIMIT ?',(r.get('after',''),limit))]}
  elif r['cmd']=='close':db.execute('PRAGMA wal_checkpoint(TRUNCATE)');db.close();emit({'id':rid,'result':{}});break
  else:raise Exception('Unknown journal local command')
  emit({'id':rid,'result':value})
 except Exception as error:emit({'id':rid,'error':str(error)})
else:db.close()
