import { useCallback, useEffect, useState } from 'react';
import { Crown, KeyRound, Lock, Megaphone, Plus, RefreshCw, Save, Shield, Trash2, Users, FileText } from 'lucide-react';
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
import { fetchAllAds, clearAdCache, type Ad } from '../services/ads';
import {
  assignHandle,
  clearAdminPassword,
  deleteAd,
  fetchGateState,
  isAdminUnlocked,
  listHandles,
  lockAdmin,
  markAdminUnlocked,
  releaseHandle,
  reserveHandle,
  saveAd,
  setAdminPassword,
  verifyAdminPassword,
  type AdDraft,
  type HandleRow,
} from '../services/admin';
import { validateUsername } from '../lib/identity';
import { FESTIVALS } from '../data/festivals';
import { fetchSiteFestival, setSiteFestival } from '../services/profiles';
import { BACKEND_ENABLED } from '../services/backend';
import { EnvCheckPanel } from '../components/EnvCheckPanel';
import { ADS_ENABLED } from '../services/ads';
import { formatCount } from '../lib/text';

/**
 * The workspace for role-holders. It is deliberately unremarkable from
 * outside: not linked in public navigation, excluded from the sitemap and
 * robots, and marked noindex. Everything here happens under an account that
 * already holds the 'admin' or 'owner' role in the admins collection.
 */

