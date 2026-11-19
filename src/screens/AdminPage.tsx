'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Bell, Check, Crown, ExternalLink, KeyRound, Lock, Megaphone, Plus, RefreshCw, Save, Search, Shield, Trash2, Upload, Users, FileText, X } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { usePageMeta } from '../lib/usePageMeta';
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
  createOfficialAccount,
  fetchArrivalReview,
  fetchModerationItems,
  listBadgeAssignments,
  listBadgeAudit,
  listOfficialAccounts,
  publishSourceCandidate,
  reviewSourceCandidate,
  setBadge,
  setModeration,
  setOfficialAccountActive,
  stageSourceCandidate,
  updateProfileAsAdmin,
  type AdminBadge,
  type AdminProfileDetails,
  type ArrivalReviewItem,
  type BadgeAssignment,
  type BadgeAuditRecord,
  type ModerationItem,
  type OfficialAccount,
  type OfficialAccountDraft,
} from '../services/admin';
import { fetchSiteNotice, saveSiteNotice, type PublicSiteNotice } from '../services/siteNotice';
import { searchWebSpeeches, type WebSpeech } from '../services/webSources';
import { validateUsername } from '../lib/identity';
import { FESTIVALS } from '../data/festivals';
import { fetchSiteFestival, setSiteFestival } from '../services/profiles';
import { BACKEND_ENABLED } from '../services/backend';
import { EnvCheckPanel } from '../components/EnvCheckPanel';
import { ADS_ENABLED } from '../services/ads';
import { formatCount } from '../lib/text';
import { AdminInboxPanel } from './AdminInboxPanel';

/**
 * The workspace for role-holders. It is deliberately unremarkable from
 * outside: not linked in public navigation, excluded from the sitemap and
 * robots, and marked noindex. Everything here happens under an account that
 * already holds the 'admin' or 'owner' role in the admins collection.
 */

