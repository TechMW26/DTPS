import { redirect } from 'next/navigation';

/** /admin has no page of its own: admins always land on the dashboard. */
export default function AdminPage() {
  redirect('/dashboard/admin');
}
