import { useCallback, useEffect, useState } from 'react';
import { Crown, KeyRound, Megaphone, RefreshCw, Shield, Users, FileText } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { usePageMeta } from '../lib/seo';
import {
  bootstrapOwner,
  deletePost,
  deleteSpeechDoc,
  fetchPosts,
  fetchSpeeches,
  fetchUsers,
  setRole,
  type CloudSpeech,
  type Post,
} from '../services/data';
import { fetchAllAds, type Ad } from '../services/ads';
import { FIREBASE_ENABLED } from '../services/firebase';
import { ADS_ENABLED } from '../services/firebaseAds';
import { formatCount } from '../lib/text';

/**
 * The workspace for role-holders. It is deliberately unremarkable from
 * outside: not linked in public navigation, excluded from the sitemap and
 * robots, and marked noindex. Everything here happens under an account that
 * already holds the 'admin' or 'owner' role in the admins collection.
 */

type Tab = 'overview' | 'ads' | 'people' | 'content';


export function AdminPage() {
  usePageMeta('Workspace · Presentation Buddy', {
    description: 'Sign-in workspace for role-holders.',
    robots: 'noindex, nofollow',
  });

  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const refreshRole = useAuth((s) => s.refreshRole);
  const openSignIn = useUi((s) => s.openSignIn);
  const toast = useUi((s) => s.toast);

  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);

  const [speeches, setSpeeches] = useState<CloudSpeech[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof fetchUsers>>>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [adsError, setAdsError] = useState<string | null>(null);

  const isAdmin = role === 'admin' || role === 'owner';
  const isOwner = role === 'owner';

  const load = useCallback(async () => {
    setLoading(true);
    const [speechesResult, postsResult, usersResult] = await Promise.all([
      fetchSpeeches(),
      fetchPosts(),
      fetchUsers(),
    ]);
    setSpeeches(speechesResult.items);
    setPosts(postsResult);
    setUsers(usersResult);
    try {
      setAds(await fetchAllAds());
      setAdsError(null);
    } catch (error) {
      setAds([]);
      setAdsError((error as Error)?.message ?? 'The ad desk is unreachable.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  /* ------------------------------------------------------------ */
  /* gates                                                          */
  /* ------------------------------------------------------------ */

  if (!ready) {
    return (
      <div className="pb-page pb-narrow">
        <p className="pb-muted">Checking your sign-in…</p>
      </div>
    );
  }

  if (!FIREBASE_ENABLED || !user) {
    return (
      <div className="pb-page pb-narrow">
        <section className="pb-panel" style={{ padding: '22px 24px' }}>
          <h1 className="pb-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyRound size={20} style={{ color: 'var(--c-accent)' }} /> Workspace
          </h1>
          <p className="pb-soft" style={{ fontSize: '0.92rem', lineHeight: 1.7, margin: '10px 0 16px' }}>
            This is the workspace for the people who run Presentation Buddy. It is reached
            with an account that already holds a role — nothing here is public.
          </p>
          <button
            type="button"
            className="pb-btn pb-btn-primary"
            onClick={() => openSignIn('Sign in to reach the workspace.')}
          >
            Sign in
          </button>
        </section>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="pb-page pb-narrow">
        <section className="pb-panel" style={{ padding: '22px 24px' }}>
          <h1 className="pb-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={20} style={{ color: 'var(--c-accent)' }} /> Workspace
          </h1>
          <p className="pb-soft" style={{ fontSize: '0.92rem', lineHeight: 1.7, margin: '10px 0 14px' }}>
            You are signed in as {user.email}. This account does not hold a role yet. Roles
            are granted by the owner from their own workspace; there is nothing to apply for
            here.
          </p>
          <details style={{ fontSize: '0.85rem' }}>
            <summary className="pb-muted" style={{ cursor: 'pointer' }}>
              First run? Claim ownership once
            </summary>
            <p className="pb-muted" style={{ lineHeight: 1.7, margin: '8px 0 10px' }}>
              On a brand-new installation, the first signed-in account can write itself into
              the <span className="pb-mono">admins</span> collection as owner. Do this once,
              on your own account, then never again — afterwards all access is granted from
              inside this workspace.
            </p>
            <button
              type="button"
              className="pb-btn pb-btn-sm"
              onClick={() => {
                if (!window.confirm('Make this account the owner? Only do this once, on your own account.')) return;
                void bootstrapOwner(user.uid, user.email, user.displayName)
                  .then(() => {
                    void refreshRole();
                    toast('You are now the owner', 'success');
                  })
                  .catch((error: unknown) =>
                    toast((error as Error)?.message ?? 'Could not claim ownership', 'error'),
                  );
              }}
            >
              <Crown size={14} /> Claim owner access
            </button>
          </details>
        </section>
      </div>
    );
  }

  /* ------------------------------------------------------------ */
  /* view                                                           */
  /* ------------------------------------------------------------ */

  return (
    <div className="pb-page pb-narrow">
      <header className="pb-page-head">
        <span className="pb-eyebrow">{isOwner ? 'Owner' : 'Admin'} workspace</span>
        <h1 className="pb-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={22} style={{ color: 'var(--c-accent)' }} /> Workspace
        </h1>
        <p className="pb-page-sub">
          Signed in as {user.email}. Everything here is invisible to the public site.
        </p>
      </header>

      <div className="pb-tabs" role="tablist" aria-label="Workspace sections">
        {(
          [
            ['overview', 'Overview'],
            ['ads', 'Ad desk'],
            ['people', isOwner ? 'People & roles' : 'People'],
            ['content', 'Published content'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`pb-chip ${tab === id ? 'pb-chip-accent' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" className="pb-btn pb-btn-sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} /> {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      {tab === 'overview' && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Stat label="Published speeches" value={formatCount(speeches.length)} />
          <Stat label="Open-mic notes" value={formatCount(posts.length)} />
          <Stat label="Accounts" value={formatCount(users.length)} />
          <Stat label="Ads serving" value={formatCount(ads.length)} />
          <div className="pb-panel" style={{ gridColumn: '1 / -1', padding: '14px 16px' }}>
            <p className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.7, margin: 0 }}>
              Reactions, shares and views move only from real, signed-in people — the counters
              below are the same ones visitors see. Nothing on the public site reveals who
              holds a role; this workspace is the only place it shows.
            </p>
          </div>
        </section>
      )}

      {tab === 'ads' && (
        <section>
          <div className="pb-panel" style={{ padding: '16px 18px', marginBottom: 14 }}>
            <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Megaphone size={16} /> Live inventory
            </h2>
            <p className="pb-muted" style={{ fontSize: '0.8rem', lineHeight: 1.7, marginBottom: 10 }}>
              Sponsored cards are served from the <span className="pb-mono">servingads</span>{' '}
              collection of a <strong>separate</strong> Firebase project (
              <span className="pb-mono">a-a-v-r-i-t</span>). This app deliberately holds no write
              credential for it, so this list is read-only — add, edit or pause ads in that
              project's own Firebase console.
            </p>
            <p className="pb-muted" style={{ fontSize: '0.78rem', lineHeight: 1.7 }}>
              Every document needs <span className="pb-mono">Title</span>,{' '}
              <span className="pb-mono">Content</span>, <span className="pb-mono">ImageURL</span>,{' '}
              <span className="pb-mono">DescriptionPreview</span> and{' '}
              <span className="pb-mono">RedirectURL</span>. Both URLs are scheme-checked before
              they reach the page, so a document carrying a{' '}
              <span className="pb-mono">javascript:</span> link is skipped rather than rendered.
            </p>
            {!ADS_ENABLED && (
              <p className="pb-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
                The ads project is not configured on this installation (
                <span className="pb-mono">VITE_ADS_FIREBASE_*</span>), so the site is showing its
                own house promos.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ads.map((ad) => (
              <div
                key={ad.id}
                className="pb-panel-flat"
                style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}
              >
                {ad.imageUrl && (
                  <img
                    src={ad.imageUrl}
                    alt=""
                    width={72}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    style={{
                      width: 72,
                      height: 40,
                      objectFit: 'cover',
                      borderRadius: 6,
                      flex: '0 0 auto',
                      border: '1px solid var(--c-line)',
                    }}
                  />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ad.title}</div>
                  <div
                    className="pb-muted"
                    style={{ fontSize: '0.74rem', marginTop: 2, wordBreak: 'break-all' }}
                  >
                    {ad.url}
                  </div>
                  {ad.body && (
                    <div className="pb-soft" style={{ fontSize: '0.82rem', marginTop: 6, lineHeight: 1.55 }}>
                      {ad.body}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!ads.length && (
              <p className="pb-muted" style={{ fontSize: '0.85rem' }}>
                No ad documents were returned — until there are some, the site shows its own house
                promos instead.
              </p>
            )}
            {adsError && (
              <p className="pb-muted" style={{ fontSize: '0.8rem' }}>
                {adsError}
              </p>
            )}
          </div>
        </section>
      )}

      {tab === 'people' && (
        <section>
          <p className="pb-muted" style={{ fontSize: '0.84rem', marginBottom: 12, lineHeight: 1.7 }}>
            {isOwner
              ? 'Grant or withdraw the admin role. People keep their library and drafts either way — a role only opens this workspace.'
              : 'Only the owner can change roles. You can see the current list.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {users.map((person) => (
              <div key={person.uid} className="pb-panel-flat" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{person.displayName ?? 'No name given'}</div>
                  <div className="pb-muted" style={{ fontSize: '0.72rem' }}>
                    {person.email} · {person.providerId ?? 'unknown provider'}
                  </div>
                </div>
                {isOwner && person.uid !== user.uid && (
                  <>
                    <button
                      type="button"
                      className="pb-btn pb-btn-sm pb-btn-ghost"
                      onClick={() => {
                        void setRole(person.uid, 'admin')
                          .then(() => toast('Made an admin', 'success'))
                          .catch((error: unknown) => toast((error as Error)?.message ?? 'Failed', 'error'));
                      }}
                    >
                      Make admin
                    </button>
                    <button
                      type="button"
                      className="pb-btn pb-btn-sm pb-btn-ghost"
                      onClick={() => {
                        void setRole(person.uid, 'none')
                          .then(() => toast('Role removed', 'success'))
                          .catch((error: unknown) => toast((error as Error)?.message ?? 'Failed', 'error'));
                      }}
                    >
                      Remove role
                    </button>
                  </>
                )}
              </div>
            ))}
            {!users.length && <p className="pb-muted" style={{ fontSize: '0.82rem' }}>No accounts have signed in yet.</p>}
          </div>
        </section>
      )}

      {tab === 'content' && (
        <section>
          <h3 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
            <FileText size={15} /> Published speeches ({speeches.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
            {speeches.map((speech) => (
              <div key={speech.id} className="pb-panel-flat" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{speech.title}</div>
                  <div className="pb-muted" style={{ fontSize: '0.72rem' }}>
                    {speech.author} · {formatCount(speech.views)} views · {formatCount(speech.likes)} likes
                  </div>
                </div>
                <button
                  type="button"
                  className="pb-btn pb-btn-sm pb-btn-danger"
                  onClick={() => {
                    if (!window.confirm(`Remove "${speech.title}" from the shared library?`)) return;
                    void deleteSpeechDoc(speech.id)
                      .then(() => {
                        void load();
                        toast('Speech removed', 'success');
                      })
                      .catch((error: unknown) => toast((error as Error)?.message ?? 'Failed', 'error'));
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {!speeches.length && <p className="pb-muted" style={{ fontSize: '0.82rem' }}>Nothing published yet.</p>}
          </div>

          <h3 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
            <Users size={15} /> Open-mic notes ({posts.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {posts.map((post) => (
              <div key={post.id} className="pb-panel-flat" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{post.title}</div>
                  <div className="pb-muted" style={{ fontSize: '0.72rem' }}>
                    {post.author} · {post.body.slice(0, 80)}…
                  </div>
                </div>
                <button
                  type="button"
                  className="pb-btn pb-btn-sm pb-btn-danger"
                  onClick={() => {
                    void deletePost(post.id)
                      .then(() => {
                        void load();
                        toast('Note removed', 'success');
                      })
                      .catch((error: unknown) => toast((error as Error)?.message ?? 'Failed', 'error'));
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {!posts.length && <p className="pb-muted" style={{ fontSize: '0.82rem' }}>No notes yet.</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="pb-well" style={{ padding: '12px 14px' }}>
      <div style={{ fontFamily: 'var(--x-font-display)', fontWeight: 700, fontSize: '1.15rem' }}>{value}</div>
      <div className="pb-muted" style={{ fontSize: '0.72rem' }}>{label}</div>
    </div>
  );
}