type Tab = 'overview' | 'inbox' | 'ads' | 'people' | 'badges' | 'sources' | 'moderation' | 'notice' | 'content' | 'site' | 'setup';


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
  // Session storage is browser-only; initialize identically for SSR and hydration.
  const [unlocked, setUnlocked] = useState(false);
  const [gate, setGate] = useState<{ configured: boolean } | null>(null);
  const [handles, setHandles] = useState<HandleRow[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  useEffect(() => {
    setUnlocked(isAdminUnlocked());
  }, []);

  const isAdmin = role === 'admin' || role === 'owner';
  const isOwner = role === 'owner';
  const filteredUsers = users.filter((person) => {
    const query = userQuery.trim().toLowerCase();
    return !query || [person.displayName, person.email, person.username, person.uid, person.role]
      .some((value) => value?.toLowerCase().includes(query));
  });

  const toggleUser = (uid: string) => setSelectedUsers((current) =>
    current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid],
  );

  const selectVisibleUsers = () => {
    const ids = filteredUsers.map((person) => person.uid);
    setSelectedUsers((current) => ids.every((uid) => current.includes(uid))
      ? current.filter((uid) => !ids.includes(uid))
      : [...new Set([...current, ...ids])]);
  };

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

  const applyRoleToSelected = async (nextRole: 'admin' | 'none') => {
    const targets = selectedUsers.filter((uid) => {
      const person = users.find((candidate) => candidate.uid === uid);
      if (!person || uid === user?.uid || person.role === 'owner') return false;
      return nextRole === 'admin' ? person.role === null : person.role === 'admin';
    });
    if (!targets.length) return toast('Select eligible accounts first; owner accounts are protected.', 'error');
    try {
      await Promise.all(targets.map((uid) => setRole(uid, nextRole)));
      setSelectedUsers([]);
      await load();
      toast(nextRole === 'admin' ? `Admin role granted to ${targets.length} account${targets.length === 1 ? '' : 's'}.` : `Role removed from ${targets.length} account${targets.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      await load();
      toast((error as Error)?.message ?? 'Some role changes could not be saved.', 'error');
    }
  };

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
    <div className="pb-page pb-narrow anim-admin-arrival">
      <header className="pb-page-head pb-admin-signature">
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
            ['inbox', 'Private inbox'],
            ['people', isOwner ? 'People & roles' : 'People'],
            ['badges', 'Badges'],
            ['sources', 'Source review'],
            ['moderation', 'Moderation'],
            ['ads', 'Ad desk'],
            ['notice', 'Notices'],
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
          <Stat label="Presentation views" value={formatCount(speeches.reduce((total, speech) => total + speech.views, 0))} />
          <Stat label="Likes & dislikes" value={formatCount(speeches.reduce((total, speech) => total + speech.likes + speech.dislikes, 0))} />
          <Stat label="Shares" value={formatCount(speeches.reduce((total, speech) => total + speech.shares, 0))} />
          <div className="pb-panel" style={{ gridColumn: '1 / -1', padding: '14px 16px' }}>
              <p className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.7, margin: '0 0 10px' }}>
                Reactions, shares and views move only from real, signed-in people — the counters
                below are the same ones visitors see. Nothing on the public site reveals who
                holds a role; this workspace is the only place it shows.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="pb-btn pb-btn-sm pb-btn-ghost" href="/dbms"><ExternalLink size={13} /> Open database health</a>
                <a className="pb-btn pb-btn-sm" href="/admin/report"><FileText size={13} /> Open deep review report</a>
              </div>
          </div>
        </section>
      )}

      {tab === 'inbox' && <AdminInboxPanel />}

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

      {tab === 'badges' && <BadgesPanel users={users} />}
      {tab === 'sources' && <SourceReviewPanel />}
      {tab === 'moderation' && <ModerationPanel />}
      {tab === 'notice' && <SiteNoticePanel />}
      {tab === 'site' && <SiteThemeTab isOwner={isOwner} />}

      {tab === 'setup' && (
        <PasswordPanel onLock={() => { lockAdmin(); setUnlocked(false); }} />)}

      {tab === 'setup' && (
        <EnvCheckPanel />
      )}

      {tab === 'people' && (
        <section>
          <div className="pb-panel" style={{ padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
              <div>
                <label className="pb-label" htmlFor="admin-user-search">Find an account</label>
                <div style={{ position: 'relative' }}>
                  <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 11, top: 12, color: 'var(--c-ink-muted)' }} />
                  <input id="admin-user-search" className="pb-input" style={{ paddingLeft: 34 }} value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Name, email, handle or Clerk ID" />
                </div>
              </div>
              <button type="button" className="pb-btn pb-btn-sm" onClick={selectVisibleUsers} disabled={!filteredUsers.length}>
                {filteredUsers.length && filteredUsers.every((person) => selectedUsers.includes(person.uid)) ? 'Clear visible' : 'Select visible'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span className="pb-muted" style={{ fontSize: '.78rem', flex: 1 }}>{filteredUsers.length} shown · {selectedUsers.length} selected</span>
              {isOwner && selectedUsers.length > 0 && <>
                <button type="button" className="pb-btn pb-btn-sm" onClick={() => void applyRoleToSelected('admin')}>Make selected admins</button>
                <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => void applyRoleToSelected('none')}>Remove selected roles</button>
              </>}
            </div>
          </div>
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
            {filteredUsers.map((person) => (
              <div key={person.uid} className="pb-panel-flat" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="checkbox" aria-label={`Select ${person.displayName ?? person.email ?? person.uid}`} checked={selectedUsers.includes(person.uid)} onChange={() => toggleUser(person.uid)} />
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{person.displayName ?? 'No name given'} {person.username ? <span className="pb-mono" style={{ fontSize: '.76rem' }}>@{person.username}</span> : null}</div>
                  <div className="pb-muted" style={{ fontSize: '0.72rem' }}>
                    {person.email} · {person.providerId ?? 'unknown provider'} · {person.role ?? 'member'}
                  </div>
                </div>
                {isOwner && person.uid !== user.uid && (
                  <>
                    <button
                      type="button"
                      className="pb-btn pb-btn-sm pb-btn-ghost"
                      disabled={person.role === 'admin' || person.role === 'owner'}
                      onClick={() => {
                        void setRole(person.uid, 'admin')
                          .then(async () => { await load(); toast('Made an admin', 'success'); })
                          .catch((error: unknown) => toast((error as Error)?.message ?? 'Failed', 'error'));
                      }}
                    >
                      Make admin
                    </button>
                    <button
                      type="button"
                      className="pb-btn pb-btn-sm pb-btn-ghost"
                      disabled={person.role !== 'admin'}
                      onClick={() => {
                        void setRole(person.uid, 'none')
                          .then(async () => { await load(); toast('Role removed', 'success'); })
                          .catch((error: unknown) => toast((error as Error)?.message ?? 'Failed', 'error'));
                      }}
                    >
                      Remove role
                    </button>
                  </>
                )}
                <AdminProfileEditor person={person} onSaved={() => void load()} />
              </div>
            ))}
            {!filteredUsers.length && <p className="pb-muted" style={{ fontSize: '0.82rem' }}>{users.length ? 'No accounts match that search.' : 'No accounts have signed in yet.'}</p>}
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

function AdminProfileEditor({ person, onSaved }: {
  person: Awaited<ReturnType<typeof fetchUsers>>[number];
  onSaved: () => void;
}) {
  const toast = useUi((s) => s.toast);
  const [form, setForm] = useState<AdminProfileDetails>({
    displayName: person.displayName ?? '',
    bio: person.bio,
    location: person.location,
    website: person.website,
    signature: person.signature,
  });
  const [busy, setBusy] = useState(false);
  return (
    <details style={{ flex: '1 1 100%', marginTop: 3 }}>
      <summary className="pb-btn pb-btn-sm pb-btn-ghost" style={{ width: 'fit-content', cursor: 'pointer' }}>Edit profile details</summary>
      <form onSubmit={(event) => {
        event.preventDefault(); setBusy(true);
        void updateProfileAsAdmin(person.uid, form).then((saved) => {
          setForm(saved); onSaved(); toast('Profile details updated.', 'success');
        }).catch((error: unknown) => toast((error as Error)?.message ?? 'Profile details could not be saved.', 'error'))
          .finally(() => setBusy(false));
      }} style={{ display: 'grid', gap: 9, marginTop: 10, padding: 12, border: '1px solid var(--c-line)', borderRadius: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 9 }}>
          <div><label className="pb-label" htmlFor={`admin-name-${person.uid}`}>Display name</label><input id={`admin-name-${person.uid}`} className="pb-input" maxLength={80} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></div>
          <div><label className="pb-label" htmlFor={`admin-location-${person.uid}`}>Location</label><input id={`admin-location-${person.uid}`} className="pb-input" maxLength={100} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></div>
          <div><label className="pb-label" htmlFor={`admin-website-${person.uid}`}>Website</label><input id={`admin-website-${person.uid}`} className="pb-input" type="url" maxLength={200} value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://example.com" /></div>
          <div><label className="pb-label" htmlFor={`admin-signature-${person.uid}`}>Signature</label><input id={`admin-signature-${person.uid}`} className="pb-input" maxLength={120} value={form.signature} onChange={(event) => setForm({ ...form, signature: event.target.value })} /></div>
        </div>
        <div><label className="pb-label" htmlFor={`admin-bio-${person.uid}`}>Bio</label><textarea id={`admin-bio-${person.uid}`} className="pb-textarea" rows={3} maxLength={500} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></div>
        <button className="pb-btn pb-btn-sm" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile details'}</button>
      </form>
    </details>
  );
}

function SiteNoticePanel() {
  const toast = useUi((s) => s.toast);
  const [notice, setNotice] = useState<PublicSiteNotice>({ active: false, message: '', tone: 'info' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchSiteNotice().then((value) => {
      if (alive && value) setNotice(value);
    }).catch(() => undefined).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <section className="pb-panel" style={{ padding: '18px 20px' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', marginBottom: 4 }}><Bell size={16} /> Public site notice</h2>
      <p className="pb-muted" style={{ fontSize: '.82rem', lineHeight: 1.65 }}>A short banner shown across the public site. Keep it factual, temporary and clear; it is read from the shared site settings row.</p>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label className="pb-label" htmlFor="public-notice-text">Message</label>
          <textarea id="public-notice-text" className="pb-textarea" rows={3} maxLength={280} value={notice.message} onChange={(event) => setNotice({ ...notice, message: event.target.value })} placeholder="A concise service or community notice" />
          <span className="pb-muted" style={{ fontSize: '.72rem' }}>{notice.message.length}/280</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 7, alignItems: 'center', fontSize: '.84rem' }}><input type="checkbox" checked={notice.active} onChange={(event) => setNotice({ ...notice, active: event.target.checked })} /> Show on the public site</label>
          <label className="pb-label" htmlFor="public-notice-tone" style={{ margin: 0 }}>Tone</label>
          <select id="public-notice-tone" className="pb-input" style={{ width: 'auto' }} value={notice.tone} onChange={(event) => setNotice({ ...notice, tone: event.target.value === 'warning' ? 'warning' : 'info' })}>
            <option value="info">Information</option><option value="warning">Important warning</option>
          </select>
          <button type="button" className="pb-btn pb-btn-primary" disabled={busy || loading || (notice.active && !notice.message.trim())} onClick={() => {
            setBusy(true);
            void saveSiteNotice(notice).then((saved) => { setNotice(saved); toast('Public notice saved.', 'success'); })
              .catch((error: unknown) => toast((error as Error)?.message ?? 'Notice could not be saved.', 'error'))
              .finally(() => setBusy(false));
          }}><Save size={14} /> {busy ? 'Saving…' : 'Save notice'}</button>
          {loading && <span className="pb-muted" style={{ fontSize: '.78rem' }}>Loading current notice…</span>}
        </div>
      </div>
    </section>
  );
}

function BadgesPanel({ users }: { users: Awaited<ReturnType<typeof fetchUsers>> }) {
  const toast = useUi((s) => s.toast);
  const [accounts, setAccounts] = useState<OfficialAccount[]>([]);
  const [assignments, setAssignments] = useState<BadgeAssignment[]>([]);
  const [audit, setAudit] = useState<BadgeAuditRecord[]>([]);
  const [principalType, setPrincipalType] = useState<'person' | 'official'>('person');
  const [principalId, setPrincipalId] = useState('');
  const [badge, setBadgeValue] = useState<AdminBadge>('quintal');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [nextAssignments, nextAudit, nextAccounts] = await Promise.all([listBadgeAssignments(), listBadgeAudit(), listOfficialAccounts()]);
    setAssignments(nextAssignments); setAudit(nextAudit); setAccounts(nextAccounts);
  };
  useEffect(() => { void refresh().catch((error: unknown) => toast((error as Error)?.message ?? 'Badge records could not be loaded.', 'error')); }, []);
  const options = principalType === 'person'
    ? users.map((person) => ({ id: person.uid, label: `${person.displayName || person.email || person.uid}${person.username ? ` · @${person.username}` : ''}` }))
    : accounts.map((account) => ({ id: account.slug, label: `${account.displayName} · ${account.slug}${account.active ? '' : ' (inactive)'}` }));
  const permittedBadges: AdminBadge[] = principalType === 'person' ? ['quintal', 'sole'] : ['grey'];
  const activeAssignments = assignments.filter((assignment) => assignment.principalType === principalType);
  const grant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!principalId) return toast('Choose an account first.', 'error');
    if (!reason.trim()) return toast('Add a short reason so the badge audit has context.', 'error');
    setBusy(true);
    try {
      await setBadge(principalType, principalId, badge, 'grant', reason);
      await refresh();
      toast(`${badge[0].toUpperCase()}${badge.slice(1)} badge recorded.`, 'success');
    } catch (error) { toast((error as Error)?.message ?? 'Badge could not be saved.', 'error'); }
    finally { setBusy(false); }
  };
  const revoke = async (assignment: BadgeAssignment) => {
    const why = reason.trim() || 'Revoked by an administrator.';
    setBusy(true);
    try { await setBadge(assignment.principalType, assignment.principalId, assignment.badge, 'revoke', why); await refresh(); toast(`${assignment.badge} badge revoked.`, 'success'); }
    catch (error) { toast((error as Error)?.message ?? 'Badge could not be revoked.', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <form className="pb-panel" onSubmit={grant} style={{ display: 'grid', gap: 12, padding: '18px 20px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', margin: 0 }}><BadgeCheck size={16} /> Audited badge desk</h2>
        <p className="pb-muted" style={{ fontSize: '.82rem', lineHeight: 1.65, margin: 0 }}>Badge changes are recorded with the acting account and a reason. Quintal is for 100 written plus 100 read/rehearsed; Sole is permanent for every person who held the top author-read count, first awarded at 10,000. Verify eligibility before a manual grant. Grey is only for active official sources.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 10 }}>
          <div><label className="pb-label" htmlFor="badge-principal-type">Account type</label><select id="badge-principal-type" className="pb-input" value={principalType} onChange={(event) => { const next = event.target.value === 'official' ? 'official' : 'person'; setPrincipalType(next); setBadgeValue(next === 'official' ? 'grey' : 'quintal'); setPrincipalId(''); }}><option value="person">Person</option><option value="official">Official source</option></select></div>
          <div><label className="pb-label" htmlFor="badge-principal">Account</label><select id="badge-principal" className="pb-input" required value={principalId} onChange={(event) => setPrincipalId(event.target.value)}><option value="">Choose…</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
          <div><label className="pb-label" htmlFor="badge-code">Badge</label><select id="badge-code" className="pb-input" value={badge} onChange={(event) => setBadgeValue(event.target.value as AdminBadge)}>{permittedBadges.map((code) => <option key={code} value={code}>{code[0].toUpperCase() + code.slice(1)}</option>)}</select></div>
        </div>
        <div><label className="pb-label" htmlFor="badge-reason">Reason for grant or revocation</label><textarea id="badge-reason" className="pb-textarea" rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Eligibility evidence or reason for a correction" /></div>
        <div><button className="pb-btn pb-btn-primary" type="submit" disabled={busy || !principalId || !reason.trim()}><BadgeCheck size={14} /> {busy ? 'Saving…' : 'Grant badge'}</button></div>
      </form>
      <section className="pb-panel" style={{ padding: '16px 18px' }}>
        <h3 style={{ fontSize: '.96rem', margin: '0 0 10px' }}>Current assignments · {assignments.length}</h3>
        <div style={{ display: 'grid', gap: 6 }}>
          {activeAssignments.map((assignment) => {
            const account = users.find((person) => person.uid === assignment.principalId);
            const source = accounts.find((item) => item.slug === assignment.principalId);
            return <div key={`${assignment.principalType}:${assignment.principalId}:${assignment.badge}`} className="pb-panel-flat" style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <img src={`/badges/${assignment.badge}.svg`} width={26} height={26} alt={`${assignment.badge} badge`} />
              <span style={{ flex: 1, minWidth: 150, fontSize: '.84rem' }}>{account?.displayName || source?.displayName || assignment.principalId} · {assignment.principalType}</span>
              {assignment.reason && <span className="pb-muted" style={{ flex: '2 1 160px', fontSize: '.74rem' }}>{assignment.reason}</span>}
              <button className="pb-btn pb-btn-sm pb-btn-ghost" type="button" disabled={busy} onClick={() => void revoke(assignment)}>Revoke</button>
            </div>;
          })}
          {!activeAssignments.length && <p className="pb-muted" style={{ fontSize: '.8rem' }}>No active assignments for this account type.</p>}
        </div>
      </section>
      <details className="pb-panel" style={{ padding: '14px 18px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' }}>Recent badge audit · {audit.length}</summary>
        <div style={{ display: 'grid', gap: 5, marginTop: 10 }}>{audit.map((entry, index) => <div key={`${entry.createdAt}:${entry.principalId}:${index}`} className="pb-muted" style={{ fontSize: '.76rem', lineHeight: 1.5 }}>{entry.action} {entry.badge} · {entry.principalType} {entry.principalId} · {entry.reason || 'No reason recorded'} · {entry.actorUid} · {entry.createdAt}</div>)}{!audit.length && <p className="pb-muted" style={{ fontSize: '.78rem' }}>No audit entries yet.</p>}</div>
      </details>
    </section>
  );
}

const EMPTY_OFFICIAL: OfficialAccountDraft = { slug: '', displayName: '', email: '', handle: '', logoURL: '', bio: '', canonicalURL: '' };

function SourceReviewPanel() {
  const toast = useUi((s) => s.toast);
  const [accounts, setAccounts] = useState<OfficialAccount[]>([]);
  const [items, setItems] = useState<ArrivalReviewItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WebSpeech[]>([]);
  const [draft, setDraft] = useState<OfficialAccountDraft>(EMPTY_OFFICIAL);
  const [officialSlug, setOfficialSlug] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    const [nextItems, nextAccounts] = await Promise.all([fetchArrivalReview(), listOfficialAccounts()]);
    setItems(nextItems); setAccounts(nextAccounts);
    setOfficialSlug((current) => current || nextAccounts.find((account) => account.active)?.slug || '');
  };
  useEffect(() => { void refresh().catch((error: unknown) => toast((error as Error)?.message ?? 'Source review could not be loaded.', 'error')).finally(() => setLoading(false)); }, []);
  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim().length < 2) return toast('Enter at least two characters to search the open archives.', 'error');
    setSearching(true);
    try { setResults(await searchWebSpeeches(query.trim(), 8)); }
    catch (error) { toast((error as Error)?.message ?? 'The open archives could not be searched.', 'error'); }
    finally { setSearching(false); }
  };
  const stage = async (id: string) => {
    setBusy(true);
    try { await stageSourceCandidate(id); await refresh(); toast('Source text added to the review queue.', 'success'); }
    catch (error) { toast((error as Error)?.message ?? 'This archive item could not be staged.', 'error'); }
    finally { setBusy(false); }
  };
  const review = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(true);
    try { await reviewSourceCandidate(id, status, notes[id] ?? ''); await refresh(); toast(status === 'approved' ? 'Source approved for publication.' : 'Source declined.', 'success'); }
    catch (error) { toast((error as Error)?.message ?? 'The review decision could not be saved.', 'error'); }
    finally { setBusy(false); }
  };
  const publish = async (id: string) => {
    if (!officialSlug) return toast('Create an active official account with a claimed handle first.', 'error');
    setBusy(true);
    try { await publishSourceCandidate(id, officialSlug); await refresh(); toast('Source published with its provenance and official account.', 'success'); }
    catch (error) { toast((error as Error)?.message ?? 'The approved source could not be published.', 'error'); }
    finally { setBusy(false); }
  };
  const submitAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try {
      const created = await createOfficialAccount(draft);
      setDraft(EMPTY_OFFICIAL);
      await refresh();
      setOfficialSlug(created.slug);
      toast(`Official account @${created.handle} created. Its Clerk identity and Supabase profile are linked.`, 'success');
    } catch (error) { toast((error as Error)?.message ?? 'The official source account could not be created.', 'error'); }
    finally { setBusy(false); }
  };
  const toggleActive = async (account: OfficialAccount) => {
    setBusy(true);
    try { await setOfficialAccountActive(account.slug, !account.active); await refresh(); toast(`${account.displayName} ${account.active ? 'deactivated' : 'activated'}.`, 'success'); }
    catch (error) { toast((error as Error)?.message ?? 'The account status could not be changed.', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <details className="pb-panel" open style={{ padding: '16px 18px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 650 }}>Official/source accounts · {accounts.length}</summary>
        <p className="pb-muted" style={{ fontSize: '.8rem', lineHeight: 1.65 }}>Each account gets a Clerk identity plus a Supabase profile and permanent handle. The source badge is Grey; it is not assigned to ordinary members.</p>
        <form onSubmit={submitAccount} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 10 }}>
            <div><label className="pb-label" htmlFor="official-name">Display name *</label><input id="official-name" className="pb-input" required maxLength={80} value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder="Wikisource Editorial" /></div>
            <div>
              <label className="pb-label" htmlFor="official-slug">Source slug *</label>
              <input
                id="official-slug"
                className="pb-input"
                required
                minLength={2}
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Use lowercase letters and numbers separated by single hyphens."
                value={draft.slug}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase() })}
                placeholder="wikisource-editorial"
              />
            </div>
            <div><label className="pb-label" htmlFor="official-email">Sign-in/contact email *</label><input id="official-email" className="pb-input" required type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="editor@example.org" /></div>
            <div><label className="pb-label" htmlFor="official-handle">Public handle *</label><input id="official-handle" className="pb-input" required maxLength={24} value={draft.handle} onChange={(event) => setDraft({ ...draft, handle: event.target.value.toLowerCase() })} placeholder="source_editor" /></div>
            <div><label className="pb-label" htmlFor="official-logo">Logo URL</label><input id="official-logo" className="pb-input" type="url" value={draft.logoURL} onChange={(event) => setDraft({ ...draft, logoURL: event.target.value })} placeholder="https://…" /></div>
            <div><label className="pb-label" htmlFor="official-url">Canonical source URL</label><input id="official-url" className="pb-input" type="url" value={draft.canonicalURL} onChange={(event) => setDraft({ ...draft, canonicalURL: event.target.value })} placeholder="https://example.org" /></div>
          </div>
          <div><label className="pb-label" htmlFor="official-bio">Bio</label><textarea id="official-bio" className="pb-textarea" rows={2} maxLength={500} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} /></div>
          <div><button className="pb-btn" type="submit" disabled={busy || !draft.displayName.trim() || !draft.slug.trim() || !draft.email.trim() || !draft.handle.trim()}><Plus size={14} /> Create another official account</button></div>
        </form>
        <div style={{ display: 'grid', gap: 6, marginTop: 14 }}>{accounts.map((account) => <div key={account.slug} className="pb-panel-flat" style={{ padding: '9px 11px', display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
          {account.logoURL && <img src={account.logoURL} alt="" width={32} height={32} style={{ objectFit: 'cover', borderRadius: 6 }} />}
          <span style={{ flex: 1, minWidth: 150, fontSize: '.83rem' }}><strong>{account.displayName}</strong> <span className="pb-mono">{account.slug}</span><br /><span className="pb-muted" style={{ fontSize: '.7rem' }}>Clerk: {account.identityUid || 'missing identity'} · {account.active ? 'active' : 'inactive'}</span></span>
          <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" disabled={busy} onClick={() => void toggleActive(account)}>{account.active ? 'Deactivate' : 'Activate'}</button>
        </div>)}{!accounts.length && <p className="pb-muted" style={{ fontSize: '.78rem' }}>No official accounts yet.</p>}</div>
      </details>

      <section className="pb-panel" style={{ padding: '16px 18px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', margin: '0 0 4px' }}><Search size={16} /> Curate an open-archive source</h2>
        <p className="pb-muted" style={{ fontSize: '.8rem', lineHeight: 1.65 }}>Search results are not published automatically. Staging re-fetches the stable archive ID on the server, records its source and licence, and adds it to this review queue.</p>
        <form onSubmit={search} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input className="pb-input" style={{ flex: '1 1 220px' }} value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={120} placeholder="Search speeches, authors, subjects" /><button className="pb-btn" type="submit" disabled={searching || query.trim().length < 2}><Search size={14} /> {searching ? 'Searching…' : 'Search archives'}</button></form>
        {results.length > 0 && <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>{results.map((speech) => {
          const alreadyStaged = items.some((item) => item.id === speech.id);
          return <article key={speech.id} className="pb-panel-flat" style={{ padding: '10px 12px', display: 'grid', gap: 5 }}><div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><strong style={{ flex: 1, minWidth: 180, fontSize: '.86rem' }}>{speech.title}</strong><span className="pb-chip">{speech.source}</span><a href={speech.sourceUrl} target="_blank" rel="noopener noreferrer" className="pb-btn pb-btn-sm pb-btn-ghost">Source <ExternalLink size={12} /></a><button type="button" className="pb-btn pb-btn-sm" disabled={busy || alreadyStaged} onClick={() => void stage(speech.id)}>{alreadyStaged ? 'In review queue' : 'Stage for review'}</button></div><p className="pb-muted" style={{ fontSize: '.74rem', lineHeight: 1.55, margin: 0 }}>{speech.author} · {speech.licence}<br />{speech.preview}</p></article>;
        })}</div>}
      </section>

      <section className="pb-panel" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><h2 style={{ fontSize: '1rem', margin: 0, flex: 1 }}>Review queue · {items.filter((item) => item.status === 'candidate' || item.status === 'approved').length} awaiting decision</h2><label className="pb-label" htmlFor="source-official" style={{ margin: 0 }}>Publish as</label><select id="source-official" className="pb-input" style={{ width: 'auto', maxWidth: '100%' }} value={officialSlug} onChange={(event) => setOfficialSlug(event.target.value)}><option value="">Choose account…</option>{accounts.map((account) => <option key={account.slug} value={account.slug} disabled={!account.active}>{account.displayName}{account.active ? '' : ' (inactive)'}</option>)}</select></div>
        {loading && <p className="pb-muted" style={{ fontSize: '.8rem' }}>Loading archive review…</p>}
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{items.map((item) => <article key={item.id} className="pb-panel-flat" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><strong style={{ flex: 1, minWidth: 180 }}>{item.title}</strong><span className="pb-chip" data-status={item.status}>{item.status}</span><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="pb-btn pb-btn-sm pb-btn-ghost">Original source <ExternalLink size={12} /></a></div>
          <div className="pb-muted" style={{ fontSize: '.74rem', lineHeight: 1.5 }}>{item.author} · {item.sourceId} · {item.license} · fetched {item.fetchedAt}</div>
          <p className="pb-soft" style={{ fontSize: '.82rem', lineHeight: 1.6, margin: 0 }}>{item.preview}</p>
          <details><summary className="pb-muted" style={{ cursor: 'pointer', fontSize: '.78rem' }}>Inspect text ({item.content.length.toLocaleString('en-US')} characters loaded)</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto', fontFamily: 'var(--x-font-body)', fontSize: '.8rem', lineHeight: 1.65 }}>{item.content}</pre></details>
          <div><label className="pb-label" htmlFor={`source-note-${item.id}`}>Curator note</label><textarea id={`source-note-${item.id}`} className="pb-textarea" rows={2} maxLength={500} value={notes[item.id] ?? item.note} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} placeholder="Quality, context, attribution or reason for a hold" /></div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {(item.status === 'candidate' || item.status === 'rejected') && <button type="button" className="pb-btn pb-btn-sm" disabled={busy} onClick={() => void review(item.id, 'approved')}><Check size={13} /> Approve</button>}
            {item.status !== 'published' && item.status !== 'rejected' && <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" disabled={busy} onClick={() => void review(item.id, 'rejected')}><X size={13} /> Reject</button>}
            {item.status === 'approved' && <button type="button" className="pb-btn pb-btn-sm pb-btn-primary" disabled={busy || !officialSlug || !accounts.some((account) => account.slug === officialSlug && account.active)} onClick={() => void publish(item.id)}><Upload size={13} /> Publish as {accounts.find((account) => account.slug === officialSlug)?.displayName || 'official source'}</button>}
            {item.status === 'published' && item.publishedSpeechId && <a className="pb-btn pb-btn-sm pb-btn-ghost" href={`/read/${encodeURIComponent(item.publishedSpeechId)}`}>Open published text <ExternalLink size={12} /></a>}
          </div>
        </article>)}{!loading && !items.length && <p className="pb-muted" style={{ fontSize: '.8rem' }}>The queue is empty. Search an archive above and stage a source for a human review.</p>}</div>
      </section>
    </section>
  );
}

function ModerationPanel() {
  const toast = useUi((s) => s.toast);
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = async () => setItems(await fetchModerationItems());
  useEffect(() => { void refresh().catch((error: unknown) => toast((error as Error)?.message ?? 'Moderation items could not be loaded.', 'error')).finally(() => setLoading(false)); }, []);
  const filtered = items.filter((item) => [item.title, item.author, item.username, item.category, item.id, item.note].some((value) => value.toLowerCase().includes(query.trim().toLowerCase())));
  const toggle = async (item: ModerationItem) => {
    const status = item.status === 'published' ? 'held' : 'published';
    if (status === 'held' && !window.confirm(`Hold “${item.title}” from public reading and search?`)) return;
    setBusy(true);
    try { await setModeration(item.id, status, notes[item.id] ?? item.note); await refresh(); toast(status === 'held' ? 'Presentation held from the public library.' : 'Presentation restored to public reading.', 'success'); }
    catch (error) { toast((error as Error)?.message ?? 'Moderation could not be saved.', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <section className="pb-panel" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}><div style={{ flex: '1 1 230px' }}><label className="pb-label" htmlFor="moderation-search">Find published or held work</label><input id="moderation-search" className="pb-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, author, handle or ID" /></div><span className="pb-muted" style={{ fontSize: '.78rem' }}>{items.filter((item) => item.status === 'published').length} public · {items.filter((item) => item.status === 'held').length} held</span></div>
      <p className="pb-muted" style={{ fontSize: '.8rem', lineHeight: 1.6 }}>Holding a presentation removes it from public reads, taxonomy pages and the sitemap without deleting the author's work. Add a private moderation note before changing its state.</p>
      {loading && <p className="pb-muted" style={{ fontSize: '.8rem' }}>Loading content…</p>}
      <div style={{ display: 'grid', gap: 7 }}>{filtered.map((item) => <article key={item.id} className="pb-panel-flat" style={{ padding: '10px 12px', display: 'grid', gap: 7 }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}><strong style={{ flex: 1, minWidth: 180 }}>{item.title}</strong><span className="pb-chip">{item.status}</span><a className="pb-btn pb-btn-sm pb-btn-ghost" href={item.username ? `/${encodeURIComponent(item.username)}/${encodeURIComponent(item.folder ? `${item.folder}/${item.slug || item.id}` : item.slug || item.id)}` : `/read/${encodeURIComponent(item.id)}`}>Open <ExternalLink size={12} /></a><button type="button" className="pb-btn pb-btn-sm" disabled={busy} onClick={() => void toggle(item)}>{item.status === 'published' ? 'Hold' : 'Restore public'}</button></div>
        <div className="pb-muted" style={{ fontSize: '.74rem' }}>{item.author} · {item.category || 'Uncategorised'} · {item.id}</div><p className="pb-soft" style={{ fontSize: '.8rem', margin: 0 }}>{item.preview}</p>
        <label className="pb-label" htmlFor={`moderation-note-${item.id}`}>Private moderation note</label><textarea id={`moderation-note-${item.id}`} className="pb-textarea" rows={2} maxLength={500} value={notes[item.id] ?? item.note} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} placeholder="Reason and follow-up" />
      </article>)}{!loading && !filtered.length && <p className="pb-muted" style={{ fontSize: '.8rem' }}>No presentations match that search.</p>}</div>
    </section>
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
