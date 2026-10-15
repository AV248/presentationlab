'use client';

import { useEffect } from 'react';
import { Link } from '@/lib/router';

/**
 * What a visitor sees when a page throws while rendering.
 *
 * The point of this file is that the failure is *contained*: one broken screen
 * does not take the headers, the navigation or the theme with it, and the
 * shell stays usable. The error text is deliberately plain — an operator
 * reading a stack trace in production is not the person standing in front of
 * this page.
 *
 * Nothing here reports to a third party. The app has no error service by
 * design; `console.error` is where the detail goes, which is what the platform
 * keeps, and what a maintainer can actually open.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[pb] a screen failed to render', error);
  }, [error]);

  return (
    <div className="pb-panel" style={{ padding: '36px 28px', textAlign: 'center', maxWidth: 620, margin: '40px auto' }}>
      <h1 style={{ fontSize: '1.3rem', marginBottom: 10 }}>Something went wrong on this screen</h1>
      <p className="pb-muted" style={{ lineHeight: 1.7, marginBottom: 18 }}>
        The rest of the site is fine — this is one page. Try again, or go back to the library
        and carry on from there.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="pb-btn pb-btn-primary" onClick={reset}>
          Try again
        </button>
        <Link to="/" className="pb-btn">
          Back to the library
        </Link>
      </div>
    </div>
  );
}
