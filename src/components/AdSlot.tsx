'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/lib/router';
import { ArrowUpRight, X } from 'lucide-react';
import { shortUrl } from '../lib/share';
import { shareOrCopy } from '../lib/platform';
import { HOUSE_ADS, fetchActiveAds, pickAd, type Ad } from '../services/ads';

/**
 * A sponsored slot designed to be noticeable without ever being disturbing:
 *
 *   • theme-native card — no popovers, no autoplaying anything, no takeover
 *   • labelled "Sponsored" (or "From Presentation Buddy" for house ads)
 *   • reserves its space before the ad arrives, so the page never jumps
 *   • dismissible for the rest of the session
 *   • every external link carries rel="sponsored noopener noreferrer"
 *
 * Ads are rows from the `ads` table in this site's own database. Every URL in
 * them is scheme-checked in src/services/ads.ts
 * before it reaches this component, so `RedirectURL: "javascript:..."` in the
 * database cannot become a clickable link.
 *
 * Offline — or when nobody has bought a slot — it quietly shows a house promo
 * for this app's own features instead.
 */

interface AdSlotProps {
  /** Stable seed so one page keeps one ad (e.g. the speech id). */
  seed: string;
  /** inline = full width inside a flow · rail = narrow sidebar card. */
  variant?: 'inline' | 'rail';
}

const dismissedForSession = (key: string) => {
  try {
    return sessionStorage.getItem(`pb.ad.dismissed.${key}`) === '1';
  } catch {
    return false;
  }
};

export function AdSlot({ seed, variant = 'inline' }: AdSlotProps) {
  const [ad, setAd] = useState<Ad | null>(null);
  const [dismissed, setDismissed] = useState(() => dismissedForSession(seed));
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // Idle-deferred: the ad is never allowed to delay the content around it.
    const run = () => {
      void fetchActiveAds()
        .then((ads) => {
          if (!alive) return;
          setAd(pickAd(ads.length ? ads : HOUSE_ADS, seed) ?? HOUSE_ADS[0]);
        })
        .catch(() => {
          if (alive) setAd(pickAd(HOUSE_ADS, seed));
        });
    };
    const idle = window.requestIdleCallback as
      | ((cb: () => void, o?: { timeout: number }) => number)
      | undefined;
    const handle =
      typeof idle === 'function' ? idle(run, { timeout: 3000 }) : window.setTimeout(run, 800);
    return () => {
      alive = false;
      if (typeof handle === 'number') window.clearTimeout(handle);
    };
  }, [seed]);

  // A new ad means a new image; forget that a previous one failed to load.
  useEffect(() => setImageFailed(false), [ad?.id]);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(`pb.ad.dismissed.${seed}`, '1');
    } catch {
      /* private mode */
    }
    setDismissed(true);
  };

  const label = ad?.house ? 'From Presentation Buddy' : 'Sponsored';

  return (
    <div
      className={`pb-ad ${variant === 'rail' ? 'pb-ad-rail' : ''}`}
      aria-label={label}
      data-empty={ad ? 'false' : 'true'}
    >
      {ad && (
        <>
          <div className="pb-ad-head">
            <span className="pb-ad-tag">{label}</span>
            <button
              type="button"
              className="pb-icon-btn pb-ad-close"
              onClick={dismiss}
              aria-label="Hide this message"
              title="Hide for this session"
            >
              <X size={13} />
            </button>
          </div>

          {/*
            A real anchor, not a click handler: it can be opened in a new tab,
            copied, and inspected — and the rel value tells search engines the
            link is paid, which is what keeps the site's own rankings clean.
          */}
          {ad.id.startsWith('house-share') ? (
            <button type="button" className="pb-ad-body" style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }} onClick={() => { void shareOrCopy('Presentation Buddy', 'Write, rehearse and deliver talks that land.', shortUrl('/')); }}>
              <AdContent ad={ad} imageFailed={imageFailed} onImageError={() => setImageFailed(true)} />
            </button>
          ) : ad.url.startsWith('/') ? (
            <Link className="pb-ad-body" to={ad.url}>
              <AdContent ad={ad} imageFailed={imageFailed} onImageError={() => setImageFailed(true)} />
            </Link>
          ) : ad.url ? (
            <a
              className="pb-ad-body"
              href={ad.url}
              target="_blank"
              rel="sponsored noopener noreferrer"
            >
              <AdContent ad={ad} imageFailed={imageFailed} onImageError={() => setImageFailed(true)} />
            </a>
          ) : (
            <div className="pb-ad-body">
              <AdContent ad={ad} imageFailed={imageFailed} onImageError={() => setImageFailed(true)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AdContent({
  ad,
  imageFailed,
  onImageError,
}: {
  ad: Ad;
  imageFailed: boolean;
  onImageError: () => void;
}) {
  const showImage = Boolean(ad.imageUrl) && !imageFailed;

  return (
    <>
      {showImage && (
        // aspect-ratio reserves the box before the bytes arrive, so a slow
        // image never pushes the article out from under the reader.
        <span className="pb-ad-media">
          <img
            className="pb-ad-img"
            src={ad.imageUrl as string}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={onImageError}
          />
        </span>
      )}

      <span className="pb-ad-title">{ad.title}</span>
      {ad.body && <span className="pb-ad-copy">{ad.body}</span>}
      {ad.url && <span className="pb-ad-cta">
        {ad.cta} <ArrowUpRight size={13} aria-hidden="true" />
      </span>}
    </>
  );
}
