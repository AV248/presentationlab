import { JsonLd } from '@/components/JsonLd';
import { routeMetadata } from '@/lib/routeMeta';
import { LIBRARY } from '@/data/speeches';
import { presentationPath } from '@/lib/paths';
import { absoluteUrl } from '@/lib/seo';
import { slugifySegment } from '@/lib/paths';

export const metadata = routeMetadata('/templates');

export default function Page() {
  const templates = LIBRARY.filter((speech) => speech.kind === 'template');
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Speech Templates & Frameworks',
    description: 'Practical speech skeletons for talks, toasts, pitches and difficult conversations.',
    url: absoluteUrl('/templates'),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: templates.length,
      itemListElement: templates.map((speech, index) => ({
        '@type': 'ListItem', position: index + 1, name: speech.title,
        url: absoluteUrl(presentationPath(speech)),
      })),
    },
  }];
  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="pb-page">
        <header className="pb-panel" style={{ padding: 'clamp(22px, 4vw, 38px)' }}>
          <span className="pb-eyebrow">Writing desk · frameworks</span>
          <h1 className="pb-page-title" style={{ marginTop: 8 }}>Speech templates that leave room for you</h1>
          <p className="pb-page-sub" style={{ maxWidth: '68ch' }}>
            Use a structure as scaffolding, not a script. Each template is a public page with its own address; keep the rhythm and replace every borrowed sentence with your own.
          </p>
        </header>
        <section aria-label="Speech templates" style={{ display: 'grid', gap: 10 }}>
          {templates.map((template) => (
            <article key={template.id} className="pb-panel" style={{ padding: '18px 20px' }}>
              <span className="pb-eyebrow">{template.category} · Template</span>
              <h2 style={{ fontSize: '1.1rem', margin: '6px 0' }}><a href={presentationPath(template)}>{template.title}</a></h2>
              <p className="pb-soft" style={{ lineHeight: 1.65 }}>{template.preview}</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                <a className="pb-btn pb-btn-sm" href={presentationPath(template)}>Open template</a>
                <a className="pb-chip" href={`/category/${slugifySegment(template.category)}`}>{template.category}</a>
                {template.tags.slice(0, 5).map((tag) => <a key={tag} className="pb-chip" href={`/tag/${slugifySegment(tag)}`}>#{tag}</a>)}
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
