/**
 * Newest writing, as it arrives.
 */
import { ArrivalsPage } from '@/screens/ArrivalsPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <ArrivalsPage />;
}

export const metadata = routeMetadata('/arrivals');
