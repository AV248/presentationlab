import { Link } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import { TOPICS, speechesForTopic } from '../data/topics';
import { pageMetaFor } from '../data/routes';
import { usePageMeta } from '../lib/seo';

/**
 * Speaking Guides — the editorial front door. Each hub pairs an original
 * guide with the matching speeches and templates from the library.
 */
export function TopicsPage() {
  const meta = pageMetaFor('/topics');
  usePageMeta('Speaking Guides — topics, occasions and frameworks', {
    description: meta?.description,
    image: meta?.card ? `https://presentationbuddy.aavrit.dedyn.io/cards/${meta.card}.png` : undefined,
    jsonLd: meta?.jsonLd,
  });

  return (
    <div className="pb-page">
      <header className="pb-page-head">
        <span className="pb-eyebrow">
          <Compass size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          Speaking Guides
        </span>
        <h1 className="pb-page-title">Every occasion has a way to say it well</h1>
        <p className="pb-page-sub">
          Original guides for the talks real people actually have to give — wedding toasts,
          investor pitches, first team meetings, eulogies, keynotes — each paired with full
          example speeches you can read, save and adapt for free.
        </p>
      </header>

      <div className="pb-grid pb-topics-grid">
        {TOPICS.map((topic, index) => (
          <Link
            key={topic.slug}
            to={`/topics/${topic.slug}`}
            className="pb-card pb-topic-card"
          >
            <span className="pb-card-kicker">
              {String(index + 1).padStart(2, '0')} · {speechesForTopic(topic).length}{' '}
              {speechesForTopic(topic).length === 1 ? 'speech' : 'speeches & templates'}
            </span>
            <span className="pb-card-title">{topic.title}</span>
            <span className="pb-card-preview">{topic.tagline}</span>
            <span className="pb-topic-more">
              Read the guide <ArrowRight size={13} style={{ verticalAlign: '-2px' }} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
