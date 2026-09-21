import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookmarkCheck,
  Check,
  ExternalLink,
  Globe,
  Mic2,
  RefreshCw,
  Search,
  Target,
} from 'lucide-react';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useArrivals } from '../store/arrivals';
import {
  ARRIVALS_GOAL,
  SOURCES,
  searchWebSpeeches,
  type SourceId,
  type WebSpeech,
} from '../services/webSources';
import { pageMetaFor } from '../data/routes';
import { SITE_URL, usePageMeta } from '../lib/seo';

/**
 * Arrivals.
 *
 * The library grows by itself. Every session has one goal: bring in five
 * new speeches from the open archives, each one carrying its source, its
 * licence and a link home. Nothing on this page was written by us.
 */
export function ArrivalsPage() {
  const meta = pageMetaFor('/arrivals');
  usePageMeta(meta?.title ?? 'Arrivals', {
    description: meta?.description,
    image: meta?.card ? `${SITE_URL}/cards/${meta.card}.png` : undefined,
    jsonLd: meta?.jsonLd,
  });

  const navigate = useNavigate();
  const shelf = useLibrary((s) => s.shelf);
  const addToShelf = useLibrary((s) => s.addToShelf);
  const removeFromShelf = useLibrary((s) => s.removeFromShelf);
  const toast = useUi((s) => s.toast);

  const arrived = useArrivals((s) => s.arrived);
  const theme = useArrivals((s) => s.theme);
  const answered = useArrivals((s) => s.answered);
  const unreachable = useArrivals((s) => s.unreachable);
  const status = useArrivals((s) => s.status);
  const lastError = useArrivals((s) => s.lastError);
  const gather = useArrivals((s) => s.gather);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WebSpeech[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The session goal runs itself the first time this page is opened.
  useEffect(() => {
    if (status === 'idle') void gather();
  }, [status, gather]);

  const onShelf = useMemo(() => new Set(shelf.map((item) => item.id)), [shelf]);
  const landed = Math.min(arrived.length, ARRIVALS_GOAL);
  const complete = arrived.length >= ARRIVALS_GOAL;

  const search = async (term: string) => {
    setSearching(true);
    setNotice(null);
    try {
      const found = await searchWebSpeeches(term, 12);
      setResults(found);
      if (!found.length) {
        setNotice(
          'Nothing came back from any archive. They may be unreachable from this network — try again shortly, or browse your shelf below.',
        );
      }
    } catch {
      setNotice('The archives could not be reached. Everything on your shelf still works offline.');
    } finally {
      setSearching(false);
    }
  };

  const toggle = (speech: WebSpeech) => {
    if (onShelf.has(speech.id)) {
      removeFromShelf(speech.id);
      toast('Removed from your shelf', 'success');
      return;
    }
    addToShelf(speech);
    toast('Saved to your shelf — it is now part of your library', 'success');
  };

  const renderCard = (speech: WebSpeech, index: number) => {
    const source = SOURCES[speech.sourceId] ?? SOURCES.wikisource;
    const saved = onShelf.has(speech.id);
    return (
      <article key={speech.id} className="pb-card pb-arrival anim-enter" style={{ ['--i' as string]: index }}>
        <div className="pb-arrival-source">
          <span className="pb-source-dot" data-source={speech.sourceId} aria-hidden="true" />
          <span className="pb-source-name">{source.name}</span>
          <span className="pb-source-licence">{speech.licence}</span>
        </div>

        <h3 className="pb-card-title">{speech.title}</h3>
        <p className="pb-arrival-author">{speech.author}</p>
        <p className="pb-arrival-preview">{speech.preview.slice(0, 220)}…</p>

        <div className="pb-arrival-actions">
          <button
            type="button"
            className={`pb-btn pb-btn-sm ${saved ? 'pb-btn-primary' : ''}`}
            onClick={() => toggle(speech)}
          >
            {saved ? <Check size={14} /> : <BookmarkCheck size={14} />}
            {saved ? 'On your shelf' : 'Add to shelf'}
          </button>
          <button
            type="button"
            className="pb-btn pb-btn-sm"
            onClick={() => {
              if (!saved) addToShelf(speech);
              navigate(`/read/${encodeURIComponent(speech.id)}`);
            }}
          >
            Read
          </button>
          <button
            type="button"
            className="pb-btn pb-btn-sm pb-btn-ghost"
            onClick={() => {
              if (!saved) addToShelf(speech);
              navigate(`/rehearse/${encodeURIComponent(speech.id)}`);
            }}
            title="Take it straight to the stage"
          >
            <Mic2 size={14} /> Rehearse
          </button>
          <a
            className="pb-btn pb-btn-sm pb-btn-ghost"
            href={speech.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            title={`Open the original at ${source.name}`}
          >
            Source <ExternalLink size={12} />
          </a>
        </div>
      </article>
    );
  };

  return (
    <div className="pb-page">
      {/* ---- the goal ---- */}
      <section className="pb-panel pb-arrivals-hero anim-enter">
        <div className="pb-arrivals-hero-text">
          <span className="pb-eyebrow">Arrivals</span>
          <h1 className="pb-page-title">Five new speeches, every session</h1>
          <p className="pb-page-sub">
            The library refuses to stand still. Each time you come back, Presentation Buddy goes out
            to the open archives and brings home five speeches you have not read — fetched live in
            your own browser, every one with its source and licence attached.
          </p>
        </div>

        <div className="pb-goal" role="group" aria-label={`Session goal: ${landed} of ${ARRIVALS_GOAL} arrived`}>
          <div className="pb-goal-head">
            <Target size={15} aria-hidden="true" />
            <span>Session goal</span>
            <strong className="pb-mono">
              {landed}/{ARRIVALS_GOAL}
            </strong>
          </div>
          <div className="pb-goal-pips">
            {Array.from({ length: ARRIVALS_GOAL }, (_, index) => (
              <span key={index} className="pb-goal-pip" data-filled={index < landed} />
            ))}
          </div>
          <p className="pb-goal-note">
            {status === 'loading'
              ? 'Reaching the archives…'
              : complete
                ? `Goal met${theme ? ` — gathered under “${theme}”` : ''}. Press below for five more.`
                : status === 'offline'
                  ? 'No archive answered. Your shelf still works offline.'
                  : `${ARRIVALS_GOAL - landed} to go.`}
          </p>
          <button
            type="button"
            className="pb-btn pb-btn-primary pb-btn-block"
            onClick={() => void gather()}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <span className="pb-spinner" aria-hidden="true" />
            ) : (
              <RefreshCw size={15} />
            )}
            {complete ? 'Bring five more' : 'Gather arrivals'}
          </button>
        </div>
      </section>

      {/* ---- where it comes from: sources, stated plainly ---- */}
      <section className="pb-sources" aria-label="Sources">
        {(Object.keys(SOURCES) as SourceId[]).map((id) => {
          const source = SOURCES[id];
          const state = answered.includes(id)
            ? 'answered'
            : unreachable.includes(id)
              ? 'unreachable'
              : 'idle';
          return (
            <a
              key={id}
              className="pb-source-card"
              href={source.home}
              target="_blank"
              rel="noreferrer noopener"
              data-state={state}
            >
              <span className="pb-source-head">
                <span className="pb-source-dot" data-source={id} aria-hidden="true" />
                <strong>{source.name}</strong>
                <span className="pb-source-state">
                  {state === 'answered' ? 'answered' : state === 'unreachable' ? 'no answer' : 'standing by'}
                </span>
              </span>
              <span className="pb-source-blurb">{source.blurb}</span>
              <span className="pb-source-licence">{source.licence}</span>
            </a>
          );
        })}
      </section>

      {lastError && (
        <p className="pb-notice" role="status">
          {lastError}
        </p>
      )}

      {/* ---- this session's arrivals ---- */}
      <section className="pb-section">
        <div className="pb-rule">
          <span>
            Arrived this session · {arrived.length}
            {theme ? ` · under “${theme}”` : ''}
          </span>
        </div>
        {arrived.length ? (
          <div className="pb-grid">{arrived.map(renderCard)}</div>
        ) : (
          <p className="pb-muted-note">
            {status === 'loading'
              ? 'Gathering five speeches from three archives…'
              : 'Nothing has landed yet. Press “Gather arrivals” above.'}
          </p>
        )}
      </section>

      {/* ---- search every archive ---- */}
      <section className="pb-panel pb-search-block">
        <h2 className="pb-block-title">Go looking yourself</h2>
        <p className="pb-block-sub">
          One search, three archives, interleaved so no single source dominates the page.
        </p>
        <form
          className="pb-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void search(query);
          }}
        >
          <div className="pb-field">
            <Search size={16} aria-hidden="true" />
            <input
              className="pb-input"
              placeholder="Try “suffrage”, “farewell”, “independence”…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search the open archives"
            />
          </div>
          <button type="submit" className="pb-btn pb-btn-primary" disabled={searching}>
            {searching ? <span className="pb-spinner" aria-hidden="true" /> : <Globe size={16} />}
            Search
          </button>
        </form>
        {notice && <p className="pb-notice">{notice}</p>}
      </section>

      {results.length > 0 && (
        <section className="pb-section">
          <div className="pb-rule">
            <span>Results for “{query}” · {results.length}</span>
          </div>
          <div className="pb-grid">{results.map(renderCard)}</div>
        </section>
      )}

      {/* ---- the shelf ---- */}
      <section className="pb-section">
        <div className="pb-rule">
          <span>On your shelf · {shelf.length}</span>
        </div>
        {shelf.length ? (
          <div className="pb-grid">{shelf.map(renderCard)}</div>
        ) : (
          <p className="pb-muted-note">
            Nothing saved yet. Anything you add to your shelf joins your library and stays readable
            offline. <Link to="/">Back to the library</Link>
          </p>
        )}
      </section>

      <p className="pb-attribution">
        Presentation Buddy does not host or claim any of this writing. Texts are fetched directly
        from {Object.values(SOURCES).map((source) => source.name).join(', ')} at the moment you ask
        for them, and each card links back to the page it came from. Licences are shown as the
        archives state them — check the original before republishing anything.
      </p>
    </div>
  );
}
