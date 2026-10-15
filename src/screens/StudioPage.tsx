'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from '@/lib/router';
import {
  CheckCircle2,
  Feather,
  Upload,
  CircleAlert,
  Copy,
  Download,
  Eye,
  FilePlus2,
  Layers,
  Mic,
  Mic2,
  PenLine,
  Save,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { WordSmith } from '../components/WordSmith';
import { LIBRARY, type Speech } from '../data/speeches';
import { useLibrary, TEMPLATE_BODY } from '../store/library';
import { useUi } from '../store/ui';
import { useAuth } from '../store/auth';
import { useCloud } from '../store/cloud';
import { pathTaken, publishSpeech } from '../services/data';
import { useProfile } from '../store/profile';
import { checkOriginality, contentSlug, COPYRIGHT_THRESHOLD } from '../lib/identity';
import { slugifySegment, workPath } from '../lib/paths';
import { LIBRARY as LIB } from '../data/speeches';
import { shortUrl } from '../lib/share';
import { FIRST_LINES, pick } from '../lib/heart';
import { useGate } from '../components/SignIn';
import { analyse, formatDate } from '../lib/text';
import { copyText, downloadFile, supportsDictation } from '../lib/platform';
import { useSpeeches } from '../hooks/useCollection';
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
  const items = useSpeeches();
  const mine = useLibrary((s) => s.mine);

  if (id) {
    const owned = mine.find((item) => item.id === id);
    if (owned) return <Editor key={id} initial={owned} />;
    const source = items.find((item) => item.id === id);
    if (source) return <Remix key={id} source={source} />;
    return <NotFoundNotice id={id} />;
  }

  return <StudioHome />;
}

/**
 * Opening a library speech in the studio copies it into your drafts first,
 * so the original is never edited in place.
 */
function Remix({ source }: { source: Speech }) {
  const navigate = useNavigate();
  const createSpeech = useLibrary((s) => s.createSpeech);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const newId = createSpeech({ ...source, title: `${source.title} (remix)` });
    navigate(`/write/${newId}`, { replace: true });
  }, [createSpeech, navigate, source]);

  return (
    <div className="pb-panel" style={{ padding: 40, textAlign: 'center' }}>
      <p className="pb-muted">Copying “{source.title}” into your drafts…</p>
    </div>
  );
}

