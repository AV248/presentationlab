import { ContactPage } from '@/screens/ContactPage';
import { routeMetadata } from '@/lib/routeMeta';

export const metadata = routeMetadata('/feedback');

export default function Page() {
  return <ContactPage kind="feedback" />;
}