type Tab = 'overview' | 'ads' | 'people' | 'content' | 'site' | 'setup';


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
  const [unlocked, setUnlocked] = useState(isAdminUnlocked);
  const [gate, setGate] = useState<{ configured: boolean } | null>(null);
  const [handles, setHandles] = useState<HandleRow[]>([]);

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

  useEffect(() => {
    if (!isAdmin) return;
    void fetchGateState().then(setGate);
    void listHandles().then(setHandles).catch(() => setHandles([]));
  }, [isAdmin]);

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

  // Anyone without a role is told nothing. The workspace is not advertised,
  // linked, indexed or — now — reachable: a role-holder's door, and a blank
  // wall for everybody else.
  if (!isAdmin) {
    return (
      <div className="pb-page pb-narrow" style={{ textAlign: 'center' }}>
        <h1 className="pb-page-title">Nothing here</h1>
        <p className="pb-muted" style={{ lineHeight: 1.7 }}>
          This page does not exist. If you were looking for your own corner of the site, it is at{' '}
          <span className="pb-mono">/your-username</span>.
        </p>
      </div>
    );
  }

  // The second lock. A password the role-holder set, asked once per browser
  // session. It is not the security boundary — the database's row policies are,
  // and they refuse writes from anyone without the role — it is a lock on the
  // door for the borrowed-laptop case.
  if (unlocked === false && gate?.configured !== false) {
    if (gate === null) {
      return (
        <div className="pb-page pb-narrow">
          <p className="pb-muted">Opening the workspace…</p>
        </div>
      );
    }
    return <AdminGate onUnlocked={() => setUnlocked(true)} />;
  }

  if (!BACKEND_ENABLED || !user) {
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
            ['site', 'Site theme'],
            ['setup', 'Setup & environment'],
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
          <AdsEditor ads={ads} onChanged={() => { clearAdCache(); void load(); }} />
          <div className="pb-panel" style={{ padding: '16px 18px', marginBottom: 14 }}>
            <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Megaphone size={16} /> Live inventory
            </h2>
            <p className="pb-muted" style={{ fontSize: '0.8rem', lineHeight: 1.7, marginBottom: 10 }}>
              Sponsored cards are kept in the <span className="pb-mono">ads</span> table beside
              everything else this site owns, and every change made here is live within a minute
              (the browser caches the list). Only a role-holder can write to it; everybody can
              read it, which is exactly what showing an ad to a visitor requires.
            </p>
            <p className="pb-muted" style={{ fontSize: '0.78rem', lineHeight: 1.7 }}>
              An ad needs <span className="pb-mono">Title</span> and{' '}
              <span className="pb-mono">Content</span>. The image and the link are each optional —
              an ad may be words alone, or words that go nowhere. Any URL that is given is
              scheme-checked before it reaches the page, so a card carrying a{' '}
              <span className="pb-mono">javascript:</span> link is skipped rather than rendered.
            </p>
            {!ADS_ENABLED && (
              <p className="pb-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
                No database is configured on this installation, so the site is showing its own
                house promos instead of reading <span className="pb-mono">ads</span>.
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

      {tab === 'site' && <SiteThemeTab isOwner={isOwner} />}

      {tab === 'setup' && (
        <PasswordPanel onLock={() => { lockAdmin(); setUnlocked(false); }} />)}

      {tab === 'setup' && (
        <EnvCheckPanel />
      )}

      {tab === 'people' && (
        <section>
          <HandlesPanel
            handles={handles}
            users={users}
            onChanged={() => { void listHandles().then(setHandles).catch(() => undefined); }}
          />
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

function SiteThemeTab({ isOwner }: { isOwner: boolean }) {
  const toast = useUi((s) => s.toast);
  const [current, setCurrent] = useState<string>('none');
  useEffect(() => { void fetchSiteFestival().then((id) => setCurrent(id ?? 'none')); }, []);
  return (
    <section className="pb-panel" style={{ padding: '16px 18px' }}>
      <h2 style={{ fontSize: '1rem', marginBottom: 6 }}>Festival theme for the whole site</h2>
      <p className="pb-muted" style={{ fontSize: '0.84rem', marginBottom: 14 }}>{isOwner ? 'Stored as site_settings.theme — every visitor sees it on their next visit. People may still personalise on their own device.' : 'Only the owner can change the site theme.'}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FESTIVALS.map((f) => (
          <button key={f.id} type="button" disabled={!isOwner} className={`pb-chip ${current === f.id ? 'pb-chip-accent' : ''}`} onClick={() => { void setSiteFestival(f.id).then(() => { setCurrent(f.id); toast(`Site theme: ${f.name}`, 'success'); }).catch((e: Error) => toast(e.message, 'error')); }}>{f.emoji} {f.name}</button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The password prompt                                                  */
/* ------------------------------------------------------------------ */

function AdminGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyAdminPassword(value);
      if (!ok) {
        setError('That is not the password.');
        return;
      }
      markAdminUnlocked();
      onUnlocked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-page pb-narrow">
      <form className="pb-panel" style={{ padding: '22px 24px' }} onSubmit={submit}>
        <h1 className="pb-page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lock size={18} /> The workspace is locked
        </h1>
        <p className="pb-muted" style={{ fontSize: '0.85rem', lineHeight: 1.7, marginBottom: 14 }}>
          Your account has the role. The password is the second lock you set for this page.
        </p>
        <label className="pb-label" htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          className="pb-input"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <p className="pb-muted" style={{ color: 'var(--c-bad, #c0392b)', fontSize: '0.8rem', marginTop: 8 }}>
            {error}
          </p>
        )}
        <div style={{ marginTop: 14 }}>
          <button className="pb-btn" type="submit" disabled={busy || !value}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ads: create, edit, delete                                            */
/* ------------------------------------------------------------------ */

const EMPTY_AD: AdDraft = {
  Title: '', DescriptionPreview: '', Content: '', ImageURL: '', RedirectURL: '', weight: 1,
};

function AdsEditor({ ads, onChanged }: { ads: Ad[]; onChanged: () => void }) {
  const toast = useUi((s) => s.toast);
  const [draft, setDraft] = useState<AdDraft>(EMPTY_AD);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (key: keyof AdDraft) => ({
    value: String(draft[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft({ ...draft, [key]: key === 'weight' ? Number(e.target.value) : e.target.value }),
  });

  const beginEdit = (ad: Ad) => {
    setEditingId(ad.id);
    setDraft({
      Title: ad.title,
      DescriptionPreview: ad.body ?? '',
      Content: ad.content ?? '',
      ImageURL: ad.imageUrl ?? '',
      RedirectURL: ad.url ?? '',
      weight: ad.weight ?? 1,
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await saveAd(editingId, draft);
      toast(editingId ? 'Ad updated — it is live now.' : 'Ad created — it is live now.', 'success');
      setDraft(EMPTY_AD);
      setEditingId(null);
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ad: Ad) => {
    if (!window.confirm(`Delete the ad "${ad.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteAd(ad.id);
      toast('Ad deleted.', 'success');
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-panel" style={{ padding: '18px 20px', marginBottom: 14 }}>
      <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Plus size={16} /> {editingId ? 'Edit this ad' : 'Create an ad'}
      </h2>
      <p className="pb-muted" style={{ fontSize: '0.8rem', lineHeight: 1.7, marginBottom: 12 }}>
        Saved straight to <span className="pb-mono">servingads</span> and live on the next page view —
        the browser cache is cleared for you. Only <span className="pb-mono">Title</span> is required;
        image and destination are optional, and both must be{' '}
        <span className="pb-mono">https://</span> if set.
      </p>
      <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <div>
          <label className="pb-label" htmlFor="ad-title">Title *</label>
          <input id="ad-title" className="pb-input" {...field('Title')} placeholder="What the card says" />
        </div>
        <div>
          <label className="pb-label" htmlFor="ad-preview">One-line teaser</label>
          <input id="ad-preview" className="pb-input" {...field('DescriptionPreview')} placeholder="Shown under the title" />
        </div>
        <div>
          <label className="pb-label" htmlFor="ad-body">Body</label>
          <textarea id="ad-body" className="pb-textarea" rows={3} {...field('Content')} placeholder="The full copy, for the larger card" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label className="pb-label" htmlFor="ad-image">Image URL</label>
            <input id="ad-image" className="pb-input" {...field('ImageURL')} placeholder="https://…" />
          </div>
          <div>
            <label className="pb-label" htmlFor="ad-url">Redirect link</label>
            <input id="ad-url" className="pb-input" {...field('RedirectURL')} placeholder="https://…" />
          </div>
          <div>
            <label className="pb-label" htmlFor="ad-weight">Weight (1–10)</label>
            <input id="ad-weight" className="pb-input" type="number" min={1} max={10} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pb-btn" type="submit" disabled={busy || !draft.Title.trim()}>
            <Save size={14} /> {editingId ? 'Save changes' : 'Create ad'}
          </button>
          {editingId && (
            <button className="pb-btn pb-btn-ghost" type="button" onClick={() => { setEditingId(null); setDraft(EMPTY_AD); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {ads.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: '0.82rem' }}>Edit or delete</strong>
          {ads.map((ad) => (
            <div key={ad.id} className="pb-panel-flat" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: '0.85rem' }}>{ad.title}</span>
              <button className="pb-btn pb-btn-sm pb-btn-ghost" type="button" onClick={() => beginEdit(ad)} disabled={busy}>Edit</button>
              <button className="pb-btn pb-btn-sm pb-btn-ghost" type="button" onClick={() => void remove(ad)} disabled={busy} aria-label={`Delete ${ad.title}`}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Handles: reserve, give, take back                                    */
/* ------------------------------------------------------------------ */

function HandlesPanel({
  handles,
  users,
  onChanged,
}: {
  handles: HandleRow[];
  users: Awaited<ReturnType<typeof fetchUsers>>;
  onChanged: () => void;
}) {
  const toast = useUi((s) => s.toast);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [forUid, setForUid] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = validateUsername(name);

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done, 'success');
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-panel" style={{ padding: '18px 20px', marginBottom: 14 }}>
      <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Crown size={16} /> Handles
      </h2>
      <p className="pb-muted" style={{ fontSize: '0.8rem', lineHeight: 1.7, marginBottom: 12 }}>
        Reserve a username so nobody else can take it, or hand one to somebody who is already
        signed up — it becomes theirs, and their profile says so immediately. A reserved name is
        claimable only by the person it was reserved for.
      </p>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <label className="pb-label" htmlFor="handle-name">Username</label>
          <input id="handle-name" className="pb-input" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="reserved_name" autoComplete="off" />
          {name && !valid.ok && (
            <p className="pb-muted" style={{ fontSize: '0.74rem', marginTop: 4 }}>{valid.error}</p>
          )}
        </div>
        <div>
          <label className="pb-label" htmlFor="handle-note">Note (optional)</label>
          <input id="handle-note" className="pb-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it is held" />
        </div>
        <div>
          <label className="pb-label" htmlFor="handle-person">Give to</label>
          <select id="handle-person" className="pb-input" value={forUid} onChange={(e) => setForUid(e.target.value)}>
            <option value="">— nobody yet (just reserve) —</option>
            {users.map((person) => (
              <option key={person.uid} value={person.uid}>
                {person.displayName || person.email || person.uid}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          className="pb-btn"
          type="button"
          disabled={busy || !valid.ok}
          onClick={() => {
            const person = users.find((u) => u.uid === forUid);
            void act(
              () => (person
                ? assignHandle(valid.username, { uid: person.uid, email: person.email ?? '', displayName: person.displayName ?? '' })
                : reserveHandle(valid.username, { note })),
              person ? `@${valid.username} is now ${person.displayName || person.email}'s.` : `@${valid.username} reserved.`,
            ).then(() => { setName(''); setNote(''); setForUid(''); });
          }}
        >
          {forUid ? 'Give this handle' : 'Reserve this handle'}
        </button>
      </div>

      {handles.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: '0.82rem' }}>All handles ({handles.length})</strong>
          {handles.map((row) => (
            <div key={row.username} className="pb-panel-flat" style={{ padding: '8px 10px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="pb-mono" style={{ fontSize: '0.82rem' }}>@{row.username}</span>
              <span className="pb-muted" style={{ fontSize: '0.76rem', flex: 1, minWidth: 120 }}>
                {row.uid ? `held by ${row.uid}` : row.reserved ? `reserved${row.email ? ` for ${row.email}` : ''}${row.note ? ` — ${row.note}` : ''}` : 'unassigned'}
              </span>
              <button
                className="pb-btn pb-btn-sm pb-btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Release @${row.username}? The name becomes available to anybody.`)) return;
                  void act(() => releaseHandle(row.username), `@${row.username} released.`);
                }}
              >
                Release
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The password itself                                                  */
/* ------------------------------------------------------------------ */

function PasswordPanel({ onLock }: { onLock: () => void }) {
  const toast = useUi((s) => s.toast);
  const [state, setState] = useState<{ configured: boolean } | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchGateState().then(setState);
  }, []);

  return (
    <section className="pb-panel" style={{ padding: '18px 20px', marginBottom: 14 }}>
      <h2 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <KeyRound size={16} /> The password on this page
      </h2>
      <p className="pb-muted" style={{ fontSize: '0.8rem', lineHeight: 1.7, marginBottom: 12 }}>
        {state?.configured
          ? 'A password is required every time this page is opened in a new browser session. It is stored as a PBKDF2 hash, never as text.'
          : 'No password is set. Set one and this page will ask for it before showing anything.'}
        {' '}Your role is still what protects the data — the rules refuse writes without it.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label className="pb-label" htmlFor="new-admin-password">
            {state?.configured ? 'New password' : 'Set a password'}
          </label>
          <input
            id="new-admin-password"
            className="pb-input"
            type="password"
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <button
          className="pb-btn"
          type="button"
          disabled={busy || value.length < 8}
          onClick={() => {
            setBusy(true);
            void setAdminPassword(value)
              .then(() => { setValue(''); setState({ configured: true }); toast('Password set.', 'success'); })
              .catch((e) => toast((e as Error).message, 'error'))
              .finally(() => setBusy(false));
          }}
        >
          Save password
        </button>
        <button className="pb-btn pb-btn-ghost" type="button" onClick={onLock}>Lock now</button>
        {state?.configured && (
          <button
            className="pb-btn pb-btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('Remove the password? The page will open for your account without asking.')) return;
              setBusy(true);
              void clearAdminPassword()
                .then(() => { setState({ configured: false }); toast('Password removed.', 'success'); })
                .catch((e) => toast((e as Error).message, 'error'))
                .finally(() => setBusy(false));
            }}
          >
            Remove
          </button>
        )}
      </div>
    </section>
  );
}
