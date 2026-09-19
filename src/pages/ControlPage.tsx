import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accessibility,
  Cloud,
  Contrast,
  Crown,
  Database,
  EyeOff,
  FileDown,
  FileUp,
  KeyRound,
  Palette,
  RefreshCw,
  RotateCcw,
  Shield,
  Trash2,
  Upload,
  Waves,
} from 'lucide-react';
import { useSpeeches } from '../hooks/useCollection';
import { useLibrary } from '../store/library';
import { useSettings, type ContrastBoost, type ReducedMotionPref } from '../store/settings';
import { useCloud } from '../store/cloud';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { FIREBASE_ENABLED, FIREBASE_PROJECT } from '../services/firebase';
import {
  bootstrapOwner,
  deletePost,
  deleteSpeechDoc,
  fetchPosts,
  fetchUsers,
  publishSpeech,
  setRole,
  updateSpeechDoc,
} from '../services/data';
import { formatCount } from '../lib/text';

type Tab = 'library' | 'data' | 'cloud' | 'comfort' | 'admin';

export function ControlPage() {
  const items = useSpeeches();
  const mine = useLibrary((s) => s.mine);
  const hidden = useLibrary((s) => s.hidden);
  const setHidden = useLibrary((s) => s.setHidden);
  const deleteSpeech = useLibrary((s) => s.deleteSpeech);
  const importMany = useLibrary((s) => s.importMany);
  const resetLocal = useLibrary((s) => s.resetLocal);
  const toast = useUi((s) => s.toast);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const user = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const refreshRole = useAuth((s) => s.refreshRole);
  const cloud = useCloud();

  const reducedMotion = useSettings((s) => s.reducedMotion);
  const setReducedMotion = useSettings((s) => s.setReducedMotion);
  const contrast = useSettings((s) => s.contrast);
  const setContrast = useSettings((s) => s.setContrast);
  const ambient = useSettings((s) => s.ambient);
  const toggleAmbient = useSettings((s) => s.toggleAmbient);
  const resetTheme = useSettings((s) => s.resetTheme);

  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<Tab>('library');
  const [users, setUsers] = useState<Awaited<ReturnType<typeof fetchUsers>>>([]);
  const [posts, setPosts] = useState<Awaited<ReturnType<typeof fetchPosts>>>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  const isAdmin = role === 'admin' || role === 'owner';
  const isOwner = role === 'owner';

  const storage = useMemo(() => {
    try {
      return new Blob([localStorage.getItem('pb.library.v2') ?? '']).size;
    } catch {
      return 0;
    }
  }, [mine, hidden]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return items.filter(
      (item) =>
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.author.toLowerCase().includes(needle),
    );
  }, [items, filter]);

  const exportAll = () => {
    const payload = JSON.stringify(
      {
        app: 'Presentation Buddy',
        version: 2,
        exportedAt: new Date().toISOString(),
        speeches: items.map((item) => ({
          title: item.title,
          author: item.author,
          category: item.category,
          occasion: item.occasion,
          tags: item.tags,
          preview: item.preview,
          content: item.content,
          createdAt: item.createdAt,
          source: item.source,
        })),
      },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'presentation-buddy-library.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(`Exported ${items.length} speeches`, 'success');
  };

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { speeches?: unknown };
      const list = Array.isArray(parsed.speeches) ? parsed.speeches : Array.isArray(parsed) ? parsed : null;
      if (!list) throw new Error('No speeches array found');
      const cleaned = (list as Record<string, unknown>[]).map((raw, index) => ({
        id: String(raw.id ?? `imported-${index}`),
        kind: 'speech' as const,
        title: String(raw.title ?? `Imported speech ${index + 1}`),
        author: String(raw.author ?? 'Imported'),
        category: String(raw.category ?? 'Imported'),
        occasion: String(raw.occasion ?? 'General'),
        level: 'Standard' as const,
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        preview: String(raw.preview ?? ''),
        content: String(raw.content ?? ''),
        createdAt: String(raw.createdAt ?? new Date().toISOString().slice(0, 10)),
      }));
      const count = importMany(cleaned);
      toast(`Imported ${count} speeches`, 'success');
    } catch (error) {
      toast(error instanceof Error ? `Import failed: ${error.message}` : 'Import failed', 'error');
    }
  };

  const loadAdmin = async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const [people, notes] = await Promise.all([fetchUsers(), fetchPosts()]);
      setUsers(people);
      setPosts(notes);
    } catch (error) {
      toast((error as Error)?.message ?? 'Could not load admin data', 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  const publishDraft = async (id: string) => {
    const draft = mine.find((speech) => speech.id === id);
    if (!draft || !user) return;
    try {
      const { id: cloudId } = await publishSpeech(
        {
          title: draft.title,
          content: draft.content,
          preview: draft.preview,
          category: draft.category,
          occasion: draft.occasion,
          tags: draft.tags,
          ad: draft.ad,
        },
        user.uid,
        user.displayName ?? user.email ?? 'Anonymous',
      );
      useLibrary.getState().updateSpeech(id, { cloudId, status: 'published' });
      toast('Published to the shared library', 'success');
      void cloud.connect(true);
    } catch (error) {
      toast((error as Error)?.message ?? 'Publish failed', 'error');
    }
  };

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'library', label: 'Content', show: true },
    { id: 'data', label: 'Your data', show: true },
    { id: 'cloud', label: 'Cloud', show: true },
    { id: 'comfort', label: 'Comfort', show: true },
    { id: 'admin', label: 'Admin', show: isAdmin },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(18px, 3vw, 28px)' }}>
        <span className="pb-eyebrow">Control room</span>
        <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', margin: '8px 0 8px' }}>Everything this device holds</h1>
        <p className="pb-soft" style={{ maxInlineSize: '58ch', lineHeight: 1.7 }}>
          Your drafts, notes, bookmarks and reading progress live here on this device. Nothing is
          uploaded unless you publish it yourself while signed in.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 18 }}>
          <Stat label="Speeches on this device" value={String(items.length)} />
          <Stat label="Your drafts" value={String(mine.length)} />
          <Stat label="Hidden" value={String(hidden.length)} />
          <Stat label="Local storage" value={`${(storage / 1024).toFixed(1)} KB`} />
        </div>
      </section>

      <div className="pb-well" style={{ display: 'flex', gap: 4, padding: 4, overflowX: 'auto' }}>
        {tabs
          .filter((entry) => entry.show)
          .map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTab(entry.id);
                if (entry.id === 'admin') void loadAdmin();
              }}
              className={`pb-btn pb-btn-sm ${tab === entry.id ? '' : 'pb-btn-ghost'}`}
              style={{ background: tab === entry.id ? 'var(--c-accent-soft)' : undefined, whiteSpace: 'nowrap' }}
            >
              {entry.id === 'admin' && <Shield size={13} />} {entry.label}
            </button>
          ))}
      </div>

      {tab === 'library' && (
        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.05rem' }}>Content</h2>
            <div style={{ flex: 1 }} />
            <input
              className="pb-input"
              style={{ width: 'auto', minWidth: 200 }}
              placeholder="Filter by title or author…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter content"
            />
          </div>
          <div>
            {visible.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px',
                  borderBottom: '1px solid var(--c-line-soft)', flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{item.title}</div>
                  <div className="pb-muted" style={{ fontSize: '0.72rem' }}>
                    {item.source} · {item.author} · {formatCount(item.words)} words
                    {item.views !== null ? ` · ${formatCount(item.views)} views` : ''}
                  </div>
                </div>
                {item.source === 'user' && item.status === 'draft' && user && (
                  <button type="button" className="pb-btn pb-btn-sm" onClick={() => void publishDraft(item.id)}>
                    <Upload size={13} /> Publish
                  </button>
                )}
                {item.source === 'user' && (
                  <button
                    type="button"
                    className="pb-btn pb-btn-sm pb-btn-ghost"
                    onClick={() => navigate(`/studio/${item.id}`)}
                  >
                    Edit
                  </button>
                )}
                {(isAdmin || item.source === 'user') && item.source !== 'library' && (
                  <button
                    type="button"
                    className="pb-icon-btn"
                    title="Delete"
                    onClick={() => {
                      if (!window.confirm(`Remove “${item.title}”?`)) return;
                      if (item.source === 'cloud') {
                        void deleteSpeechDoc(item.id)
                          .then(() => {
                            void cloud.connect(true);
                            toast('Removed from the shared library', 'success');
                          })
                          .catch((error: unknown) => toast((error as Error)?.message ?? 'Could not delete', 'error'));
                      } else {
                        deleteSpeech(item.id);
                        toast('Deleted', 'success');
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {isAdmin && item.source === 'cloud' && (
                  <button
                    type="button"
                    className="pb-btn pb-btn-sm pb-btn-ghost"
                    onClick={() => {
                      void updateSpeechDoc(item.id, { ad: !item.ad })
                        .then(() => {
                          void cloud.connect(true);
                          toast(item.ad ? 'Sponsor slot removed' : 'Marked sponsor-supported', 'success');
                        })
                        .catch((error: unknown) => toast((error as Error)?.message ?? 'Could not update', 'error'));
                    }}
                  >
                    {item.ad ? 'Remove ad' : 'Mark ad'}
                  </button>
                )}
                <button
                  type="button"
                  className="pb-icon-btn"
                  title={hidden.includes(item.id) ? 'Show on the shelf' : 'Hide from the shelf'}
                  onClick={() => {
                    setHidden(item.id, !hidden.includes(item.id));
                    toast(hidden.includes(item.id) ? 'Back on the shelf' : 'Hidden', 'success');
                  }}
                >
                  <EyeOff size={14} />
                </button>
              </div>
            ))}
            {!visible.length && (
              <p className="pb-muted" style={{ padding: '20px 0', textAlign: 'center' }}>
                Nothing matches “{filter}”.
              </p>
            )}
          </div>
        </section>
      )}

      {tab === 'data' && (
        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Database size={17} /> Data portability
          </h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="pb-btn" onClick={exportAll}>
              <FileDown size={16} /> Export everything (JSON)
            </button>
            <button type="button" className="pb-btn" onClick={() => fileRef.current?.click()}>
              <FileUp size={16} /> Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="pb-btn pb-btn-danger"
              onClick={() => {
                if (window.confirm('Delete every draft, note, bookmark and reading position on this device?')) {
                  resetLocal();
                  toast('Local data cleared', 'success');
                }
              }}
            >
              <Trash2 size={16} /> Reset this device
            </button>
          </div>
          <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 10, lineHeight: 1.65 }}>
            The starter library ships with the app, so it comes straight back after a reset. This only
            clears what you added.
          </p>
        </section>
      )}

      {tab === 'cloud' && (
        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Cloud size={17} /> Cloud {FIREBASE_ENABLED ? '' : '(not configured)'}
          </h2>
          <div className="pb-well" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                width: 9, height: 9, borderRadius: 999,
                background: cloud.status === 'online' ? 'var(--c-ok)' : cloud.status === 'error' ? 'var(--c-warn)' : 'var(--c-ink-muted)',
              }}
            />
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {cloud.status === 'online'
                  ? `Connected · ${cloud.items.length} shared speeches`
                  : cloud.status === 'connecting'
                    ? 'Connecting…'
                    : cloud.status === 'error'
                      ? 'Cloud unreachable'
                      : 'Local only'}
              </div>
              <div className="pb-muted" style={{ fontSize: '0.76rem' }}>
                {FIREBASE_PROJECT ? `Project: ${FIREBASE_PROJECT}` : 'Add VITE_FIREBASE_* variables to enable sync.'}
                {cloud.error ? ` · ${cloud.error}` : ''}
              </div>
            </div>
            <button type="button" className="pb-btn pb-btn-sm" onClick={() => void cloud.connect(true)} disabled={!FIREBASE_ENABLED}>
              <RefreshCw size={14} /> Sync now
            </button>
          </div>

          <h3 style={{ fontSize: '0.95rem', margin: '18px 0 8px' }}>Sign in</h3>
          {user ? (
            <div className="pb-well" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.displayName ?? user.email}</div>
                <div className="pb-muted" style={{ fontSize: '0.74rem' }}>
                  {user.email} · role: {role ?? 'member'}
                </div>
              </div>
              <button type="button" className="pb-btn pb-btn-sm" onClick={() => void refreshRole()}>
                Check role
              </button>
              <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => void useAuth.getState().signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <p className="pb-muted" style={{ fontSize: '0.86rem', lineHeight: 1.65 }}>
              Not signed in. Reading works either way; liking, sharing and publishing need an account.
            </p>
          )}
        </section>
      )}

      {tab === 'comfort' && (
        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Accessibility size={17} /> Comfort &amp; accessibility
          </h2>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Field icon={Waves} label="Motion" hint="Follow your device, or force movement on or off.">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['auto', 'off', 'on'] as ReducedMotionPref[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`pb-chip ${reducedMotion === value ? 'pb-chip-accent' : ''}`}
                    onClick={() => setReducedMotion(value)}
                  >
                    {value === 'auto' ? 'Follow device' : value === 'off' ? 'Always off' : 'Always on'}
                  </button>
                ))}
              </div>
            </Field>
            <Field icon={Contrast} label="Contrast" hint="Strengthen rules and text hierarchy.">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['off', 'medium', 'high'] as ContrastBoost[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`pb-chip ${contrast === value ? 'pb-chip-accent' : ''}`}
                    onClick={() => setContrast(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </Field>
            <Field icon={Palette} label="Ambient wash" hint="The soft colour behind the paper.">
              <button type="button" className={`pb-chip ${ambient ? 'pb-chip-accent' : ''}`} onClick={toggleAmbient}>
                {ambient ? 'On' : 'Off'}
              </button>
            </Field>
            <Field icon={RotateCcw} label="Theme" hint="Back to the house combination.">
              <button
                type="button"
                className="pb-btn pb-btn-sm"
                onClick={() => {
                  resetTheme();
                  toast('Theme reset to Sand & Terracotta', 'success');
                }}
              >
                <RotateCcw size={14} /> Reset theme
              </button>
            </Field>
          </div>
        </section>
      )}

      {tab === 'admin' && isAdmin && (
        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Shield size={17} />
            <h2 style={{ fontSize: '1.05rem' }}>
              {isOwner ? 'Owner' : 'Admin'} panel
            </h2>
            <span className="pb-stamp" style={{ marginLeft: 8 }}>
              {role}
            </span>
            <div style={{ flex: 1 }} />
            <button type="button" className="pb-btn pb-btn-sm" onClick={() => void loadAdmin()} disabled={adminLoading}>
              <RefreshCw size={13} /> {adminLoading ? 'Loading…' : 'Reload'}
            </button>
          </div>
          <p className="pb-muted" style={{ fontSize: '0.82rem', marginBottom: 16, lineHeight: 1.65 }}>
            {isOwner
              ? 'You can manage people, roles, published speeches and open-mic notes.'
              : 'You can manage published speeches and open-mic notes. Only the owner can change roles.'}
          </p>

          <h3 style={{ fontSize: '0.92rem', margin: '8px 0' }}>People ({users.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
            {users.map((person) => (
              <div key={person.uid} className="pb-panel-flat" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{person.displayName ?? 'No name given'}</div>
                  <div className="pb-muted" style={{ fontSize: '0.72rem' }}>
                    {person.email} · {person.providerId ?? 'unknown provider'}
                  </div>
                </div>
                {isOwner && (
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

          <h3 style={{ fontSize: '0.92rem', margin: '8px 0' }}>Open mic notes ({posts.length})</h3>
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
                        void loadAdmin();
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

      {!isAdmin && (
        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <KeyRound size={17} /> Admin access
          </h2>
          {user ? (
            <>
              <p className="pb-soft" style={{ fontSize: '0.86rem', lineHeight: 1.7, marginBottom: 12 }}>
                You are signed in as {user.email}. The admin panel appears here as soon as your account
                is listed in the <span className="pb-mono">admins</span> collection with the role{' '}
                <span className="pb-mono">admin</span> or <span className="pb-mono">owner</span>.
              </p>
              {isOwner === false && (
                <button
                  type="button"
                  className="pb-btn"
                  onClick={() => {
                    if (!window.confirm('Make this account the owner? Only do this once, on your own account.')) return;
                    void bootstrapOwner(user.uid, user.email, user.displayName)
                      .then(() => {
                        void refreshRole();
                        toast('You are now the owner', 'success');
                      })
                      .catch((error: unknown) => toast((error as Error)?.message ?? 'Could not bootstrap', 'error'));
                  }}
                >
                  <Crown size={15} /> Make this account the owner
                </button>
              )}
            </>
          ) : (
            <p className="pb-soft" style={{ fontSize: '0.86rem', lineHeight: 1.7 }}>
              Sign in with Google or Microsoft, then use the button above to claim owner access once.
              This replaces the seeded e-mail and password list the old site shipped with — no password
              is ever stored in the database.
            </p>
          )}
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

function Field({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: typeof Waves;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-well" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon size={15} style={{ color: 'var(--c-accent)' }} />
        <strong style={{ fontSize: '0.85rem' }}>{label}</strong>
      </div>
      <p className="pb-muted" style={{ fontSize: '0.74rem', marginBottom: 10 }}>{hint}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}
