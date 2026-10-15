/**
 * The writer's desk: drafts, notes, folders.
 */
import { DeskPage } from '@/screens/DeskPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <DeskPage />;
}

export const metadata = routeMetadata('/desk');
