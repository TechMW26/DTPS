import {google} from 'googleapis';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import {getBaseUrl} from '@/lib/config';

/** Local migration previews must never refresh credentials or modify a real calendar. */
export async function getNativeGoogleCalendarClient(userId:string) {
  if(process.env.NODE_ENV!=='production')return null;
  const db=getNativeDatabase(),ref=db.collection('users').doc(userId),row=await ref.get();
  if(!row.exists||['inactive','deleted'].includes(row.get('status'))||!row.get('googleCalendarAccessToken'))return null;
  const user=nativeDates(row.data());
  const client=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,`${getBaseUrl().replace(/\/$/,'')}/api/auth/google-calendar/callback`);
  const expiry=user.googleCalendarTokenExpiry?new Date(user.googleCalendarTokenExpiry).getTime():undefined;
  client.setCredentials({access_token:user.googleCalendarAccessToken,refresh_token:user.googleCalendarRefreshToken,expiry_date:expiry});
  if(!expiry||expiry<Date.now()+60000){
    if(!user.googleCalendarRefreshToken)return null;
    const {credentials}=await client.refreshAccessToken();
    if(!credentials.access_token)throw new Error('Calendar credentials could not be refreshed');
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(!current.exists||current.get('googleCalendarRefreshToken')!==user.googleCalendarRefreshToken||current.get('googleCalendarAccessToken')!==user.googleCalendarAccessToken)throw new Error('Calendar credentials changed; retry the operation');
      tx.update(ref,{googleCalendarAccessToken:credentials.access_token,googleCalendarRefreshToken:credentials.refresh_token||user.googleCalendarRefreshToken,...(credentials.expiry_date?{googleCalendarTokenExpiry:new Date(credentials.expiry_date)}:{})});
    });
    client.setCredentials({...credentials,refresh_token:credentials.refresh_token||user.googleCalendarRefreshToken});
  }
  return client;
}

export async function getNativeGoogleCalendarClientByEmail(email:string){
  if(process.env.NODE_ENV!=='production')return null;
  const rows=await getNativeDatabase().collection('users').where('email','==',email.trim().toLowerCase()).limit(2).select().get();
  if(rows.size!==1)return null;
  const userId=rows.docs[0].id;
  return {userId,client:await getNativeGoogleCalendarClient(userId)};
}
