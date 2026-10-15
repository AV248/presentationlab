/**
 * Rehearsal room, with no speech selected.
 */
import { PracticePage } from '@/screens/PracticePage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <PracticePage />;
}

export const metadata = routeMetadata('/rehearse');
