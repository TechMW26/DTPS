import {NextRequest} from 'next/server';
import {nativeResponseJson} from '@/lib/api/native-response';
import {getNativeDatabase} from '@/lib/db/database';
import {sendNotificationToUser} from '@/lib/firebase/firebaseNotification';
import {sendDiwaliGreetingBatch} from '@/lib/festive/diwali-push';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Runs every minute (vercel.json). Does nothing outside 8 Nov 2026 IST. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return nativeResponseJson({error: 'Unauthorized'}, {status: 401});
  // Never contact real phones from a local machine or preview.
  if (process.env.NODE_ENV !== 'production') return nativeResponseJson({success: true, skipped: 'local_delivery_disabled'});
  try {
    const result = await sendDiwaliGreetingBatch(getNativeDatabase(), sendNotificationToUser);
    return nativeResponseJson({success: true, ...result});
  } catch (error) {
    console.error('Diwali greeting batch failed:', error);
    return nativeResponseJson({success: false, error: 'Diwali greeting batch failed'}, {status: 500});
  }
}
