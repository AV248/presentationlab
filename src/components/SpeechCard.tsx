import { useNavigate } from 'react-router-dom';
import { Bookmark, Cloud, FileText, Heart, Mic2, PenLine } from 'lucide-react';
import type { CollectionItem } from '../hooks/useCollection';
import { useLibrary } from '../store/library';
import { formatCount } from '../lib/text';

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
  const toggleLike = useLibrary((s) => s.toggleLike);

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
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
      }}
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
        <div className="pb-cover">
          {initials}
        </div>
        <div className="pb-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 className="pb-card-title">{item.title}</h3>
              <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                {item.author} · {item.occasion}
              </p>
            </div>
            {item.kind === 'template' && <span className="pb-badge">Template</span>}
            {item.source === 'user' && item.status === 'draft' && (
              <span className="pb-chip" style={{ borderColor: 'var(--c-warn)', color: 'var(--c-warn)' }}>
                Draft
              </span>
            )}
            {item.source === 'cloud' && (
              <span className="pb-chip" title="Loaded from your cloud library">
                <Cloud size={11} /> Cloud
              </span>
            )}
          </div>

          {item.preview && (
            <p
              className="pb-soft"
              style={{
                fontSize: featured ? '1rem' : '0.88rem',
                lineHeight: 1.6,
                display: '-webkit-box',
                WebkitLineClamp: featured ? 4 : 3,
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
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: '0.74rem',
              flexWrap: 'wrap',
              marginTop: 2,
            }}
          >
            <span className="pb-chip">{item.category}</span>
            <span title="Estimated speaking time">
              <Mic2 size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> {item.minutes} min
            </span>
            <span title="Word count">
              <FileText size={12} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
              {formatCount(item.words)}
            </span>
            <span title="Views">
              <PenLine size={12} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
              {formatCount(item.views)}
            </span>
            {item.progress > 0.02 && item.progress < 0.98 && (
              <span style={{ color: 'var(--c-accent)' }}>{Math.round(item.progress * 100)}% read</span>
            )}
          </div>
        </div>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
        <button
          type="button"
          className="pb-btn pb-btn-sm pb-btn-ghost"
          onClick={(event) => {
            event.stopPropagation();
            toggleLike(item.id);
          }}
          aria-pressed={item.likedByMe}
          title="Like this speech"
        >
          <Heart size={14} fill={item.likedByMe ? 'var(--c-bad)' : 'none'} color={item.likedByMe ? 'var(--c-bad)' : undefined} />
          {formatCount(item.likes)}
        </button>
        <button
          type="button"
          className="pb-btn pb-btn-sm pb-btn-ghost"
          onClick={(event) => {
            event.stopPropagation();
            toggleBookmark(item.id);
          }}
          aria-pressed={item.bookmarked}
          title="Bookmark"
        >
          <Bookmark size={14} fill={item.bookmarked ? 'var(--c-accent)' : 'none'} />
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="pb-btn pb-btn-sm"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/practice/${encodeURIComponent(item.id)}`);
          }}
          title="Rehearse with the teleprompter"
        >
          Rehearse
        </button>
      </div>
    </article>
  );
}
