/**
 * The control room: appearance, cloud, data — and the
 * environment check, which is what makes this page worth
 * opening when something is wrong.
 */
import { ControlPage } from '@/screens/ControlPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <ControlPage />;
}

export const metadata = routeMetadata('/control');
