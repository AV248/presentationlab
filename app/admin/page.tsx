/**
 * The owner-only workspace: ads, handles, roles, feedback.
 * 
 * Never indexed, never cached, and hidden from the shell for everyone who is
 * not a role-holder.
 */
import { AdminPage } from '@/screens/AdminPage';

export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  return <AdminPage />;
}