function NotFoundNotice({ id }: { id: string }) {
  return (
    <div className="pb-panel" style={{ padding: 40, textAlign: 'center' }}>
      <h2 style={{ marginBottom: 8 }}>That draft is gone</h2>
      <p className="pb-muted" style={{ marginBottom: 18 }}>
        No local speech matches <span className="pb-mono">{id}</span>.
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

type ViewMode = 'edit' | 'preview' | 'split';

function Editor({
  initial,
}: {
  initial: Speech & { status?: 'draft' | 'published'; source?: string };
}) {
  const navigate = useNavigate();
  const toast = useUi((s) => s.toast);
  const updateSpeech = useLibrary((s) => s.updateSpeech);
  const deleteSpeech = useLibrary((s) => s.deleteSpeech);
  const setStatus = useLibrary((s) => s.setStatus);
  const user = useAuth((s) => s.user);
  const connect = useCloud((s) => s.connect);
  const gate = useGate();
  const [publishing, setPublishing] = useState(false);
  const [wizard, setWizard] = useState(false);

  const [draft, setDraft] = useState<{
    title: string; author: string; category: string; occasion: string; level: typeof initial.level;
    tags: string; preview: string; content: string; credits: string; signature: string;
    allowCopy: boolean; slug?: string; folder?: string;
  }>({
    title: initial.title,
    author: initial.author ?? 'You',
    category: initial.category,
    occasion: initial.occasion,
    level: initial.level,
    tags: initial.tags.join(', '),
    preview: initial.preview,
    content: initial.content,
    credits: initial.credits ?? '',
    signature: initial.signature ?? '',
    allowCopy: initial.allowCopy !== false,
    slug: (initial as { slug?: string }).slug,
    folder: (initial as { folder?: string }).folder,
  });
  const [view, setView] = useState<ViewMode>('split');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Where the cursor is sitting, so the word smith knows which word you mean.
  const [caret, setCaret] = useState(0);
  const timer = useRef<number | null>(null);

  const stats = useMemo(() => analyse(draft.content), [draft.content]);

  // Debounced autosave.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      updateSpeech(initial.id, {
        title: draft.title,
        // A link the writer chose is never overwritten by the title-derived
        // one while they type.
        slug: draft.slug || contentSlug(draft.title),
        folder: draft.folder ?? '',
        credits: draft.credits,
        signature: draft.signature,
        allowCopy: draft.allowCopy,
        author: draft.author,
        category: draft.category,
        occasion: draft.occasion,
        level: draft.level,
        tags: draft.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        preview: draft.preview,
        content: draft.content,
      });
      setSavedAt(Date.now());
    }, 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [draft, initial.id, updateSpeech]);

  const patch = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const dictation = () => {
    if (!supportsDictation()) {
      toast('Dictation is not supported in this browser', 'warn');
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    setListening(true);
    recognition.onresult = (event: RecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      patch('content', `${draft.content.replace(/\s+$/, '')} ${transcript.trim()}`.trimStart());
    };
    recognition.onerror = () => {
      setListening(false);
      toast('Dictation stopped', 'warn');
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const insertMarkdown = (prefix: string, suffix = prefix) => {
    const node = textareaRef.current;
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selected = draft.content.slice(start, end);
    const next = `${draft.content.slice(0, start)}${prefix}${selected}${suffix}${draft.content.slice(end)}`;
    patch('content', next);
    requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {wizard && <PublishWizard draft={draft} patch={patch as never} publishing={publishing} onClose={() => setWizard(false)} onPublish={() => {
        const profile = useProfile.getState();
        if (!profile.username) { toast('Claim your username first — your speech needs its own address.', 'warn'); navigate('/claim'); return; }
        const hit = checkOriginality(draft.content, LIB.filter(i=>i.id!==initial.id));
        if (hit && hit.score >= COPYRIGHT_THRESHOLD) { toast(`This looks too close to “${hit.title}” (${Math.round(hit.score*100)}% overlap). Rewrite in your own words before publishing.`, 'error'); return; }
        setPublishing(true);
        (async () => {
          const finalSlug = draft.slug || contentSlug(draft.title);
          const finalFolder = draft.folder ?? '';
          if (profile.username && await pathTaken(profile.username, finalFolder, finalSlug, (initial as { cloudId?: string }).cloudId)) {
            throw new Error(`/@${profile.username}${finalFolder ? `/${finalFolder}` : ''}/${finalSlug} is already one of your links — change the link or the folder.`);
          }
          const { id: cloudId } = await publishSpeech({ title: draft.title, content: draft.content, preview: draft.preview, category: draft.category, occasion: draft.occasion, tags: draft.tags.split(',').map((x)=>x.trim()).filter(Boolean), ad: false, username: profile.username, slug: finalSlug, folder: finalFolder, credits: draft.credits, signature: draft.signature || profile.signature, allowCopy: draft.allowCopy }, user!.uid, user!.displayName ?? user!.email ?? 'Anonymous');
          updateSpeech(initial.id, { cloudId, status: 'published', username: profile.username, slug: finalSlug, folder: finalFolder, credits: draft.credits, signature: draft.signature || profile.signature, allowCopy: draft.allowCopy });
          toast(`Published — ${shortUrl(workPath(profile.username, finalSlug, finalFolder))}`, 'success');
          setWizard(false);
          void connect(true);
        })()
          .catch((e: unknown) => toast((e as Error)?.message ?? 'Publish failed', 'error'))
          .finally(() => setPublishing(false));
      }} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => navigate('/write')}>
          ← All drafts
        </button>
        <div style={{ flex: 1 }} />
        <span className="pb-muted" style={{ fontSize: '0.75rem' }}>
          {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Autosave on'}
        </span>
        <div className="pb-well" style={{ display: 'flex', padding: 3, gap: 2 }}>
          {(['edit', 'split', 'preview'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`pb-btn pb-btn-sm ${view === mode ? '' : 'pb-btn-ghost'}`}
              style={{ background: view === mode ? 'var(--c-accent-soft)' : undefined }}
            >
              {mode === 'edit' ? <PenLine size={13} /> : mode === 'split' ? <Type size={13} /> : <Eye size={13} />}
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pb-btn pb-btn-sm"
          onClick={() => {
            setStatus(initial.id, initial.status === 'published' ? 'draft' : 'published');
            toast(
              initial.status === 'published'
                ? 'Moved back to drafts on this device'
                : 'Marked ready on this device',
              'success',
            );
          }}
        >
          <Save size={14} /> {initial.status === 'published' ? 'Back to draft' : 'Mark ready'}
        </button>
        <button
          type="button"
          className="pb-btn pb-btn-sm pb-btn-primary"
          disabled={publishing}
          onClick={() => gate(() => setWizard(true), 'Sign in to publish — we need to know whose words these are.')}
        >
<Upload size={14} /> Publish in steps…
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: view === 'split' ? 'minmax(0,1fr) minmax(0, 320px)' : 'minmax(0,1fr)',
          gap: 14,
          alignItems: 'start',
        }}
        data-studio-grid
      >
        <div className="pb-panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            className="pb-input"
            value={draft.title}
            onChange={(event) => patch('title', event.target.value)}
            placeholder="Speech title"
            style={{
              fontFamily: 'var(--x-font-display)',
              fontWeight: 700,
              fontSize: '1.35rem',
              background: 'transparent',
              border: 'none',
              padding: 0,
            }}
            aria-label="Speech title"
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <label className="pb-label" htmlFor="studio-author">
                Author
              </label>
              <input
                id="studio-author"
                className="pb-input"
                value={draft.author}
                onChange={(event) => patch('author', event.target.value)}
              />
            </div>
            <div>
              <label className="pb-label" htmlFor="studio-category">
                Category
              </label>
              <input
                id="studio-category"
                className="pb-input"
                value={draft.category}
                onChange={(event) => patch('category', event.target.value)}
              />
            </div>
            <div>
              <label className="pb-label" htmlFor="studio-occasion">
                Occasion
              </label>
              <input
                id="studio-occasion"
                className="pb-input"
                value={draft.occasion}
                onChange={(event) => patch('occasion', event.target.value)}
              />
            </div>
            <div>
              <label className="pb-label" htmlFor="studio-level">
                Level
              </label>
              <select
                id="studio-level"
                className="pb-select"
                value={draft.level}
                onChange={(event) => patch('level', event.target.value as Speech['level'])}
              >
                <option>Warm-up</option>
                <option>Standard</option>
                <option>Keynote</option>
              </select>
            </div>
          </div>

          <div>
            <label className="pb-label" htmlFor="studio-tags">
              Tags (comma separated)
            </label>
            <input
              id="studio-tags"
              className="pb-input"
              value={draft.tags}
              onChange={(event) => patch('tags', event.target.value)}
            />
          </div>

          <div>
            <label className="pb-label" htmlFor="studio-preview">
              One-line preview
            </label>
            <input
              id="studio-preview"
              className="pb-input"
              value={draft.preview}
              onChange={(event) => patch('preview', event.target.value)}
              placeholder="The line that appears on the card"
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span className="pb-label" style={{ margin: 0 }}>
                Script
              </span>
              <div style={{ flex: 1 }} />
              <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => insertMarkdown('## ')}>
                Heading
              </button>
              <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => insertMarkdown('**', '**')}>
                Bold
              </button>
              <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => insertMarkdown('> ')}>
                Quote
              </button>
              <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={() => insertMarkdown('\n- ')}>
                Bullet
              </button>
              <button
                type="button"
                className="pb-btn pb-btn-sm pb-btn-ghost"
                onClick={() => {
                  const line = pick(FIRST_LINES, draft.content.split('\n')[0]);
                  patch('content', `${line}\n\n${draft.content.replace(/^\s+/, '')}`);
                  toast('A first line to argue with', 'success');
                }}
                title="Drop in an opening line to get you moving"
              >
                <Feather size={13} /> First line
              </button>
              <button
                type="button"
                className={`pb-btn pb-btn-sm ${listening ? 'pb-btn-danger' : 'pb-btn-ghost'}`}
                onClick={dictation}
                title="Dictate with your microphone"
              >
                <Mic size={13} /> {listening ? 'Listening…' : 'Dictate'}
              </button>
            </div>

            {view !== 'preview' && (
              <textarea
                ref={textareaRef}
                className="pb-textarea"
                value={draft.content}
                onChange={(event) => {
                  patch('content', event.target.value);
                  setCaret(event.target.selectionStart);
                }}
                onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
                onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
                onClick={(event) => setCaret(event.currentTarget.selectionStart)}
                style={{ minHeight: '52vh', fontFamily: 'var(--x-font-body)', lineHeight: 1.7 }}
                placeholder="Start writing. Use ## for headings, - for bullets, > for quotes."
                aria-label="Speech script"
              />
            )}

            {view !== 'edit' && (
              <div
                className="pb-well"
                style={{
                  padding: '18px 20px',
                  marginTop: view === 'split' ? 12 : 0,
                  maxHeight: '52vh',
                  overflow: 'auto',
                }}
              >
                <Markdown text={draft.content || '_Nothing written yet._'} className="pb-prose" />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pb-btn pb-btn-sm"
              onClick={async () => {
                const ok = await copyText(draft.content);
                toast(ok ? 'Script copied' : 'Copy failed', ok ? 'success' : 'error');
              }}
            >
              <Copy size={14} /> Copy
            </button>
            <button
              type="button"
              className="pb-btn pb-btn-sm"
              onClick={() => {
                downloadFile(
                  `${draft.title.replace(/[^\w\d]+/g, '-').toLowerCase() || 'speech'}.md`,
                  `# ${draft.title}\n\n${draft.content}`,
                  'text/markdown',
                );
                toast('Downloaded', 'success');
              }}
            >
              <Download size={14} /> Export
            </button>
            <Link to={`/rehearse/${initial.id}`} className="pb-btn pb-btn-sm pb-btn-primary">
              <Mic2 size={14} /> Rehearse this
            </Link>
            <button
              type="button"
              className="pb-btn pb-btn-sm pb-btn-danger"
              onClick={() => {
                deleteSpeech(initial.id);
                toast('Draft deleted', 'success');
                navigate('/write');
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="pb-panel" style={{ padding: 16 }}>
            <span className="pb-eyebrow">Word smith</span>
            <p className="pb-muted" style={{ fontSize: '0.76rem', margin: '6px 0 12px', lineHeight: 1.6 }}>
              Put your cursor in a word to see what else it could be.
            </p>
            <WordSmith
              value={draft.content}
              caret={caret}
              compact
              onReplace={(from, to, replacement) => {
                const next = `${draft.content.slice(0, from)}${replacement}${draft.content.slice(to)}`;
                patch('content', next);
                const at = from + replacement.length;
                setCaret(at);
                // Put the cursor back where the writer left it.
                requestAnimationFrame(() => {
                  const node = textareaRef.current;
                  if (!node) return;
                  node.focus();
                  node.setSelectionRange(at, at);
                });
              }}
            />
          </div>

          <div className="pb-panel" style={{ padding: 16 }}>
            <span className="pb-eyebrow">Live metrics</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <Stat label="Words" value={String(stats.words)} />
              <Stat label="Minutes" value={String(stats.minutes)} />
              <Stat label="Sentences" value={String(stats.sentences)} />
              <Stat label="Paragraphs" value={String(stats.paragraphs)} />
            </div>
            <div className="pb-well" style={{ padding: '10px 12px', marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span className="pb-muted">Readability</span>
                <strong>{stats.level}</strong>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--c-surface-3)',
                  marginTop: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${stats.ease}%`,
                    background: 'var(--grad-brand)',
                  }}
                />
              </div>
              <span className="pb-muted" style={{ fontSize: '0.7rem' }}>
                Ease score {stats.ease}/100 · aim for 60+ when speaking aloud
              </span>
            </div>
          </div>

          <div className="pb-panel" style={{ padding: 16 }}>
            <span className="pb-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={13} /> Coach
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {stats.structure.map((finding) => (
                <div key={finding.id} style={{ display: 'flex', gap: 8, fontSize: '0.8rem' }}>
                  {finding.ok ? (
                    <CheckCircle2 size={15} style={{ flex: '0 0 auto', color: 'var(--c-ok)' }} />
                  ) : (
                    <CircleAlert size={15} style={{ flex: '0 0 auto', color: 'var(--c-warn)' }} />
                  )}
                  <span>
                    <strong style={{ color: 'var(--c-ink)' }}>{finding.label}</strong>
                    <span className="pb-muted" style={{ display: 'block', lineHeight: 1.5 }}>
                      {finding.detail}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {stats.fillers.length > 0 && (
            <div className="pb-panel" style={{ padding: 16 }}>
              <span className="pb-eyebrow">Filler watch</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {stats.fillers.slice(0, 10).map((filler) => (
                  <span key={filler.word} className="pb-chip" style={{ borderColor: 'var(--c-warn)', color: 'var(--c-warn)' }}>
                    {filler.word} ×{filler.count}
                  </span>
                ))}
              </div>
              <p className="pb-muted" style={{ fontSize: '0.74rem', marginTop: 8 }}>
                Spoken English carries filler words comfortably — cut only the ones that add nothing.
              </p>
            </div>
          )}

          {stats.long.length > 0 && (
            <div className="pb-panel" style={{ padding: 16 }}>
              <span className="pb-eyebrow">Long sentences</span>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {stats.long.map((sentence, index) => (
                  <li key={index} className="pb-muted" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
                    “{sentence.slice(0, 120)}
                    {sentence.length > 120 ? '…' : ''}”
                  </li>
                ))}
              </ul>
              <p className="pb-muted" style={{ fontSize: '0.74rem', marginTop: 8 }}>
                Over 32 words is hard to say in one breath — split or trim.
              </p>
            </div>
          )}

          {stats.repeats.length > 0 && (
            <div className="pb-panel" style={{ padding: 16 }}>
              <span className="pb-eyebrow">Echoes</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {stats.repeats.map((repeat) => (
                  <span key={repeat.word} className="pb-chip">
                    {repeat.word} ×{repeat.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="pb-well" style={{ padding: '10px 12px' }}>
      <div style={{ fontFamily: 'var(--x-font-display)', fontWeight: 700, fontSize: '1.05rem' }}>{value}</div>
      <div className="pb-muted" style={{ fontSize: '0.7rem' }}>{label}</div>
    </div>
  );
}

interface RecognitionResult {
  0: { transcript: string };
  isFinal: boolean;
}

interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

/* Publish in easy steps (2.6): Title → Preview → Tags → Credits → Content → Signature → Category.
   Only Title and Content are mandatory. Content step runs the originality screen. */
const WIZARD_STEPS = ['Title','Preview','Tags','Credits','Content','Signature','Category'] as const;
function PublishWizard({ draft, patch, publishing, onClose, onPublish }: { draft: { title: string; preview: string; tags: string; credits: string; content: string; signature: string; category: string; occasion: string; allowCopy: boolean; slug?: string; folder?: string }; patch: (k: never, v: never) => void; publishing: boolean; onClose: () => void; onPublish: () => void }) {
  const [step, setStep] = useState(0);
  const profile = useProfile();
  const hit = useMemo(() => checkOriginality(draft.content, LIB.map((i) => ({ id: i.id, title: i.title, content: i.content }))), [draft.content]);
  const blocked = hit && hit.score >= COPYRIGHT_THRESHOLD;
  const name = WIZARD_STEPS[step];
  const set = (k: string, v: string | boolean) => (patch as (k: string, v: unknown) => void)(k, v);
  return (
    <div className="pb-overlay" role="dialog" aria-modal="true" aria-label="Publish your speech" onClick={onClose}>
      <div className="pb-modal" style={{ maxWidth: 640, width: 'min(640px, calc(100vw - 28px))' }} onClick={(e) => e.stopPropagation()}>
        <span className="pb-eyebrow">Publish · step {step + 1} of {WIZARD_STEPS.length}</span>
        <h2 style={{ margin: '8px 0 12px' }}>{name}</h2>
        <div className="pb-wizard-steps">{WIZARD_STEPS.map((s, i) => <span key={s} data-on={i === step}>{s}</span>)}</div>
        {name === 'Title' && <><label className="pb-label">Title *</label><input className="pb-input" value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="The name your speech climbs under" /></>}
        {name === 'Preview' && <><label className="pb-label">Preview</label><textarea className="pb-textarea" rows={3} value={draft.preview} onChange={(e) => set('preview', e.target.value)} placeholder="One honest line that makes a stranger stop scrolling" /></>}
        {name === 'Tags' && <><label className="pb-label">Tags</label><input className="pb-input" value={draft.tags} onChange={(e) => set('tags', e.target.value)} placeholder="manifestation, morning, courage" /><p className="pb-muted" style={{fontSize:'.78rem',marginTop:6}}>Comma separated. Three good ones beat ten vague ones.</p></>}
        {name === 'Credits' && <><label className="pb-label">Credits</label><input className="pb-input" value={draft.credits} onChange={(e) => set('credits', e.target.value)} placeholder="Who helped, inspired or is quoted — credit them here" /><label style={{display:'flex',gap:8,alignItems:'flex-start',marginTop:14,fontSize:'.86rem',lineHeight:1.5}}><input type="checkbox" checked={!draft.allowCopy} onChange={(e) => set('allowCopy', !e.target.checked)} style={{marginTop:3}} /> <span><strong>Protect my copyright.</strong> Readers can read and rehearse here, but cannot copy, download or print this speech.</span></label></>}
        {name === 'Content' && <><label className="pb-label">Content *</label><textarea className="pb-textarea" rows={8} value={draft.content} onChange={(e) => set('content', e.target.value)} />{hit ? <p style={{fontSize:'.82rem',lineHeight:1.6,marginTop:8,color: blocked ? 'var(--c-bad)' : 'var(--c-warn)'}}>{blocked ? `⛔ Too close to “${hit.title}” (${Math.round(hit.score*100)}% overlapping passages${hit.sharedPhrase ? ` — e.g. “${hit.sharedPhrase}…”` : ''}). Publishing is paused until this is in your own words.` : `Note: a passage resembles “${hit.title}”. If you quoted it, credit it in the Credits step.`}</p> : <p className="pb-muted" style={{fontSize:'.82rem',marginTop:8}}>✓ No matching content found in the library. Your words read as your own.</p>}</>}
        {name === 'Signature' && <><label className="pb-label">Signature</label><input className="pb-input" value={draft.signature} onChange={(e) => set('signature', e.target.value)} placeholder={profile.signature || 'The line you sign with'} /></>}
        {name === 'Category' && (
          <>
            <label className="pb-label">Category</label>
            <input className="pb-input" value={draft.category} onChange={(e) => set('category', e.target.value)} placeholder="Manifestation" />
            <label className="pb-label" style={{marginTop:12}}>Occasion</label>
            <input className="pb-input" value={draft.occasion} onChange={(e) => set('occasion', e.target.value)} placeholder="Morning gathering" />

            {/* The address is the writer's to shape: /you/<folder>/<link>,
                one folder at most, never the same address twice. */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--c-line)' }}>
              <span className="pb-label" style={{ display: 'block', marginBottom: 6 }}>Where it lives</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 10 }}>
                <input className="pb-input" value={draft.folder ?? ''} onChange={(e) => set('folder', slugifySegment(e.target.value))} placeholder="folder (optional)" aria-label="Folder" />
                <input className="pb-input" value={draft.slug ?? ''} onChange={(e) => set('slug', slugifySegment(e.target.value))} placeholder={contentSlug(draft.title || 'your-speech')} aria-label="Link" />
              </div>
              <p className="pb-muted" style={{ fontSize: '.78rem', marginTop: 6, lineHeight: 1.6 }}>
                {profile.username ? (
                  <>Yours to choose: <span className="pb-mono">{shortUrl(workPath(profile.username, draft.slug || contentSlug(draft.title || 'your-speech'), draft.folder ?? ''))}</span> — one folder allowed, and it must not match another of your own links.</>
                ) : (
                  <>You will claim your username next — your speech will live at <span className="pb-mono">{shortUrl(`/you/${contentSlug(draft.title || 'your-speech')}`)}</span></>
                )}
              </p>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className="pb-btn pb-btn-ghost" onClick={onClose}>Keep writing</button>
          <div style={{ flex: 1 }} />
          {step > 0 && <button type="button" className="pb-btn" onClick={() => setStep(step - 1)}>Back</button>}
          {step < WIZARD_STEPS.length - 1 ? <button type="button" className="pb-btn pb-btn-primary" disabled={(name === 'Title' && !draft.title.trim()) || (name === 'Content' && (!draft.content.trim() || Boolean(blocked)))} onClick={() => setStep(step + 1)}>Continue</button>
          : <button type="button" className="pb-btn pb-btn-primary" disabled={publishing || !draft.title.trim() || !draft.content.trim() || Boolean(blocked)} onClick={onPublish}>{publishing ? 'Publishing…' : 'Publish my speech'}</button>}
        </div>
      </div>
    </div>
  );
}
