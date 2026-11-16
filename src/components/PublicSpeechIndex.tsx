import { presentationPath } from '@/lib/paths';
import { taxonomyPath } from '@/server/taxonomyPages';
import type { PublicIndexSpeech, TaxonomyPageData } from '@/server/taxonomyPages';

export function PublicSpeechIndex({ data }: { data: TaxonomyPageData }) {
  const currentPath = `/${data.kind}/${data.slug}`;
  const related = data.kind === 'category' ? data.relatedTags : data.relatedCategories;
  const relatedKind = data.kind === 'category' ? 'tag' : 'category';

  return (
    <div className="pb-page pb-public-index">
      <nav aria-label="Breadcrumb" className="pb-muted" style={{ fontSize: '0.82rem', marginBottom: 8 }}>
        <a href="/">Home</a> <span aria-hidden="true"> / </span>
        <a href={data.kind === 'category' ? '/category' : '/tag'}>{data.kind === 'category' ? 'Categories' : 'Tags'}</a>
        <span aria-hidden="true"> / </span><span aria-current="page">{data.label}</span>
      </nav>
      <header className="pb-panel" style={{ padding: 'clamp(22px, 4vw, 38px)' }}>
        <span className="pb-eyebrow">{data.kind === 'category' ? 'Category' : 'Tag'} · {data.items.length} public {data.items.length === 1 ? 'speech' : 'speeches'}</span>
        <h1 className="pb-page-title" style={{ marginTop: 8 }}>{data.label}{data.kind === 'tag' ? ' speeches' : ''}</h1>
        <p className="pb-page-sub" style={{ maxWidth: '68ch' }}>{data.description}</p>
      </header>

      <section aria-labelledby="public-index-list-title">
        <h2 id="public-index-list-title" className="pb-eyebrow" style={{ margin: '14px 0 10px' }}>
          {data.items.length ? 'Public presentations' : 'No published presentations yet'}
        </h2>
        {data.items.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {data.items.map((speech) => <SpeechIndexRow key={speech.id} speech={speech} />)}
          </div>
        ) : (
          <div className="pb-panel" style={{ padding: 22 }}>
            <p className="pb-muted">This shelf is ready for its first public presentation.</p>
          </div>
        )}
      </section>

      {related.length > 0 && (
        <nav className="pb-panel" aria-label={`Related ${relatedKind}s`} style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>Related {relatedKind}s</h2>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {related.map((entry) => (
              <a key={entry.slug} className="pb-chip" href={taxonomyPath(relatedKind, entry.slug)}>
                {relatedKind === 'tag' ? `#${entry.label}` : entry.label} <span className="pb-muted">({entry.count})</span>
              </a>
            ))}
          </div>
        </nav>
      )}

      <nav aria-label="More public sections" className="pb-public-index-footer">
        <a className="pb-btn pb-btn-ghost" href="/topics">Speaking guides</a>
        <a className="pb-btn pb-btn-ghost" href="/community">Community</a>
        <a className="pb-btn pb-btn-ghost" href={currentPath}>Back to {data.label}</a>
      </nav>
    </div>
  );
}

function SpeechIndexRow({ speech }: { speech: PublicIndexSpeech }) {
  const path = presentationPath(speech);
  return (
    <article className="pb-panel pb-public-index-row" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 300px' }}>
          <h3 style={{ fontSize: '1.08rem', margin: 0 }}><a href={path}>{speech.title}</a></h3>
          <p className="pb-muted" style={{ fontSize: '0.8rem', margin: '5px 0 0' }}>
            {speech.username ? <><a href={`/${encodeURIComponent(speech.username)}`}>@{speech.username}</a> · </> : null}{speech.author}
          </p>
        </div>
        <a className="pb-btn pb-btn-sm" href={path}>Read</a>
      </div>
      {speech.preview && <p className="pb-soft" style={{ lineHeight: 1.65, margin: '10px 0 0' }}>{speech.preview}</p>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {speech.category && <a className="pb-chip" href={taxonomyPath('category', speech.category)}>{speech.category}</a>}
        {speech.tags.slice(0, 8).map((tag) => <a className="pb-chip" key={tag} href={taxonomyPath('tag', tag)}>#{tag}</a>)}
      </div>
    </article>
  );
}
