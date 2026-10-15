/**
 * The theme studio.
 */
import { ThemesPage } from '@/screens/ThemesPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <ThemesPage />;
}

export const metadata = routeMetadata('/themes');
