'use client';

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '@/lib/router';
import { Feather, FilePlus2, Layers, Mic2, Save, Trash2 } from 'lucide-react';
import { LIBRARY, type Speech } from '../data/speeches';
import { useLibrary, TEMPLATE_BODY } from '../store/library';
import { useUi } from '../store/ui';
import { useAuth } from '../store/auth';
import { useCloud } from '../store/cloud';
import { publishSpeech, updateSpeechDoc } from '../services/data';
import { useProfile } from '../store/profile';
import { checkOriginality, contentSlug, COPYRIGHT_THRESHOLD } from '../lib/identity';
import { workPath } from '../lib/paths';
import { LIBRARY as LIB } from '../data/speeches';
import { shortUrl } from '../lib/share';
import { useGate } from '../components/SignIn';
import { analyse, formatDate } from '../lib/text';
import { copyText } from '../lib/platform';
import { pageMetaFor } from '../data/routes';
import { SITE_URL } from '../lib/seo';
import { usePageMeta } from '../lib/usePageMeta';

const TEMPLATES = LIBRARY.filter((item) => item.kind === 'template');

export function StudioPage() {
  const meta = pageMetaFor('/write');
  usePageMeta(meta?.title ?? 'Studio', {
    description: meta?.description,
    image: meta?.card ? `${SITE_URL}/cards/${meta.card}.png` : undefined,
    jsonLd: meta?.jsonLd,
  });

  const { id } = useParams<{ id: string }>();
  const mine = useLibrary((s) => s.mine);

  if (id) {
    const owned = mine.find((item) => item.id === id);
    if (owned) return <Editor key={id} initial={owned} />;
    // Published examples belong in the reading room; a /write address may
    // open only a locally owned draft, never make a copy for remixing.
    return <NotFoundNotice id={id} />;
  }

  return <StudioHome />;
}

