import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownWideNarrow,
  Dices,
  Filter,
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
import { AXIS_DEFAULTS, layoutById } from '../design/compile';
import { readingMinutes, wordCount } from '../lib/text';

type SortKey = 'newest' | 'liked' | 'viewed' | 'shortest' | 'longest' | 'az' | 'random';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'liked', label: 'Most liked' },
  { id: 'viewed', label: 'Most viewed' },
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
  const layoutId = useSettings((s) => s.theme.layout);
  const onboarded = useSettings((s) => s.onboarded);
  const setAxis = useSettings((s) => s.setAxis);
  const setThemePanel = useUi((s) => s.setThemePanel);
  const toast = useUi((s) => s.toast);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [kind, setKind] = useState<'all' | 'speech' | 'template'>('all');
  const [source, setSource] = useState<'all' | 'library' | 'user' | 'cloud'>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [seed, setSeed] = useState(0);

  const layout = layoutById(layoutId);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const continueReading = useMemo(() => {
    return history
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is CollectionItem => Boolean(item))
      .filter((item) => (progress[item.id] ?? 0) < 0.98)
      .slice(0, 6);
  }, [history, items, progress]);

  const bookmarked = useMemo(
    () => bookmarks.map((id) => items.find((item) => item.id === id)).filter((i): i is CollectionItem => Boolean(i)),
    [bookmarks, items],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = items.filter((item) => {
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
      case 'liked':
        sorted.sort((a, b) => b.likes - a.likes);
        break;
      case 'viewed':
        sorted.sort((a, b) => b.views - a.views);
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
        sorted.sort(() => (seed > -1 ? Math.random() - 0.5 : 0));
        break;
    }
    return sorted;
  }, [items, query, kind, source, category, sort, seed]);

  const totalMinutes = useMemo(
    () => items.reduce((sum, item) => sum + readingMinutes(item.content), 0),
    [items],
  );
  const totalWords = useMemo(() => items.reduce((sum, item) => sum + wordCount(item.content), 0), [items]);
  const authors = useMemo(() => new Set(items.map((i) => i.author)).size, [items]);

  const [focusIndex, setFocusIndex] = useState(0);
  const [splitSelection, setSplitSelection] = useState<CollectionItem | null>(null);

  useEffect(() => {
    setFocusIndex(0);
  }, [filtered.length, category, kind, source, sort, query]);

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
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🔍</div>
          <h3 style={{ marginBottom: 8 }}>Nothing here yet</h3>
          <p className="pb-muted" style={{ maxWidth: 420, margin: '0 auto 18px' }}>
            Try a different filter or search term — or write the speech you were looking for.
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
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}
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
                  background: selected?.id === item.id ? 'var(--c-accent-softer)' : 'var(--c-surface)',
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
          <SpeechCard key={item.id} item={item} index={index} featured={index === 0 && layout.mode === 'spotlight'} />
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      {!onboarded && <FirstRun />}

      {/* Hero */}
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 34px)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <span className="pb-eyebrow">Your companion for every talk</span>
            <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', margin: '10px 0 12px' }}>
              Write it. <span className="pb-gradient-text">Coach it.</span> Rehearse it. Deliver it.
            </h1>
            <p className="pb-soft" style={{ fontSize: '1rem', maxInlineSize: '54ch' }}>
              A library of {items.length} original speeches and templates, a writing studio that
              reads your draft back to you, and a teleprompter that keeps your pace honest.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button type="button" className="pb-btn pb-btn-primary pb-btn-lg" onClick={() => navigate('/studio')}>
                <PenLine size={18} /> Start writing
              </button>
              <button type="button" className="pb-btn pb-btn-lg" onClick={openRandom}>
                <Dices size={18} /> Random speech
              </button>
              <button type="button" className="pb-btn pb-btn-lg pb-btn-ghost" onClick={() => setThemePanel(true)}>
                <Sparkles size={18} /> Theme studio
              </button>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))',
              gap: 10,
              flex: '0 1 300px',
            }}
          >
            {[
              { label: 'Speeches', value: String(items.length), icon: LibraryIcon },
              { label: 'Authors', value: String(authors), icon: PenLine },
              { label: 'Minutes', value: String(totalMinutes), icon: Mic2 },
              { label: 'Words', value: `${Math.round(totalWords / 1000)}k`, icon: ArrowDownWideNarrow },
            ].map((stat) => (
              <div key={stat.label} className="pb-well" style={{ padding: '14px 16px' }}>
                <stat.icon size={16} style={{ color: 'var(--c-accent)', marginBottom: 6 }} />
                <div
                  style={{
                    fontFamily: 'var(--x-font-display)',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </div>
                <div className="pb-muted" style={{ fontSize: '0.74rem' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Continue reading */}
      {continueReading.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Continue where you left off</h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {continueReading.map((item) => (
              <button
                key={item.id}
                type="button"
                className="pb-panel"
                onClick={() => navigate(`/read/${encodeURIComponent(item.id)}`)}
                style={{
                  flex: '0 0 clamp(220px, 30vw, 280px)',
                  padding: '12px 14px',
                  textAlign: 'left',
                }}
              >
                <span className="pb-muted" style={{ fontSize: '0.7rem' }}>
                  {item.category}
                </span>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', margin: '4px 0 6px' }}>
                  {item.title}
                </span>
                <span
                  style={{
                    display: 'block',
                    height: 4,
                    borderRadius: 999,
                    background: 'var(--c-surface-3)',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      width: `${Math.round((progress[item.id] ?? 0) * 100)}%`,
                      background: 'var(--grad-brand)',
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
          <h2 style={{ fontSize: '1.05rem' }}>Bookmarked</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {bookmarked.slice(0, 10).map((item) => (
              <button
                key={item.id}
                type="button"
                className="pb-chip"
                onClick={() => navigate(`/read/${encodeURIComponent(item.id)}`)}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
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

          <button
            type="button"
            className="pb-btn pb-btn-outline"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <Filter size={15} /> Filters
          </button>

          <button
            type="button"
            className="pb-btn pb-btn-ghost"
            onClick={() => setThemePanel(true)}
            title={`Layout: ${layout.name} — click to change`}
          >
            <LayoutGrid size={15} /> {layout.name}
          </button>
        </div>

        {showFilters && (
          <div
            className="anim-enter"
            style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}
          >
            <div>
              <span className="pb-label">Category</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['All', ...categories.map(([name]) => name)].map((name) => {
                  const count = name === 'All' ? items.length : categories.find(([c]) => c === name)?.[1] ?? 0;
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
                <span className="pb-label">Source</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['all', 'library', 'user', 'cloud'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`pb-chip ${source === value ? 'pb-chip-accent' : ''}`}
                      onClick={() => setSource(value)}
                    >
                      {value === 'all' ? 'All' : value === 'library' ? 'Library' : value === 'user' ? 'Mine' : 'Cloud'}
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ fontSize: '1.05rem' }}>
            {category === 'All' ? 'The collection' : category}
          </h2>
          <span className="pb-muted" style={{ fontSize: '0.8rem' }}>
            {filtered.length} {filtered.length === 1 ? 'speech' : 'speeches'}
            {layout.mode === 'focus' && ' · one at a time'}
          </span>
        </div>
        {renderCollection()}
      </section>
    </div>
  );
}
