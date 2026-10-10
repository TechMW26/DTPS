import fs from 'node:fs';
import {parse} from 'dotenv';
import {arg} from './archive.mjs';
export function targetCredentials(){
 const file=arg('--credentials-file');
 if(file){const values=parse(fs.readFileSync(file));if(!values.MONGODB_URI)throw new Error('Dedicated target credentials file has no MongoDB URI');process.env.MONGODB_URI=values.MONGODB_URI;if(values.MONGODB_DATABASE)process.env.MONGODB_DATABASE=values.MONGODB_DATABASE;}
 if(process.env.MONGODB_URI){let host;try{host=new URL(process.env.MONGODB_URI).hostname.toLowerCase();}catch{throw new Error('Invalid target MongoDB URI');}if(host!=='dtpscluster.fav0awp.mongodb.net')throw new Error('Target hostname does not match the approved DTPS Atlas cluster');}
 if(process.argv.includes('--execute')&&!file)throw new Error('Target writes require explicit --credentials-file; implicit local environment credentials are not accepted');
 const database=arg('--database',process.env.MONGODB_DATABASE||'dtps');
 if(process.argv.includes('--execute')&&database!=='dtps')throw new Error('DTPS migration writes are restricted to the dtps database');
 return {uri:process.env.MONGODB_URI,database};
}
