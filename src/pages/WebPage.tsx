import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookmarkCheck, Globe, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { fetchCuratedWebSpeeches, searchWebSpeeches, type WebSpeech } from '../services/webSources';
import { pageMetaFor } from '../data/routes';
import { SITE_URL, usePageMeta } from '../lib/seo';

const SUGGESTIONS = [
  'freedom',
  'war',
  'suffrage',
  'labour',
  'education',
  'science',
  'farewell',
  'inaugural',
];

/**
 * From the web.
 *
 * Public-domain speeches, fetched live from Wikisource in the visitor's own
 * browser. Nothing here is written by us and nothing is claimed as ours:
 * every item carries a link and a licence.
 */
export function WebPage() {
  const meta = pageMetaFor('/web');
  usePageMeta(meta?.title ?? 'Web', {
    description: meta?.description,
    image: meta?.card ? `${SITE_URL}/cards/${meta.card}.png` : undefined,
    jsonLd: meta?.jsonLd,
  });

  const navigate = useNavigate();
  const shelf = useLibrary((s) => s.shelf);
  const addToShelf = useLibrary((s) => s.addToShelf);
  const removeFromShelf = useLibrary((s) => s.removeFromShelf);
  const toast = useUi((s) => s.toast);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WebSpeech[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [curated, setCurated] = useState<WebSpeech[]>([]);

  useEffect(() => {
    let alive = true;
    fetchCuratedWebSpeeches()
      .then((found) => {
        if (alive) setCurated(found);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onShelf = useMemo(() => new Set(shelf.map((item) => item.id)), [shelf]);

  const search = async (term: string) => {
    setLoading(true);
    setNotice(null);
    try {
      const found = await searchWebSpeeches(term, 12);
      setResults(found);
      if (!found.length) {
        setNotice(
          'Nothing came back. Wikisource may be unreachable from this network — try again in a moment, or browse your shelf below.',
        );
      }
    } catch {
      setNotice('The web library could not be reached just now. Your saved speeches are still below.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (speech: WebSpeech) => {
    if (onShelf.has(speech.id)) {
      removeFromShelf(speech.id);
      toast('Removed from your shelf', 'success');
      return;
    }
    addToShelf(speech);
    toast('Saved to your shelf — it now appears in the library', 'success');
  };

  const renderList = (list: WebSpeech[], heading: string) => (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pb-rule">
        <span>{heading}</span>
      </div>
      {list.length === 0 ? (
        <p className="pb-muted" style={{ fontSize: '0.86rem' }}>Nothing here yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
          {list.map((speech) => (
            <article key={speech.id} className="pb-card" style={{ gap: 8 }}>
              <span className="pb-muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {speech.licence} · {speech.source}
              </span>
              <h3 className="pb-card-title">{speech.title}</h3>
              <p className="pb-soft" style={{ fontSize: '0.86rem', lineHeight: 1.6 }}>
                {speech.preview.slice(0, 200)}…
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--c-line-soft)' }}>
                <button type="button" className="pb-btn pb-btn-sm" onClick={() => toggle(speech)}>
                  <BookmarkCheck size={14} /> {onShelf.has(speech.id) ? 'On your shelf' : 'Add to shelf'}
                </button>
                <button
                  type="button"
                  className="pb-btn pb-btn-sm pb-btn-ghost"
                  onClick={() => {
                    if (!onShelf.has(speech.id)) addToShelf(speech);
                    navigate(`/read/${encodeURIComponent(speech.id)}`);
                  }}
                >
                  Read
                </button>
                <a
                  className="pb-btn pb-btn-sm pb-btn-ghost"
                  href={speech.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Original ↗
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 32px)' }}>
        <span className="pb-eyebrow">From the web</span>
        <h1 style={{ fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', margin: '10px 0 10px' }}>
          Speeches that already survived a century
        </h1>
        <p className="pb-soft" style={{ maxInlineSize: '56ch', lineHeight: 1.7 }}>
          The library can grow by itself. These are public-domain speeches fetched live from
          Wikisource in your browser — every one kept with its licence and a link back to the
          original page. Add one to your shelf and it becomes part of your library, ready to read and
          rehearse offline.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search(query);
          }}
          style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}
        >
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-ink-muted)' }} />
            <input
              className="pb-input"
              style={{ paddingLeft: 36 }}
              placeholder="Search Wikisource — try “freedom”, “suffrage”, “farewell”…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search public-domain speeches"
            />
          </div>
          <button type="submit" className="pb-btn pb-btn-primary" disabled={loading}>
            {loading ? <span className="pb-spinner" /> : <Globe size={16} />} Search the web
          </button>
        </form>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {SUGGESTIONS.map((term) => (
            <button
              key={term}
              type="button"
              className="pb-chip"
              onClick={() => {
                setQuery(term);
                void search(term);
              }}
            >
              {term}
            </button>
          ))}
          <button
            type="button"
            className="pb-chip pb-chip-accent"
            onClick={() => {
              setLoading(true);
              fetchCuratedWebSpeeches()
                .then((found) => {
                  setCurated(found);
                  setResults([]);
                  setNotice(found.length ? null : 'Wikisource did not answer. Try again shortly.');
                })
                .finally(() => setLoading(false));
            }}
          >
            <RefreshCw size={11} /> Refresh the new arrivals
          </button>
        </div>

        {notice && (
          <p className="pb-muted" style={{ fontSize: '0.84rem', marginTop: 14, lineHeight: 1.65 }}>
            {notice}
          </p>
        )}
      </section>

      {results.length > 0 && renderList(results, `Results for “${query}”`)}

      {renderList(curated, 'New arrivals')}

      {renderList(shelf, `On your shelf (${shelf.length})`)}

      {!curated.length && !results.length && !shelf.length && !loading && (
        <div className="pb-panel" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <Sparkles size={26} style={{ color: 'var(--c-accent)', margin: '0 auto 12px' }} />
          <h3 style={{ marginBottom: 8 }}>The web library is quiet</h3>
          <p className="pb-muted" style={{ maxWidth: 420, margin: '0 auto', lineHeight: 1.7 }}>
            Search above, or come back when you have a connection. Your shelf — and everything you
            have written — stays available offline either way.
          </p>
        </div>
      )}
    </div>
  );
}
