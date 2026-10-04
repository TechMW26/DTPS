import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const env={...process.env,DTPS_FIRESTORE_LIVE_TEST:''};
// Reuse an installed Java 21 runtime without changing the machine's default Java.
const homebrew='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
const javaProbe=spawnSync(env.JAVA_HOME?path.join(env.JAVA_HOME,'bin/java'):'java',['-version'],{env,encoding:'utf8'});
const javaMajor=Number((javaProbe.stderr||'').match(/version "(\d+)/)?.[1]||0);
if(javaMajor<21 && fs.existsSync(homebrew)) env.JAVA_HOME=homebrew;
if(env.JAVA_HOME) env.PATH=path.join(env.JAVA_HOME,'bin')+path.delimiter+env.PATH;
for(const name of Object.keys(env)) if(name.startsWith('FIRESTORE_NATIVE_')) delete env[name];
// Source-reader BSON/Mongo audits run only in the isolated migration runner.
const unit=spawnSync(process.execPath,['--test','tools/firebase-migration/retry.test.mjs','tools/firebase-migration/rest-commit.test.mjs','tools/firebase-migration/private-blob.test.mjs','tools/firebase-migration/media-source.test.mjs'],{cwd:root,env,stdio:'inherit'});
if(unit.status!==0) process.exit(unit.status||1);
const firebase=path.join(root,'node_modules/firebase-tools/lib/bin/firebase.js');
if(!fs.existsSync(firebase)) throw new Error('Install development dependencies before running local Firebase tests');
const targets=process.argv.slice(2);
if(targets.some(file=>!/^tests\/database\/[A-Za-z0-9_.-]+\.test\.ts$/.test(file)))throw new Error('Only explicit database test files are supported');
const command='npx jest --config tests/database/jest.config.cjs --runInBand'+(targets.length?' '+targets.join(' '):'');
const child=spawn(process.execPath,[firebase,'emulators:exec','--config','firebase.native.local.json','--only','firestore','--project','demo-dtps-native',command],{cwd:root,env,stdio:'inherit'});
child.on('error',()=>{process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
