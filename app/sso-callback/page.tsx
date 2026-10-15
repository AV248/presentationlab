/**
 * Where Clerk returns mid sign-in.
 * 
 * Never indexed and never linked to: it is a landing strip, not a page.
 */
import { SSOCallbackPage } from '@/screens/SSOCallbackPage';
import { routeMetadata } from '@/lib/routeMeta';

export default function Page() {
  return <SSOCallbackPage />;
}

export const metadata = routeMetadata('/sso-callback');
