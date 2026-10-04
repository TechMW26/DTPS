import fs from 'node:fs';
import dotenv from 'dotenv';
import {getNativeDatabase} from '../../src/lib/db/firestore-native';
import {seedRecipeAdminIndex} from '../../src/lib/db/repository/native-recipe-admin-index';
async function main(){
 if(!process.argv.includes('--execute')||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Explicit local staging operation required');
 Object.assign(process.env,{...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local'))});
 const db=getNativeDatabase();try{console.log(JSON.stringify(await seedRecipeAdminIndex(db)));}finally{await db.terminate();}
}
main().catch(error=>{console.error(error.name);process.exitCode=1;});
