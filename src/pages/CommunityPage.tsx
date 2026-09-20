import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Feather, Medal, PenLine, RefreshCw, Trophy } from 'lucide-react';
import { useCommunity } from '../hooks/useCommunity';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { publishPost, deletePost } from '../services/data';
import { FIREBASE_ENABLED } from '../services/firebase';
import { formatCount } from '../lib/text';
import { useGate } from '../components/SignIn';
import { AdSlot } from '../components/AdSlot';
import { pageMetaFor } from '../data/routes';
import { SITE_URL, usePageMeta } from '../lib/seo';

/**
 * Community: the leaderboard (real accounts, real points) and the open mic,
 * which is where the old site's "creative creator" posts now live.
 */
export function CommunityPage() {
  const meta = pageMetaFor('/community');
  usePageMeta('Community — speeches shared by real people', {
    description: meta?.description,
    image: meta?.card ? `${SITE_URL}/cards/${meta.card}.png` : undefined,
    jsonLd: meta?.jsonLd,
  });
  const { contributors, posts, loading, error, refresh } = useCommunity();
  const user = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const toast = useUi((s) => s.toast);
  const gate = useGate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const podium = contributors.slice(0, 3);

  const submit = () => {
    gate(() => {
      if (!title.trim() || !body.trim()) {
        toast('Give it a title and a thought first.', 'warn');
        return;
      }
      setPosting(true);
      publishPost(title.trim(), body.trim(), user!.uid, user!.displayName ?? user!.email ?? 'Anonymous')
        .then(() => {
          setTitle('');
          setBody('');
          refresh();
          toast('Posted to the open mic', 'success');
        })
        .catch((err: unknown) => toast((err as Error)?.message ?? 'Could not post that.', 'error'))
        .finally(() => setPosting(false));
    }, 'Sign in to put a note on the open mic.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 32px)', textAlign: 'center' }}>
        <span className="pb-eyebrow">Community</span>
        <h1 style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.3rem)', margin: '10px 0 10px' }}>
          The people who actually wrote something
        </h1>
        <p className="pb-soft" style={{ maxInlineSize: '54ch', margin: '0 auto', lineHeight: 1.7 }}>
          Points follow the rule this site has used since the first version: one point per like,
          minus one for every three dislikes. Only real, signed-in accounts appear here — there are
          no invented people and no invented scores.
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
          <Link to="/studio" className="pb-btn pb-btn-primary">
            <PenLine size={16} /> Publish a speech
          </Link>
          <button type="button" className="pb-btn" onClick={refresh} disabled={loading}>
            <RefreshCw size={16} /> {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </section>

      {!FIREBASE_ENABLED && (
        <div className="pb-well" style={{ padding: 16, fontSize: '0.86rem', lineHeight: 1.65 }}>
          Firebase is not configured on this installation, so there is no shared community to show
          yet. Add the environment variables and this page fills with real accounts.
        </div>
      )}

      {error && (
        <div className="pb-well" style={{ padding: 16, fontSize: '0.86rem', color: 'var(--c-warn)' }}>
          {error}
        </div>
      )}

      {podium.length > 0 && (
        <section
          style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          {[1, 0, 2].map((position) => {
            const person = podium[position];
            if (!person) return null;
            const heights = [128, 96, 78];
            const medals = ['🥇', '🥈', '🥉'];
            return (
              <div
                key={person.uid}
                className="pb-panel anim-enter"
                style={{
                  ['--i' as string]: position,
                  padding: '18px 20px',
                  width: 'min(260px, 100%)',
                  textAlign: 'center',
                  borderColor: position === 0 ? 'var(--c-accent)' : 'var(--c-line)',
                }}
              >
                <div style={{ fontSize: '1.7rem' }} aria-hidden="true">{medals[position]}</div>
                <div style={{ height: heights[position], display: 'grid', placeItems: 'center' }}>
                  {person.photoURL ? (
                    <img
                      src={person.photoURL}
                      alt=""
                      style={{ width: 58, height: 58, borderRadius: 999, objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 999,
                        background: 'var(--c-accent-soft)',
                        border: '1px solid var(--c-accent-line)',
                        color: 'var(--c-accent)',
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: 'var(--x-font-display)',
                        fontWeight: 700,
                        fontSize: '1.35rem',
                      }}
                    >
                      {person.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 650, fontSize: '1rem' }}>{person.name}</div>
                <div className="pb-muted" style={{ fontSize: '0.78rem' }}>
                  {person.points} {person.points === 1 ? 'point' : 'points'} ·{' '}
                  {formatCount(person.likesReceived)} likes
                </div>
              </div>
            );
          })}
        </section>
      )}

      <AdSlot seed="community" />

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <Trophy size={18} style={{ color: 'var(--c-accent)' }} />
          <h2 style={{ fontSize: '1.1rem' }}>Leaderboard</h2>
          <span className="pb-muted" style={{ fontSize: '0.76rem' }}>
            {contributors.length} {contributors.length === 1 ? 'person' : 'people'}
          </span>
        </div>

        {contributors.length === 0 ? (
          <p className="pb-muted" style={{ padding: '24px 0', textAlign: 'center', lineHeight: 1.7 }}>
            {loading
              ? 'Asking Firestore who has written something…'
              : 'Nobody here yet. Publish a speech and the first name on this board is yours.'}
          </p>
        ) : (
          <div>
            {contributors.map((person, index) => (
              <div
                key={person.uid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 4px',
                  borderBottom: index === contributors.length - 1 ? 'none' : '1px solid var(--c-line-soft)',
                  flexWrap: 'wrap',
                }}
              >
                <span className="pb-mono pb-muted" style={{ width: 30, fontSize: '0.85rem' }}>
                  #{index + 1}
                </span>
                <div style={{ flex: '1 1 170px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{person.name}</div>
                  <div className="pb-muted" style={{ fontSize: '0.74rem' }}>
                    {person.posts} {person.posts === 1 ? 'post' : 'posts'} ·{' '}
                    {formatCount(person.likesReceived)} likes · {formatCount(person.dislikesReceived)}{' '}
                    dislikes
                  </div>
                </div>
                <span className="pb-chip pb-chip-accent">
                  <Medal size={11} /> {person.points} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Open mic — the old "creative creator" wall, in its honest form. */}
      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Feather size={18} style={{ color: 'var(--c-accent)' }} />
          <h2 style={{ fontSize: '1.1rem' }}>Open mic</h2>
        </div>
        <p className="pb-muted" style={{ fontSize: '0.84rem', marginBottom: 16, lineHeight: 1.65 }}>
          A place for the half-formed thought: a line that worked, a lesson from a room that went
          badly, a question you cannot answer yet.
        </p>

        {user ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            <input
              className="pb-input"
              placeholder="A title, however small"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Note title"
              maxLength={120}
            />
            <textarea
              className="pb-textarea"
              placeholder="Say the thing…"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              style={{ minHeight: 120 }}
              aria-label="Note"
              maxLength={4000}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="pb-btn pb-btn-primary" onClick={submit} disabled={posting}>
                {posting ? <span className="pb-spinner" /> : <Feather size={15} />} Pin it to the wall
              </button>
              <span className="pb-muted" style={{ fontSize: '0.76rem' }}>
                Posting as {user.displayName ?? user.email}
              </span>
            </div>
          </div>
        ) : (
          <div className="pb-well" style={{ padding: 16, marginBottom: 22, fontSize: '0.88rem' }}>
            You can read the open mic without an account.{' '}
            <button
              type="button"
              style={{ color: 'var(--c-accent)', fontWeight: 600 }}
              onClick={() => useUi.getState().openSignIn('Sign in to pin a note to the open mic.')}
            >
              Sign in
            </button>{' '}
            to add one.
          </div>
        )}

        {posts.length === 0 ? (
          <p className="pb-muted" style={{ padding: '18px 0', textAlign: 'center' }}>
            {loading ? 'Loading notes…' : 'The wall is blank. Yours would be the first.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map((post) => (
              <article
                key={post.id}
                className="pb-panel-flat"
                style={{ padding: '14px 16px', position: 'relative' }}
              >
                <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>{post.title}</h3>
                <p className="pb-soft" style={{ fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {post.body}
                </p>
                <div
                  className="pb-muted"
                  style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: '0.74rem', alignItems: 'center' }}
                >
                  <span>{post.author}</span>
                  <span>{post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}</span>
                  {(role === 'admin' || role === 'owner') && (
                    <button
                      type="button"
                      onClick={() => {
                        void deletePost(post.id)
                          .then(() => {
                            refresh();
                            toast('Note removed', 'success');
                          })
                          .catch((err: unknown) => toast((err as Error)?.message ?? 'Could not remove it.', 'error'));
                      }}
                      style={{ marginLeft: 'auto', color: 'var(--c-bad)' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
