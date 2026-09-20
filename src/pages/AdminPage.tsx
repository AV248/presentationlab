import { useCallback, useEffect, useState } from 'react';
import {
  Crown,
  KeyRound,
  Megaphone,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Users,
  FileText,
} from 'lucide-react';
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
import {
  createAd,
  deleteAd,
  fetchAllAds,
  updateAd,
  type Ad,
  type AdInput,
} from '../services/ads';
import { FIREBASE_ENABLED } from '../services/firebase';
import { formatCount } from '../lib/text';

/**
 * The workspace for role-holders. It is deliberately unremarkable from
 * outside: not linked in public navigation, excluded from the sitemap and
 * robots, and marked noindex. Everything here happens under an account that
 * already holds the 'admin' or 'owner' role in the admins collection.
 */

type Tab = 'overview' | 'ads' | 'people' | 'content';

const EMPTY_AD: AdInput = { title: '', body: '', url: '', cta: 'Learn more', weight: 1, active: true };

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdInput>(EMPTY_AD);
  const [saving, setSaving] = useState(false);

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
  /* ad desk                                                        */
  /* ------------------------------------------------------------ */

  const startNew = () => {
    setEditingId(null);
    setDraft(EMPTY_AD);
  };

  const startEdit = (ad: Ad) => {
    setEditingId(ad.id);
    setDraft({ title: ad.title, body: ad.body, url: ad.url, cta: ad.cta, weight: ad.weight, active: ad.active });
  };

  const saveAd = () => {
    if (!draft.title.trim() || !draft.url.trim()) {
      toast('An ad needs at least a title and a link.', 'warn');
      return;
    }
    setSaving(true);
    const action = editingId ? updateAd(editingId, draft) : createAd(draft).then(() => undefined);
    void action
      .then(async () => {
        toast(editingId ? 'Ad updated' : 'Ad created', 'success');
        setEditingId(null);
        setDraft(EMPTY_AD);
        setAds(await fetchAllAds());
      })
      .catch((error: unknown) => toast((error as Error)?.message ?? 'Save failed', 'error'))
      .finally(() => setSaving(false));
  };

  const toggleAd = (ad: Ad) => {
    void updateAd(ad.id, { active: !ad.active })
      .then(async () => setAds(await fetchAllAds()))
      .catch((error: unknown) => toast((error as Error)?.message ?? 'Update failed', 'error'));
  };

  const removeAd = (ad: Ad) => {
    if (!window.confirm(`Delete "${ad.title}" for good?`)) return;
    void deleteAd(ad.id)
      .then(async () => {
        toast('Ad deleted', 'success');
        setAds(await fetchAllAds());
      })
      .catch((error: unknown) => toast((error as Error)?.message ?? 'Delete failed', 'error'));
  };

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
          <Stat label="Ads (active)" value={`${ads.filter((ad) => ad.active).length} / ${ads.length}`} />
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
            <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Megaphone size={16} /> {editingId ? 'Edit ad' : 'New ad'}
            </h2>
            <p className="pb-muted" style={{ fontSize: '0.8rem', marginBottom: 12 }}>
              Ads appear as quiet, labelled sponsored cards inside the library, reader and
              community pages. Keep them honest: a title, a short pitch, one link.
            </p>
            {adsError && (
              <p className="pb-muted" style={{ fontSize: '0.8rem', marginBottom: 10 }}>
                {adsError} (Check Firestore rules: <span className="pb-mono">ads</span> needs
                public read, admin write.)
              </p>
            )}
            <div className="pb-form-grid">
              <label>
                <span>Title</span>
                <input
                  className="pb-input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="What the offer is"
                />
              </label>
              <label>
                <span>Link (https://… or /internal-path)</span>
                <input
                  className="pb-input"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://example.com/landing"
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span>Body (one or two sentences)</span>
                <textarea
                  className="pb-input"
                  rows={2}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="Why someone should care, in plain language."
                />
              </label>
              <label>
                <span>Button label</span>
                <input
                  className="pb-input"
                  value={draft.cta}
                  onChange={(e) => setDraft({ ...draft, cta: e.target.value })}
                />
              </label>
              <label>
                <span>Weight (higher = shown more)</span>
                <input
                  className="pb-input"
                  type="number"
                  min={1}
                  max={10}
                  value={draft.weight}
                  onChange={(e) => setDraft({ ...draft, weight: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end' }}>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                <span>Active</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="pb-btn pb-btn-primary pb-btn-sm" onClick={saveAd} disabled={saving}>
                <Plus size={14} /> {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create ad'}
              </button>
              {(editingId || draft !== EMPTY_AD) && (
                <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={startNew}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ads.map((ad) => (
              <div key={ad.id} className="pb-panel-flat" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {ad.title}{' '}
                      {!ad.active && <span className="pb-stamp" style={{ marginLeft: 6 }}>paused</span>}
                    </div>
                    <div className="pb-muted" style={{ fontSize: '0.76rem', marginTop: 2 }}>{ad.url}</div>
                    {ad.body && <div className="pb-soft" style={{ fontSize: '0.82rem', marginTop: 6, lineHeight: 1.55 }}>{ad.body}</div>}
                  </div>
                  <button type="button" className="pb-btn pb-btn-sm" onClick={() => startEdit(ad)}>
                    Edit
                  </button>
                  <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => toggleAd(ad)}>
                    {ad.active ? 'Pause' : 'Activate'}
                  </button>
                  <button type="button" className="pb-icon-btn" onClick={() => removeAd(ad)} aria-label={`Delete ${ad.title}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {!ads.length && !adsError && (
              <p className="pb-muted" style={{ fontSize: '0.85rem' }}>
                No ads yet — until the first one is created, the site shows its own house
                promos instead.
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
