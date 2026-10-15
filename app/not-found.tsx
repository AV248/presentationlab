import { NotFoundPage } from '@/screens/NotFoundPage';

/**
 * 404 — rendered inside the same shell as everything else, so a wrong link
 * still lands somewhere that looks like the site and offers a way onward.
 *
 * `noindex` is deliberate and is the one thing this file adds: a 404 should
 * never be indexed, and Next.js does not assume that.
 */
export const metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundPage />;
}
