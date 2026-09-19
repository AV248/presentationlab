import { useEffect, useRef, useState } from 'react';
import { Clock3, Sparkles } from 'lucide-react';
import { fetchSponsors, type Sponsor } from '../services/data';

const SECONDS = 5;

/**
 * The sponsor gate, kept from the very first version of the site: a speech
 * flagged `ad` is preceded by a short, skippable-after-five-seconds slot.
 *
 * If no sponsor documents exist, the slot belongs to Presentation Buddy
 * itself rather than inventing an advertiser.
 */
export function AdGate({
  speechId,
  onFinish,
}: {
  speechId: string;
  onFinish: () => void;
}) {
  const [remaining, setRemaining] = useState(SECONDS);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchSponsors().then((list) => {
      if (alive) setSponsors(list);
    });
    return () => {
      alive = false;
    };
  }, [speechId]);

  useEffect(() => {
    timer.current = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          if (timer.current) window.clearInterval(timer.current);
          onFinish();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [onFinish]);

  const sponsor = sponsors.length
    ? sponsors[Math.abs(hash(speechId)) % sponsors.length]
    : null;

  return (
    <div
      className="pb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sponsored message"
      style={{ padding: 20 }}
    >
      <div
        className="pb-panel"
        style={{
          width: 'min(440px, 100%)',
          padding: '26px 26px 22px',
          textAlign: 'center',
        }}
      >
        <span className="pb-eyebrow">A short pause</span>

        {sponsor ? (
          <>
            {sponsor.imageUrl && (
              <img
                src={sponsor.imageUrl}
                alt={sponsor.name}
                style={{
                  width: '100%',
                  borderRadius: 'var(--u-radius-sm)',
                  margin: '14px 0 12px',
                  border: '1px solid var(--c-line)',
                }}
              />
            )}
            <h3 style={{ fontSize: '1.05rem', marginTop: sponsor.imageUrl ? 0 : 12 }}>{sponsor.name}</h3>
            <p className="pb-soft" style={{ fontSize: '0.9rem', marginTop: 6, lineHeight: 1.6 }}>
              {sponsor.line}
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '1.8rem', margin: '12px 0 8px' }} aria-hidden="true">
              <Sparkles size={26} style={{ color: 'var(--c-accent)', margin: '0 auto' }} />
            </div>
            <h3 style={{ fontSize: '1.05rem' }}>From the people who made this</h3>
            <p className="pb-soft" style={{ fontSize: '0.9rem', marginTop: 6, lineHeight: 1.65 }}>
              This speech is free to read because nobody is paying to be here. If it helps you,
              write one of your own and put it in the library for the next person.
            </p>
          </>
        )}

        <div
          className="pb-well"
          style={{
            marginTop: 18,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Clock3 size={15} style={{ color: 'var(--c-accent)' }} />
          <span style={{ fontSize: '0.86rem' }}>
            {remaining > 0 ? `The speech opens in ${remaining}s` : 'Opening now…'}
          </span>
        </div>

        <div
          style={{
            marginTop: 12,
            height: 3,
            borderRadius: 999,
            background: 'var(--c-surface-3)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${((SECONDS - remaining) / SECONDS) * 100}%`,
              background: 'var(--grad-brand)',
              transition: 'width 260ms linear',
            }}
          />
        </div>

        {remaining <= 0 && (
          <button type="button" className="pb-btn pb-btn-primary pb-btn-block" style={{ marginTop: 14 }} onClick={onFinish}>
            Read the speech
          </button>
        )}
      </div>
    </div>
  );
}

function hash(value: string): number {
  let out = 0;
  for (let i = 0; i < value.length; i += 1) out = (out * 31 + value.charCodeAt(i)) % 100000;
  return out;
}
