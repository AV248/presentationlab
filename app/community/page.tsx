/**
 * Writers and what they have published.
 */
import { CommunityPage } from '@/screens/CommunityPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <CommunityPage />;
}

export const metadata = routeMetadata('/community');
