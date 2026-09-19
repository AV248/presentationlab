import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accessibility,
  Cloud,
  Contrast,
  Database,
  Download,
  EyeOff,
  FileDown,
  FileUp,
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
import { useUi } from '../store/ui';
import { CLOUD_ENABLED, publishToCloud } from '../services/cloud';
import { formatCount } from '../lib/text';

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

  const reducedMotion = useSettings((s) => s.reducedMotion);
  const setReducedMotion = useSettings((s) => s.setReducedMotion);
  const contrast = useSettings((s) => s.contrast);
  const setContrast = useSettings((s) => s.setContrast);
  const ambient = useSettings((s) => s.ambient);
  const toggleAmbient = useSettings((s) => s.toggleAmbient);
  const resetTheme = useSettings((s) => s.resetTheme);

  const cloud = useCloud();
  const [filter, setFilter] = useState('');

  const storage = useMemo(() => {
    let bytes = 0;
    try {
      bytes = new Blob([localStorage.getItem('pb.library.v1') ?? '']).size;
    } catch {
      bytes = 0;
    }
    return bytes;
  }, [mine, hidden]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return items.filter((item) =>
      !needle ? true : item.title.toLowerCase().includes(needle) || item.author.toLowerCase().includes(needle),
    );
  }, [items, filter]);

  const exportAll = () => {
    const payload = JSON.stringify(
      {
        app: 'Presentation Buddy',
        version: 1,
        exportedAt: new Date().toISOString(),
        speeches: items.map(({ id, title, author, category, occasion, level, tags, preview, content, createdAt }) => ({
          id,
          title,
          author,
          category,
          occasion,
          level,
          tags,
          preview,
          content,
          createdAt,
        })),
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(18px, 3vw, 28px)' }}>
        <span className="pb-eyebrow">Control room</span>
        <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', margin: '8px 0 8px' }}>
          Everything on this device
        </h1>
        <p className="pb-soft" style={{ maxInlineSize: '58ch' }}>
          Presentation Buddy is local-first. Your drafts, likes, bookmarks and reading progress never
          leave this device. Manage them here, and move them between devices with an export file.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginTop: 18,
          }}
        >
          <Stat label="Speeches" value={String(items.length)} />
          <Stat label="Yours" value={String(mine.length)} />
          <Stat label="Hidden" value={String(hidden.length)} />
          <Stat label="Local data" value={`${(storage / 1024).toFixed(1)} KB`} />
        </div>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Database size={17} /> Data portability
        </h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="pb-btn" onClick={exportAll}>
            <FileDown size={16} /> Export library (JSON)
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
              if (window.confirm('Delete every speech, like and bookmark stored on this device?')) {
                resetLocal();
                toast('Local data cleared', 'success');
              }
            }}
          >
            <Trash2 size={16} /> Reset local data
          </button>
        </div>
        <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 10 }}>
          The bundled library is part of the app and reappears after a reset — this only clears your
          own additions.
        </p>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Cloud size={17} /> Cloud sync {CLOUD_ENABLED ? '' : '(not configured)'}
        </h2>
        <div
          className="pb-well"
          style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background:
                cloud.status === 'online'
                  ? 'var(--c-ok)'
                  : cloud.status === 'error'
                    ? 'var(--c-warn)'
                    : 'var(--c-ink-muted)',
              boxShadow: '0 0 10px currentColor',
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
              {cloud.project ? `Project: ${cloud.project}` : 'Add VITE_FIREBASE_* variables to enable sync.'}
              {cloud.error ? ` · ${cloud.error}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="pb-btn pb-btn-sm" onClick={() => void cloud.connect(true)} disabled={!CLOUD_ENABLED}>
              <RefreshCw size={14} /> Sync now
            </button>
            {mine
              .filter((speech) => speech.status === 'published')
              .slice(0, 1)
              .map((speech) => (
                <button
                  key={speech.id}
                  type="button"
                  className="pb-btn pb-btn-sm"
                  disabled={!CLOUD_ENABLED}
                  onClick={async () => {
                    const result = await publishToCloud(speech);
                    toast(result.ok ? 'Published to the cloud' : result.error ?? 'Publish failed', result.ok ? 'success' : 'error');
                    if (result.ok) void cloud.connect(true);
                  }}
                >
                  <Upload size={14} /> Publish latest
                </button>
              ))}
          </div>
        </div>
        <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 10 }}>
          Cloud sync is optional. If it is off, unreachable, or blocked by your Firestore rules,
          everything else in Presentation Buddy keeps working exactly the same.
        </p>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Accessibility size={17} /> Comfort &amp; accessibility
        </h2>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <Field
            icon={Waves}
            label="Motion"
            hint="Follow the device setting, or force animation on or off."
          >
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

          <Field icon={Contrast} label="Contrast" hint="Strengthen borders and text hierarchy.">
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

          <Field icon={Palette} label="Ambient art" hint="Background light field and orbiting orbs.">
            <button
              type="button"
              className={`pb-chip ${ambient ? 'pb-chip-accent' : ''}`}
              onClick={toggleAmbient}
            >
              {ambient ? 'On' : 'Off'}
            </button>
          </Field>

          <Field icon={RefreshCw} label="Theme" hint="Restore the default combination.">
            <button
              type="button"
              className="pb-btn pb-btn-sm"
              onClick={() => {
                resetTheme();
                toast('Theme reset', 'success');
              }}
            >
              <RotateCcw size={14} /> Reset theme
            </button>
          </Field>
        </div>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <Shield size={17} />
          <h2 style={{ fontSize: '1.05rem' }}>Content management</h2>
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
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visible.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 2px',
                borderBottom: '1px solid var(--c-line-soft)',
                flexWrap: 'wrap',
                opacity: item.source === 'library' && hidden.includes(item.id) ? 0.5 : 1,
              }}
            >
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{item.title}</div>
                <div className="pb-muted" style={{ fontSize: '0.72rem' }}>
                  {item.source} · {item.author} · {formatCount(item.words)} words
                </div>
              </div>
              {item.source === 'user' && (
                <>
                  <button
                    type="button"
                    className="pb-btn pb-btn-sm pb-btn-ghost"
                    onClick={() => navigate(`/studio/${item.id}`)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="pb-icon-btn"
                    onClick={() => {
                      deleteSpeech(item.id);
                      toast('Deleted', 'success');
                    }}
                    aria-label={`Delete ${item.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="pb-icon-btn"
                title={hidden.includes(item.id) ? 'Show in library' : 'Hide from library'}
                onClick={() => {
                  setHidden(item.id, !hidden.includes(item.id));
                  toast(hidden.includes(item.id) ? 'Restored' : 'Hidden from the library', 'success');
                }}
              >
                <EyeOff size={14} />
              </button>
              <button
                type="button"
                className="pb-icon-btn"
                title="Download"
                onClick={() => {
                  const blob = new Blob([`# ${item.title}\n\n${item.content}`], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `${item.title.replace(/[^\w\d]+/g, '-').toLowerCase()}.md`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  setTimeout(() => URL.revokeObjectURL(url), 1200);
                }}
              >
                <Download size={14} />
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
