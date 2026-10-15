/**
 * What Presentation Buddy is, and why.
 */
import { AboutPage } from '@/screens/AboutPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <AboutPage />;
}

export const metadata = routeMetadata('/about');
