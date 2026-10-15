/**
 * The library: the front page.
 */
import { LibraryPage } from '@/screens/LibraryPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <LibraryPage />;
}

export const metadata = routeMetadata('/');
