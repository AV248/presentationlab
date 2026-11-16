import type { TaxonomyEntry, TaxonomyKind } from '@/lib/taxonomy';
import { taxonomyPath } from '@/server/taxonomyPages';

export function TaxonomyDirectory({ kind, entries }: { kind: TaxonomyKind; entries: TaxonomyEntry[] }) {
  const isCategory = kind === 'category';
  return (
    <div className="pb-page">
      <header className="pb-panel" style={{ padding: 'clamp(22px, 4vw, 38px)' }}>
        <span className="pb-eyebrow">Public library · {entries.length} {isCategory ? 'categories' : 'tags'}</span>
        <h1 className="pb-page-title" style={{ marginTop: 8 }}>{isCategory ? 'Speech Categories' : 'Speech Tags'}</h1>
        <p className="pb-page-sub" style={{ maxWidth: '68ch' }}>
          {isCategory
            ? 'Browse public presentations by their subject and occasion. Every title opens at its own page.'
            : 'Follow a topic through public presentations. Tags are links into the reading library, not labels trapped on a card.'}
        </p>
      </header>
      <section aria-label={isCategory ? 'Speech categories' : 'Speech tags'} className="pb-panel" style={{ padding: '18px 20px' }}>
        {entries.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 8 }}>
            {entries.map((entry) => (
              <a key={entry.slug} className="pb-panel-flat" href={taxonomyPath(kind, entry.slug)} style={{ padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'center', textDecoration: 'none' }}>
                <span style={{ flex: 1 }}>{isCategory ? entry.label : `#${entry.label}`}</span>
                <span className="pb-muted" style={{ fontSize: '0.76rem' }}>{entry.count}</span>
              </a>
            ))}
          </div>
        ) : <p className="pb-muted">No public topics have been published yet.</p>}
      </section>
      <nav className="pb-public-index-footer" aria-label="Related sections">
        <a className="pb-btn pb-btn-ghost" href="/topics">Speaking guides</a>
        <a className="pb-btn pb-btn-ghost" href="/community">Community</a>
        <a className="pb-btn pb-btn-ghost" href={isCategory ? '/tag' : '/category'}>Browse {isCategory ? 'tags' : 'categories'}</a>
      </nav>
    </div>
  );
}
