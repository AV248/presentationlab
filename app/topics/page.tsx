/**
 * Every speaking guide, in one place.
 */
import { TopicsPage } from '@/screens/TopicsPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <TopicsPage />;
}

export const metadata = routeMetadata('/topics');
