/**
 * The writing studio, a blank page.
 */
import { StudioPage } from '@/screens/StudioPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <StudioPage />;
}

export const metadata = routeMetadata('/write');
