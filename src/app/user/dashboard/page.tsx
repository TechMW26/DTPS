import { redirect } from 'next/navigation';

/**
 * Keep legacy bookmarks working while maintaining one canonical client
 * dashboard. The previous page duplicated the app shell and showed fabricated
 * fallback health metrics whenever its unused endpoint failed.
 */
export default function UserDashboardRedirect() {
  redirect('/user');
}
