/**
 * Claiming /username: the moment a visitor becomes a publisher.
 * 
 * Never indexed: a claim page has nothing to rank for, and the handle it
 * reserves belongs to one person.
 */
import { ClaimPage } from '@/screens/ProfilePage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <ClaimPage />;
}

export const metadata = routeMetadata('/claim');
