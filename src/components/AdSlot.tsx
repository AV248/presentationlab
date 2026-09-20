import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import {
  HOUSE_ADS,
  fetchActiveAds,
  pickAd,
  recordAdEvent,
  type Ad,
} from '../services/ads';

/**
 * A sponsored slot designed to be noticeable without ever being disturbing:
 *
 *   • theme-native card — no popovers, no autoplaying anything, no takeover
 *   • labelled "Sponsored" (or "From Presentation Buddy" for house ads)
 *   • reserves its space before the ad arrives, so the page never jumps
 *   • dismissible for the rest of the session
 *   • every external link carries rel="sponsored noopener"
 *
 * Ads are real documents from the Firestore `ads` collection. Offline —
 * or when nobody has bought a slot — it quietly shows a house promo.
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
  const navigate = useNavigate();
  const [ad, setAd] = useState<Ad | null>(null);
  const [dismissed, setDismissed] = useState(() => dismissedForSession(seed));
  const hostRef = useRef<HTMLDivElement | null>(null);
  const impressionSent = useRef(false);

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
    const idle = window.requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
    const handle = typeof idle === 'function' ? idle(run, { timeout: 3000 }) : window.setTimeout(run, 800);
    return () => {
      alive = false;
      if (typeof handle === 'number') window.clearTimeout(handle);
    };
  }, [seed]);

  // Count an impression only when at least half the card is actually seen.
  useEffect(() => {
    if (!ad || ad.house || impressionSent.current) return;
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !impressionSent.current) {
          impressionSent.current = true;
          void recordAdEvent(ad.id, 'impression');
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ad]);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(`pb.ad.dismissed.${seed}`, '1');
    } catch {
      /* private mode */
    }
    setDismissed(true);
  };

  const open = () => {
    if (!ad) return;
    if (!ad.house) void recordAdEvent(ad.id, 'click');
    if (ad.house || ad.url.startsWith('/')) {
      navigate(ad.url);
    } else {
      window.open(ad.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      ref={hostRef}
      className={`pb-ad ${variant === 'rail' ? 'pb-ad-rail' : ''}`}
      aria-label={ad?.house ? 'From Presentation Buddy' : 'Sponsored message'}
      data-empty={ad ? 'false' : 'true'}
    >
      {ad && (
        <>
          <div className="pb-ad-head">
            <span className="pb-ad-tag">{ad.house ? 'From Presentation Buddy' : 'Sponsored'}</span>
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
          <button type="button" className="pb-ad-body" onClick={open}>
            <span className="pb-ad-title">{ad.title}</span>
            {ad.body && <span className="pb-ad-copy">{ad.body}</span>}
            <span className="pb-ad-cta">
              {ad.cta} <ArrowUpRight size={13} aria-hidden="true" />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
