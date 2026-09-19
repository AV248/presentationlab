import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Heart, Library, Medal, Share2, Trophy, Users } from 'lucide-react';
import { useLeaderboard, useSpeeches } from '../hooks/useCollection';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { formatCount } from '../lib/text';
import { shareOrCopy } from '../lib/platform';

export function CommunityPage() {
  const items = useSpeeches();
  const board = useLeaderboard();
  const toggleLike = useLibrary((s) => s.toggleLike);
  const toast = useUi((s) => s.toast);
  const [range, setRange] = useState<'all' | 'library' | 'mine'>('all');

  const filtered = useMemo(() => {
    if (range === 'library') return board.filter((author) => author.name !== 'You');
    if (range === 'mine') return board.filter((author) => author.name === 'You');
    return board;
  }, [board, range]);

  const top = useMemo(() => [...items].sort((a, b) => b.likes - a.likes).slice(0, 8), [items]);
  const podium = filtered.slice(0, 3);

  const totalLikes = useMemo(() => items.reduce((sum, item) => sum + item.likes, 0), [items]);
  const totalViews = useMemo(() => items.reduce((sum, item) => sum + item.views, 0), [items]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 32px)', textAlign: 'center' }}>
        <span className="pb-eyebrow">Community</span>
        <h1 style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.3rem)', margin: '10px 0 10px' }}>
          The people behind the words
        </h1>
        <p className="pb-soft" style={{ maxInlineSize: '54ch', margin: '0 auto' }}>
          Likes are counted on this device and blended with the library’s baseline. Publish a speech
          in the studio and you appear here instantly.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'center',
            marginTop: 20,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="pb-btn"
            onClick={async () => {
              const result = await shareOrCopy(
                'Presentation Buddy leaderboard',
                'The speeches people keep coming back to.',
              );
              toast(result === 'failed' ? 'Sharing failed' : result === 'shared' ? 'Shared' : 'Copied', result === 'failed' ? 'error' : 'success');
            }}
          >
            <Share2 size={16} /> Share leaderboard
          </button>
          <Link to="/studio" className="pb-btn pb-btn-primary">
            Publish a speech
          </Link>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
            marginTop: 24,
            maxWidth: 620,
            marginInline: 'auto',
          }}
        >
          <HeroStat icon={Users} label="Authors" value={String(board.length)} />
          <HeroStat icon={Library} label="Speeches" value={String(items.length)} />
          <HeroStat icon={Heart} label="Likes" value={formatCount(totalLikes)} />
          <HeroStat icon={Medal} label="Views" value={formatCount(totalViews)} />
        </div>
      </section>

      {podium.length > 0 && (
        <section
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {[1, 0, 2].map((position) => {
            const author = podium[position];
            if (!author) return null;
            const heights = [132, 100, 82];
            const medals = ['🥇', '🥈', '🥉'];
            return (
              <div
                key={author.name}
                className="pb-panel anim-enter"
                style={{
                  ['--i' as string]: position,
                  padding: '18px 20px',
                  width: 'min(260px, 100%)',
                  textAlign: 'center',
                  borderColor: position === 0 ? 'var(--c-accent)' : 'var(--c-line)',
                }}
              >
                <div style={{ fontSize: '1.8rem' }}>{medals[position]}</div>
                <div style={{ height: heights[position], display: 'grid', placeItems: 'center' }}>
                  <div
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 999,
                      background: 'var(--grad-brand)',
                      color: 'var(--c-accent-ink)',
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: 'var(--x-font-display)',
                      fontWeight: 700,
                      fontSize: '1.4rem',
                    }}
                  >
                    {author.name.slice(0, 1).toUpperCase()}
                  </div>
                </div>
                <div style={{ fontWeight: 650, fontSize: '1rem' }}>{author.name}</div>
                <div className="pb-muted" style={{ fontSize: '0.78rem' }}>
                  {author.speeches} {author.speeches === 1 ? 'speech' : 'speeches'} ·{' '}
                  {formatCount(author.likes)} likes
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <Trophy size={18} style={{ color: 'var(--c-accent)' }} />
          <h2 style={{ fontSize: '1.1rem' }}>Full ranking</h2>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'library', 'mine'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`pb-chip ${range === value ? 'pb-chip-accent' : ''}`}
                onClick={() => setRange(value)}
              >
                {value === 'all' ? 'Everyone' : value === 'library' ? 'Library' : 'You'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map((author, index) => (
            <div
              key={author.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 4px',
                borderBottom: index === filtered.length - 1 ? 'none' : '1px solid var(--c-line-soft)',
                flexWrap: 'wrap',
              }}
            >
              <span className="pb-mono pb-muted" style={{ width: 30, fontSize: '0.85rem' }}>
                #{index + 1}
              </span>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: 'var(--c-accent-soft)',
                  border: '1px solid var(--c-accent-line)',
                  color: 'var(--c-accent)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  flex: '0 0 auto',
                }}
              >
                {author.name.slice(0, 1).toUpperCase()}
              </span>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{author.name}</div>
                <div className="pb-muted" style={{ fontSize: '0.74rem' }}>
                  {author.speeches} {author.speeches === 1 ? 'speech' : 'speeches'} ·{' '}
                  {formatCount(author.words)} words
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="pb-chip">
                  <Heart size={11} /> {formatCount(author.likes)}
                </span>
                {author.items[0] && (
                  <Link to={`/read/${encodeURIComponent(author.items[0].id)}`} className="pb-btn pb-btn-sm pb-btn-ghost">
                    Read one
                  </Link>
                )}
              </div>
            </div>
          ))}
          {!filtered.length && (
            <p className="pb-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              Nothing here yet — publish a speech to take the top spot.
            </p>
          )}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Award size={17} /> Most loved speeches
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))',
            gap: 12,
          }}
        >
          {top.map((item, index) => (
            <div key={item.id} className="pb-card anim-enter" style={{ ['--i' as string]: index }}>
              <Link to={`/read/${encodeURIComponent(item.id)}`} style={{ display: 'block' }}>
                <span className="pb-chip">{item.category}</span>
                <h3 className="pb-card-title" style={{ marginTop: 8 }}>{item.title}</h3>
                <p className="pb-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>{item.author}</p>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
                <button
                  type="button"
                  className="pb-btn pb-btn-sm pb-btn-ghost"
                  onClick={() => toggleLike(item.id)}
                  aria-pressed={item.likedByMe}
                >
                  <Heart size={14} fill={item.likedByMe ? 'var(--c-bad)' : 'none'} color={item.likedByMe ? 'var(--c-bad)' : undefined} />
                  {formatCount(item.likes)}
                </button>
                <span className="pb-muted" style={{ fontSize: '0.74rem' }}>
                  {item.minutes} min
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="pb-well" style={{ padding: '14px 16px' }}>
      <Icon size={16} style={{ color: 'var(--c-accent)', marginBottom: 6 }} />
      <div style={{ fontFamily: 'var(--x-font-display)', fontSize: '1.35rem', fontWeight: 700 }}>{value}</div>
      <div className="pb-muted" style={{ fontSize: '0.72rem' }}>{label}</div>
    </div>
  );
}