function NotFoundNotice({ id }: { id: string }) {
  return (
    <div className="pb-panel" style={{ padding: 40, textAlign: 'center' }}>
      <h2 style={{ marginBottom: 8 }}>That draft is gone</h2>
      <p className="pb-muted" style={{ marginBottom: 18 }}>
        No draft saved on this device matches <span className="pb-mono">{id}</span>. Published speeches stay in the reading room and cannot be copied into a new draft here.
      </p>
      <Link to="/studio" className="pb-btn pb-btn-primary">
        Back to the studio
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing: my drafts + templates                                       */
/* ------------------------------------------------------------------ */

function StudioHome() {
  const mine = useLibrary((s) => s.mine);
  const createSpeech = useLibrary((s) => s.createSpeech);
  const deleteSpeech = useLibrary((s) => s.deleteSpeech);
  const navigate = useNavigate();
  const toast = useUi((s) => s.toast);

  const startFromTemplate = (template: Speech) => {
    const newId = createSpeech({
      title: template.title.replace(/^Template:\s*/, 'My '),
      content: template.content,
      preview: template.preview,
      category: 'My speeches',
      occasion: template.occasion,
      tags: template.tags,
    });
    toast('New draft created from template', 'success');
    navigate(`/write/${newId}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(18px, 3vw, 30px)' }}>
        <span className="pb-eyebrow">The studio</span>
        <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.1rem)', margin: '8px 0 10px' }}>
          Draft it, then let the coach read it back
        </h1>
        <p className="pb-soft" style={{ maxInlineSize: '58ch' }}>
          Everything you write is saved on this device as you type. The coach watches your
          structure, pacing and filler words in real time — no account, no upload.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pb-btn pb-btn-primary pb-btn-lg"
            onClick={() => {
              const newId = createSpeech({ content: TEMPLATE_BODY, title: 'Untitled speech' });
              navigate(`/write/${newId}`);
            }}
          >
            <FilePlus2 size={18} /> New speech
          </button>
          <Link to="/practice" className="pb-btn pb-btn-lg">
            <Mic2 size={18} /> Open teleprompter
          </Link>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Your drafts ({mine.length})</h2>
        {!mine.length && (
          <div className="pb-panel" style={{ padding: 28, textAlign: 'center' }}>
            <p className="pb-muted">
              Nothing here yet. Start a blank speech or pick a structure template below.
            </p>
          </div>
        )}
        <div style={{ display: 'grid', gap: 10 }}>
          {mine.map((item) => {
            const stats = analyse(item.content);
            return (
              <div
                key={item.id}
                className="pb-panel"
                style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <Link to={`/write/${item.id}`} style={{ fontWeight: 650, fontSize: '1rem' }}>
                    {item.title}
                  </Link>
                  <div className="pb-muted" style={{ fontSize: '0.76rem', marginTop: 3 }}>
                    {item.status === 'draft' ? 'Draft' : 'Published'} · {stats.words} words ·{' '}
                    {stats.minutes} min · edited {formatDate(item.updatedAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link to={`/rehearse/${item.id}`} className="pb-btn pb-btn-sm">
                    <Mic2 size={14} /> Rehearse
                  </Link>
                  <Link to={`/read/${item.id}`} className="pb-btn pb-btn-sm pb-btn-outline">
                    Read
                  </Link>
                  <button
                    type="button"
                    className="pb-icon-btn"
                    onClick={() => {
                      deleteSpeech(item.id);
                      toast('Draft deleted', 'success');
                    }}
                    aria-label={`Delete ${item.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Start from a proven structure</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
            gap: 12,
          }}
        >
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="pb-card"
              onClick={() => startFromTemplate(template)}
            >
              <span className="pb-eyebrow">{template.occasion}</span>
              <span className="pb-card-title">{template.title.replace(/^Template:\s*/, '')}</span>
              <span className="pb-soft" style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>
                {template.preview}
              </span>
              <span className="pb-chip" style={{ alignSelf: 'flex-start' }}>
                <Layers size={11} /> Use template
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                               */
/* ------------------------------------------------------------------ */

type EditorSpeech = Speech & {
  status?: 'draft' | 'published';
  source?: string;
  cloudId?: string;
  slug?: string;
  folder?: string;
};

function Editor({ initial }: { initial: EditorSpeech }) {
  const navigate = useNavigate();
  const toast = useUi((s) => s.toast);
  const updateSpeech = useLibrary((s) => s.updateSpeech);
  const user = useAuth((s) => s.user);
  const connect = useCloud((s) => s.connect);
  const gate = useGate();
  const [sharing, setSharing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [draft, setDraft] = useState({
    title: initial.title,
    category: initial.category === 'My speeches' ? '' : initial.category,
    preview: initial.preview,
    content: initial.content,
    credits: initial.credits ?? '',
    slug: initial.slug ?? '',
    folder: initial.folder ?? '',
  });

  // Draft persistence is local-only. The server is not contacted until the
  // writer explicitly chooses Share.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateSpeech(initial.id, {
        title: draft.title,
        category: draft.category || 'My speeches',
        preview: draft.preview,
        content: draft.content,
        credits: draft.credits,
        slug: draft.slug || contentSlug(draft.title),
        folder: draft.folder,
      });
      setSavedAt(Date.now());
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, initial.id, updateSpeech]);

  const generatedPreview = draft.content
    .replace(/^\s*#+\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

  const patch = (key: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const saveLocal = () => {
    updateSpeech(initial.id, {
      title: draft.title,
      category: draft.category || 'My speeches',
      preview: draft.preview,
      content: draft.content,
      credits: draft.credits,
      slug: draft.slug || contentSlug(draft.title),
      folder: draft.folder,
    });
    setSavedAt(Date.now());
    toast('Saved on this device', 'success');
  };

  const share = () => {
    gate(() => {
      if (!draft.title.trim() || !draft.content.trim()) {
        toast('Add a title and a few words before sharing.', 'warn');
        return;
      }
      const currentProfile = useProfile.getState();
      if (!currentProfile.username) {
        toast('Claim your username first — it is the address beside your name.', 'warn');
        navigate('/claim');
        return;
      }
      const hit = checkOriginality(draft.content, LIB.filter((item) => item.id !== initial.id));
      if (hit && hit.score >= COPYRIGHT_THRESHOLD) {
        toast(`This is very close to “${hit.title}”. Rewrite it in your own words before sharing.`, 'error');
        return;
      }

      setSharing(true);
      void (async () => {
        const slug = draft.slug || contentSlug(draft.title);
        const input = {
          title: draft.title.trim(),
          content: draft.content,
          preview: draft.preview.trim() || generatedPreview,
          category: draft.category.trim(),
          credits: draft.credits.trim(),
          slug,
          folder: draft.folder,
          allowCopy: true,
        };
        let cloudId = initial.cloudId;
        if (cloudId) {
          await updateSpeechDoc(cloudId, input);
        } else {
          const published = await publishSpeech(input, user!.uid, user!.displayName ?? user!.email ?? '');
          cloudId = published.id;
        }
        updateSpeech(initial.id, {
          cloudId,
          status: 'published',
          category: draft.category || 'My speeches',
          preview: input.preview,
          title: input.title,
          content: input.content,
          credits: input.credits,
          slug,
          folder: draft.folder,
          allowCopy: true,
        });
        const address = workPath(currentProfile.username, slug, draft.folder);
        const copied = await copyText(shortUrl(address));
        toast(copied ? `Shared — link copied: ${shortUrl(address)}` : `Shared at ${shortUrl(address)}`, 'success');
        void connect(true);
      })()
        .catch((error: unknown) => toast((error as Error)?.message ?? 'The presentation could not be shared.', 'error'))
        .finally(() => setSharing(false));
    }, 'Sign in to share — the words stay on this device until you choose to publish them.');
  };

  return (
    <section className="pb-writing-space anim-write-open" aria-label="Presentation writing space">
      <div className="pb-writing-toolbar">
        <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => navigate('/write')}>
          ← Drafts
        </button>
        <div className="pb-writing-save-state" aria-live="polite">
          {savedAt ? 'Saved on this device' : 'Your words stay on this device'}
        </div>
      </div>

      <div className="pb-writing-paper">
        <div className="pb-writing-flower" aria-hidden="true">✿</div>
        <label className="sr-only" htmlFor="studio-title">Presentation title</label>
        <input
          id="studio-title"
          className="pb-writing-title"
          value={draft.title}
          onChange={(event) => patch('title', event.target.value)}
          placeholder="Give it a title"
          maxLength={140}
          autoComplete="off"
        />
        <label className="sr-only" htmlFor="studio-content">Presentation content</label>
        <textarea
          id="studio-content"
          className="pb-writing-body"
          value={draft.content}
          onChange={(event) => patch('content', event.target.value)}
          placeholder="Begin anywhere. The first line does not have to be the first line."
          spellCheck
        />
        <details className="pb-writing-details" open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
          <summary>Optional details</summary>
          <div className="pb-writing-fields">
            <label>
              <span className="pb-label">Category</span>
              <input className="pb-input" value={draft.category} onChange={(event) => patch('category', event.target.value)} placeholder="A subject, if useful" maxLength={80} />
            </label>
            <label>
              <span className="pb-label">Preview</span>
              <input className="pb-input" value={draft.preview} onChange={(event) => patch('preview', event.target.value)} placeholder="Leave blank to make one from your opening lines" maxLength={240} />
            </label>
            <label>
              <span className="pb-label">Credits</span>
              <input className="pb-input" value={draft.credits} onChange={(event) => patch('credits', event.target.value)} placeholder="People, sources, or help to acknowledge" maxLength={1000} />
            </label>
          </div>
        </details>
        <div className="pb-writing-footnote">
          {draft.content.trim() ? `${draft.content.trim().split(/\s+/).length} words` : 'A quiet page, ready when you are'}
        </div>
      </div>

      <div className="pb-writing-actions" aria-label="What would you like to do next?">
        <button type="button" className="pb-btn pb-btn-primary" onClick={share} disabled={sharing || !draft.title.trim() || !draft.content.trim()}>
          <Feather size={15} /> {sharing ? 'Sharing…' : initial.cloudId ? 'Share changes' : 'Share'}
        </button>
        <button type="button" className="pb-btn" onClick={() => { saveLocal(); navigate(`/rehearse/${encodeURIComponent(initial.id)}`); }}>
          <Mic2 size={15} /> Rehearse
        </button>
        <button type="button" className="pb-btn pb-btn-ghost" onClick={saveLocal}>
          <Save size={15} /> Save
        </button>
      </div>
      <p className="pb-writing-privacy">Nothing is uploaded while you write. Sharing is the only action that publishes these words.</p>
    </section>
  );
}
