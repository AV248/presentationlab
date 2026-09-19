import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Dices,
  Filter,
  Globe,
  LayoutGrid,
  Library as LibraryIcon,
  Mic2,
  PenLine,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { SpeechCard } from '../components/SpeechCard';
import { FirstRun } from '../components/Overlays';
import { useSpeeches, type CollectionItem } from '../hooks/useCollection';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useCloud } from '../store/cloud';
import { AXIS_DEFAULTS, layoutById } from '../design/compile';
import { readingMinutes, wordCount } from '../lib/text';
import { fetchCuratedWebSpeeches } from '../services/webSources';
import { greetingFor } from '../lib/heart';

type SortKey = 'newest' | 'viewed' | 'liked' | 'shortest' | 'longest' | 'az' | 'random';
type Shelf = 'latest' | 'viewed';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'viewed', label: 'Most viewed' },
  { id: 'liked', label: 'Most liked' },
  { id: 'shortest', label: 'Shortest' },
  { id: 'longest', label: 'Longest' },
  { id: 'az', label: 'A → Z' },
  { id: 'random', label: 'Shuffle' },
];

export function LibraryPage() {
  const navigate = useNavigate();
  const items = useSpeeches();
  const bookmarks = useLibrary((s) => s.bookmarks);
  const history = useLibrary((s) => s.history);
  const progress = useLibrary((s) => s.progress);
  const shelf = useLibrary((s) => s.shelf);
  const addToShelf = useLibrary((s) => s.addToShelf);
  const layoutId = useSettings((s) => s.theme.layout);
  const onboarded = useSettings((s) => s.onboarded);
  const setAxis = useSettings((s) => s.setAxis);
  const setThemePanel = useUi((s) => s.setThemePanel);
  const toast = useUi((s) => s.toast);
  const cloud = useCloud();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [kind, setKind] = useState<'all' | 'speech' | 'template'>('all');
  const [source, setSource] = useState<'all' | 'user' | 'cloud' | 'library' | 'web'>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [shelfMode, setShelfMode] = useState<Shelf>('latest');
  const [showFilters, setShowFilters] = useState(false);
  const [seed, setSeed] = useState(0);
  const [webLoading, setWebLoading] = useState(false);

  const layout = layoutById(layoutId);

  /* Bring in new public-domain speeches from the web, quietly, on first load. */
  useEffect(() => {
    if (shelf.length > 0) return;
    let alive = true;
    setWebLoading(true);
    fetchCuratedWebSpeeches()
      .then((found) => {
        if (!alive) return;
        found.slice(0, 5).forEach((speech) => addToShelf(speech));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setWebLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const continueReading = useMemo(
    () =>
      history
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is CollectionItem => Boolean(item))
        .filter((item) => (progress[item.id] ?? 0) < 0.98)
        .slice(0, 6),
    [history, items, progress],
  );

  const bookmarked = useMemo(
    () =>
      bookmarks
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is CollectionItem => Boolean(item)),
    [bookmarks, items],
  );

  /** The two shelves the very first version of this site shipped with. */
  const withCounters = useMemo(() => items.filter((item) => item.views !== null), [items]);

  const ordered = useMemo(() => {
    if (shelfMode === 'viewed') {
      return [...withCounters].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    }
    return items;
  }, [items, shelfMode, withCounters]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = ordered.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false;
      if (source !== 'all' && item.source !== source) return false;
      if (category !== 'All' && item.category !== category) return false;
      if (!needle) return true;
      return (
        item.title.toLowerCase().includes(needle) ||
        item.author.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle) ||
        item.occasion.toLowerCase().includes(needle) ||
        item.preview.toLowerCase().includes(needle) ||
        item.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
        item.content.toLowerCase().includes(needle)
      );
    });

    const sorted = [...result];
    switch (sort) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'viewed':
        sorted.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
        break;
      case 'liked':
        sorted.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
        break;
      case 'shortest':
        sorted.sort((a, b) => a.words - b.words);
        break;
      case 'longest':
        sorted.sort((a, b) => b.words - a.words);
        break;
      case 'az':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'random':
        sorted.sort(() => Math.random() - 0.5);
        break;
    }
    if (shelfMode === 'latest') {
      // People's own work always floats to the top of the Latest shelf.
      sorted.sort((a, b) => a.rank - b.rank || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [ordered, query, kind, source, category, sort, seed, shelfMode]);

  const totalMinutes = useMemo(
    () => items.reduce((sum, item) => sum + readingMinutes(item.content), 0),
    [items],
  );
  const totalWords = useMemo(() => items.reduce((sum, item) => sum + wordCount(item.content), 0), [items]);
  const webCount = items.filter((item) => item.source === 'web').length;
  const yours = items.filter((item) => item.source === 'user').length;
  const shared = items.filter((item) => item.source === 'cloud').length;

  const [focusIndex, setFocusIndex] = useState(0);
  const [splitSelection, setSplitSelection] = useState<CollectionItem | null>(null);

  useEffect(() => {
    setFocusIndex(0);
  }, [filtered.length, category, kind, source, sort, query, shelfMode]);

  useEffect(() => {
    if (layout.mode === 'split') setSplitSelection((current) => current ?? filtered[0] ?? null);
  }, [layout.mode, filtered]);

  const openRandom = () => {
    if (!items.length) return;
    const pick = items[Math.floor(Math.random() * items.length)];
    navigate(`/read/${encodeURIComponent(pick.id)}`);
  };

  const renderCollection = () => {
    if (!filtered.length) {
      return (
        <div className="pb-panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: 10 }} aria-hidden="true">
            ❧
          </div>
          <h3 style={{ marginBottom: 8 }}>Nothing on this shelf yet</h3>
          <p className="pb-muted" style={{ maxWidth: 420, margin: '0 auto 18px', lineHeight: 1.65 }}>
            {source === 'user'
              ? 'You have not written anything yet. The studio has a template waiting.'
              : cloud.status === 'error'
                ? 'The shared library could not be reached. The starter library is still here.'
                : 'Try another filter — or write the speech you were looking for.'}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pb-btn"
              onClick={() => {
                setQuery('');
                setCategory('All');
                setKind('all');
                setSource('all');
              }}
            >
              Clear filters
            </button>
            <button type="button" className="pb-btn pb-btn-primary" onClick={() => navigate('/studio')}>
              <PenLine size={16} /> Write one
            </button>
          </div>
        </div>
      );
    }

    if (layout.mode === 'focus') {
      const item = filtered[Math.min(focusIndex, filtered.length - 1)];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SpeechCard item={item} index={0} featured />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
            <button
              type="button"
              className="pb-btn pb-btn-sm"
              onClick={() => setFocusIndex((i) => Math.max(0, i - 1))}
              disabled={focusIndex === 0}
            >
              ← Previous
            </button>
            <span className="pb-muted" style={{ fontSize: '0.8rem' }}>
              {focusIndex + 1} of {filtered.length}
            </span>
            <button
              type="button"
              className="pb-btn pb-btn-sm"
              onClick={() => setFocusIndex((i) => Math.min(filtered.length - 1, i + 1))}
              disabled={focusIndex >= filtered.length - 1}
            >
              Next →
            </button>
          </div>
        </div>
      );
    }

    if (layout.mode === 'split') {
      const selected = splitSelection ?? filtered[0];
      return (
        <div
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}
          data-split-grid
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="pb-panel"
                onClick={() => setSplitSelection(item)}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  borderColor: selected?.id === item.id ? 'var(--c-accent)' : 'var(--c-line)',
                  background: selected?.id === item.id ? 'var(--c-accent-soft)' : 'var(--c-surface)',
                  animationDelay: `calc(var(--m-stagger) * ${index})`,
                }}
              >
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>{item.title}</span>
                <span className="pb-muted" style={{ fontSize: '0.74rem' }}>
                  {item.author} · {item.minutes} min
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="pb-panel" style={{ padding: 24, position: 'sticky', top: 84 }}>
              <span className="pb-eyebrow">{selected.category}</span>
              <h2 style={{ fontSize: '1.5rem', margin: '8px 0 6px' }}>{selected.title}</h2>
              <p className="pb-muted" style={{ fontSize: '0.82rem', marginBottom: 14 }}>
                {selected.author} · {selected.occasion} · {selected.minutes} min
              </p>
              <p className="pb-prose" style={{ fontSize: '0.95rem', maxHeight: '46vh', overflow: 'auto' }}>
                {selected.preview || selected.content.slice(0, 420)}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="pb-btn pb-btn-primary"
                  onClick={() => navigate(`/read/${encodeURIComponent(selected.id)}`)}
                >
                  Read fully
                </button>
                <button
                  type="button"
                  className="pb-btn"
                  onClick={() => navigate(`/practice/${encodeURIComponent(selected.id)}`)}
                >
                  <Mic2 size={16} /> Rehearse
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="pb-grid">
        {filtered.map((item, index) => (
          <SpeechCard
            key={item.id}
            item={item}
            index={index}
            featured={index === 0 && layout.mode === 'spotlight'}
          />
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      {!onboarded && <FirstRun />}

      {/* Hero */}
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 34px)' }}>
        <span className="pb-eyebrow">{greetingFor(new Date())}</span>
        <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', margin: '10px 0 12px' }}>
          A room full of people is waiting to hear{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--c-accent)' }}>one true thing</em>.
        </h1>
        <p className="pb-soft" style={{ fontSize: '1rem', maxInlineSize: '54ch', lineHeight: 1.7 }}>
          Read speeches that have already been stood up and said out loud. Steal the structure,
          keep your own voice, then rehearse until the words belong to you.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" className="pb-btn pb-btn-primary pb-btn-lg" onClick={() => navigate('/studio')}>
            <PenLine size={18} /> Start writing
          </button>
          <button type="button" className="pb-btn pb-btn-lg" onClick={openRandom}>
            <Dices size={18} /> Open at random
          </button>
          <button type="button" className="pb-btn pb-btn-lg pb-btn-ghost" onClick={() => setThemePanel(true)}>
            <Sparkles size={18} /> Make it yours
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
            marginTop: 24,
          }}
        >
          <Stat label="Speeches" value={String(items.length)} icon={LibraryIcon} />
          <Stat label="Yours" value={String(yours)} icon={PenLine} />
          <Stat label="Shared by people" value={String(shared)} icon={Mic2} />
          <Stat label="From the web" value={String(webCount)} icon={Globe} />
          <Stat label="Minutes to read" value={String(totalMinutes)} icon={Clock} />
        </div>
        <p className="pb-muted" style={{ fontSize: '0.76rem', marginTop: 12 }}>
          {totalWords.toLocaleString()} words in total. Counts come from real documents — nothing here
          is padded to look busier than it is.
        </p>
      </section>

      {/* Continue */}
      {continueReading.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Where you left off</h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {continueReading.map((item) => (
              <button
                key={item.id}
                type="button"
                className="pb-panel"
                onClick={() => navigate(`/read/${encodeURIComponent(item.id)}`)}
                style={{ flex: '0 0 clamp(220px, 30vw, 280px)', padding: '12px 14px', textAlign: 'left' }}
              >
                <span className="pb-muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {item.category}
                </span>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', margin: '4px 0 6px' }}>
                  {item.title}
                </span>
                <span style={{ display: 'block', height: 3, borderRadius: 999, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      width: `${Math.round((progress[item.id] ?? 0) * 100)}%`,
                      background: 'var(--c-accent)',
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {bookmarked.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: '1.05rem' }}>On your desk</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {bookmarked.slice(0, 12).map((item) => (
              <button
                key={item.id}
                type="button"
                className="pb-chip"
                onClick={() => navigate(`/read/${encodeURIComponent(item.id)}`)}
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              >
                {item.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Controls */}
      <section className="pb-panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* The two shelves from the original Presentation Lab. */}
          <div className="pb-well" style={{ display: 'flex', padding: 3, gap: 2 }}>
            {(['latest', 'viewed'] as Shelf[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setShelfMode(mode)}
                className={`pb-btn pb-btn-sm ${shelfMode === mode ? '' : 'pb-btn-ghost'}`}
                style={{ background: shelfMode === mode ? 'var(--c-accent-soft)' : undefined }}
                aria-pressed={shelfMode === mode}
              >
                {mode === 'latest' ? 'Latest' : 'Most viewed'}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-ink-muted)' }}
            />
            <input
              className="pb-input"
              placeholder="Search titles, authors, tags, or the full text…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ paddingLeft: 36 }}
              aria-label="Search the library"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-ink-muted)' }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <select
            className="pb-select"
            style={{ width: 'auto', minWidth: 150 }}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortKey);
              if (event.target.value === 'random') setSeed((s) => s + 1);
            }}
            aria-label="Sort speeches"
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <button type="button" className="pb-btn pb-btn-outline" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <Filter size={15} /> Filters
          </button>

          <button
            type="button"
            className="pb-btn pb-btn-ghost"
            onClick={() => setThemePanel(true)}
            title={`Arrangement: ${layout.name} — click to change`}
          >
            <LayoutGrid size={15} /> {layout.name}
          </button>
        </div>

        {showFilters && (
          <div className="anim-enter" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            <div>
              <span className="pb-label">Category</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['All', ...categories.map(([name]) => name)].map((name) => {
                  const count = name === 'All' ? items.length : (categories.find(([c]) => c === name)?.[1] ?? 0);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`pb-chip ${category === name ? 'pb-chip-accent' : ''}`}
                      onClick={() => setCategory(name)}
                    >
                      {name} <span style={{ opacity: 0.6 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <span className="pb-label">Type</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['all', 'speech', 'template'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`pb-chip ${kind === value ? 'pb-chip-accent' : ''}`}
                      onClick={() => setKind(value)}
                    >
                      {value === 'all' ? 'Everything' : value === 'speech' ? 'Speeches' : 'Templates'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="pb-label">Where it came from</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(
                    [
                      ['all', 'All'],
                      ['user', 'Yours'],
                      ['cloud', 'Shared'],
                      ['library', 'Starter'],
                      ['web', 'Web'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`pb-chip ${source === value ? 'pb-chip-accent' : ''}`}
                      onClick={() => setSource(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  className="pb-btn pb-btn-sm pb-btn-ghost"
                  onClick={() => {
                    setQuery('');
                    setCategory('All');
                    setKind('all');
                    setSource('all');
                    setSort('newest');
                    setShelfMode('latest');
                    setAxis('layout', AXIS_DEFAULTS.layout);
                    toast('Filters cleared', 'success');
                  }}
                >
                  Reset all
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="pb-rule">
          <span>
            {shelfMode === 'viewed' ? 'Most viewed' : category === 'All' ? 'The collection' : category} ·{' '}
            {filtered.length} {filtered.length === 1 ? 'speech' : 'speeches'}
            {shelfMode === 'latest' && ' · new work by people first'}
            {webLoading && ' · fetching from the web…'}
          </span>
        </div>
        {shelfMode === 'viewed' && withCounters.length === 0 && (
          <p className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.7 }}>
            No reads have been counted yet. Views are recorded on published speeches in the shared
            library — so this shelf fills up as people actually read.
          </p>
        )}
        {renderCollection()}
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) {
  return (
    <div className="pb-well" style={{ padding: '12px 14px' }}>
      <Icon size={15} style={{ color: 'var(--c-accent)', marginBottom: 5 }} />
      <div style={{ fontFamily: 'var(--x-font-display)', fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>
        {value}
      </div>
      <div className="pb-muted" style={{ fontSize: '0.72rem' }}>
        {label}
      </div>
    </div>
  );
}
