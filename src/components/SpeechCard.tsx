import { useNavigate } from 'react-router-dom';
import { Bookmark, Cloud, FileText, Mic2, PenLine, Globe, DraftingCompass } from 'lucide-react';
import type { CollectionItem } from '../hooks/useCollection';
import { useLibrary } from '../store/library';
import { formatCount } from '../lib/text';
import { ReactionBar } from './ReactionBar';

interface SpeechCardProps {
  item: CollectionItem;
  index?: number;
  featured?: boolean;
  onSelect?: (item: CollectionItem) => void;
  selected?: boolean;
}

export function SpeechCard({ item, index = 0, featured, onSelect, selected }: SpeechCardProps) {
  const navigate = useNavigate();
  const toggleBookmark = useLibrary((s) => s.toggleBookmark);

  const open = () => {
    if (onSelect) onSelect(item);
    else navigate(`/read/${encodeURIComponent(item.id)}`);
  };

  const initials = item.title
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <article
      className="pb-card anim-enter"
      style={{
        ['--i' as string]: index,
        cursor: 'pointer',
        borderColor: selected ? 'var(--c-accent)' : undefined,
      }}
      onClick={open}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          open();
        }}
        style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
        aria-label={`Open ${item.title}`}
      >
        <div className="pb-cover">{initials}</div>
        <div className="pb-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="pb-muted" style={{ fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {item.category}
              </span>
              <h3 className="pb-card-title" style={{ marginTop: 3 }}>{item.title}</h3>
              <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 3 }}>
                {item.author} · {item.occasion}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {item.source === 'user' && item.status === 'draft' && (
                <span className="pb-chip" style={{ borderColor: 'var(--c-warn)', color: 'var(--c-warn)' }}>
                  <DraftingCompass size={11} /> Draft
                </span>
              )}
              {item.source === 'web' && (
                <span className="pb-chip" title={item.licence}>
                  <Globe size={11} /> Web
                </span>
              )}
              {item.source === 'cloud' && (
                <span className="pb-chip" title="Published to the shared library">
                  <Cloud size={11} /> Shared
                </span>
              )}
              {item.kind === 'template' && <span className="pb-badge">Template</span>}
            </div>
          </div>

          {item.preview && (
            <p
              className="pb-soft pb-card-preview"
              style={{
                fontSize: featured ? '1rem' : '0.9rem',
                lineHeight: 1.62,
                display: '-webkit-box',
                WebkitLineClamp: featured ? 5 : 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.preview}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {item.tags.slice(0, featured ? 6 : 3).map((tag) => (
              <span key={tag} className="pb-chip" style={{ fontSize: '0.68rem' }}>
                {tag}
              </span>
            ))}
          </div>

          <div
            className="pb-muted"
            style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.74rem', flexWrap: 'wrap' }}
          >
            <span title="Estimated speaking time">
              <Mic2 size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> {item.minutes} min
            </span>
            <span title="Word count">
              <FileText size={12} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
              {formatCount(item.words)}
            </span>
            {item.views !== null && (
              <span title="Views">Read {formatCount(item.views)}×</span>
            )}
            {item.progress > 0.02 && item.progress < 0.98 && (
              <span style={{ color: 'var(--c-accent)' }}>{Math.round(item.progress * 100)}% read</span>
            )}
          </div>
        </div>
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 'auto',
          paddingTop: 6,
          borderTop: '1px solid var(--c-line-soft)',
          flexWrap: 'wrap',
        }}
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        <ReactionBar item={item} />
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="pb-icon-btn"
          onClick={() => toggleBookmark(item.id)}
          aria-pressed={item.bookmarked}
          title="Keep this on your desk"
        >
          <Bookmark size={15} fill={item.bookmarked ? 'var(--c-accent)' : 'none'} />
        </button>
        <button
          type="button"
          className="pb-btn pb-btn-sm"
          onClick={() => navigate(`/rehearse/${encodeURIComponent(item.id)}`)}
          title="Rehearse with the teleprompter"
        >
          <Mic2 size={14} /> Rehearse
        </button>
        <button
          type="button"
          className="pb-btn pb-btn-sm pb-btn-ghost"
          onClick={() => navigate(`/write/${encodeURIComponent(item.id)}`)}
          title="Copy into your drafts and make it yours"
        >
          <PenLine size={14} /> Remix
        </button>
      </div>
    </article>
  );
}
