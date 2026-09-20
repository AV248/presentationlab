import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, ListChecks } from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { TOPICS, speechesForTopic, topicBySlug } from '../data/topics';
import { pageMetaFor } from '../data/routes';
import { SITE_URL, usePageMeta } from '../lib/seo';
import { readingMinutes } from '../lib/text';

/**
 * One topic hub: an original guide, a working checklist, and the library
 * speeches that put the advice into practice. Prerendered at build time.
 */
export function TopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const topic = topicBySlug(slug);

  const meta = pageMetaFor(`/topics/${topic?.slug ?? ''}`);
  usePageMeta(topic ? topic.title : 'Guide not found', {
    description: meta?.description ?? 'Guides and example speeches for every speaking occasion.',
    image: meta?.card ? `${SITE_URL}/cards/${meta.card}.png` : undefined,
    jsonLd: meta?.jsonLd,
    robots: topic ? undefined : 'noindex, follow',
  });

  if (!topic) {
    return (
      <div className="pb-page pb-narrow">
        <h1 className="pb-page-title">That guide does not exist</h1>
        <p className="pb-page-sub">The guides that do exist are one step back.</p>
        <Link to="/topics" className="pb-btn" style={{ marginTop: 12, width: 'fit-content' }}>
          <ArrowLeft size={14} /> All speaking guides
        </Link>
      </div>
    );
  }

  const speeches = speechesForTopic(topic);
  const related = TOPICS.filter((candidate) => candidate.slug !== topic.slug).slice(0, 3);

  return (
    <div className="pb-page pb-narrow">
      <nav style={{ marginBottom: 14 }}>
        <Link to="/topics" className="pb-link-quiet" style={{ fontSize: '0.85rem' }}>
          <ArrowLeft size={13} style={{ verticalAlign: '-2px' }} /> Speaking Guides
        </Link>
      </nav>

      <header className="pb-page-head">
        <span className="pb-eyebrow">Guide · {readingMinutes(topic.guide)} min read</span>
        <h1 className="pb-page-title">{topic.title}</h1>
        <p className="pb-page-sub">{topic.tagline}</p>
      </header>

      <article className="pb-panel pb-topic-guide" style={{ padding: '22px 24px' }}>
        <Markdown text={topic.guide} />
      </article>

      <section className="pb-well" style={{ marginTop: 18, padding: '16px 18px' }}>
        <h2 style={{ fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <ListChecks size={16} style={{ color: 'var(--c-accent)' }} /> The working checklist
        </h2>
        <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {topic.tips.map((tip) => (
            <li key={tip} style={{ fontSize: '0.9rem', lineHeight: 1.55 }}>
              {tip}
            </li>
          ))}
        </ol>
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <BookOpenText size={17} style={{ color: 'var(--c-accent)' }} />
          Read it in practice
        </h2>
        <p className="pb-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
          {speeches.length} full {speeches.length === 1 ? 'example' : 'examples'} from the library — free to read, save and adapt.
        </p>
        <div className="pb-grid" style={{ gap: 'var(--l-gap, 14px)' }}>
          {speeches.map((speech) => (
            <Link key={speech.id} to={`/read/${speech.id}`} className="pb-card pb-topic-speech">
              <span className="pb-card-kicker">
                {speech.category} · {speech.occasion}
              </span>
              <span className="pb-card-title">{speech.title}</span>
              <span className="pb-card-preview">{speech.preview}</span>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Keep reading</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {related.map((candidate) => (
            <Link key={candidate.slug} to={`/topics/${candidate.slug}`} className="pb-chip" style={{ textDecoration: 'none' }}>
              <CheckCircle2 size={13} style={{ marginRight: 6, color: 'var(--c-accent)' }} />
              {candidate.title}
            </Link>
          ))}
        </div>
      </section>

      <section className="pb-panel" style={{ marginTop: 26, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}>
          <h2 style={{ fontSize: '1rem' }}>Put it to work</h2>
          <p className="pb-muted" style={{ fontSize: '0.86rem', marginTop: 4, lineHeight: 1.6 }}>
            Take one of these into the rehearsal room — teleprompter, pacing timer and breathing
            cues are built in, free.
          </p>
        </div>
        <Link to="/practice" className="pb-btn pb-btn-primary">
          Rehearse a talk <ArrowRight size={14} />
        </Link>
      </section>
    </div>
  );
}
