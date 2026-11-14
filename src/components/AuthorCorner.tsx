'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/lib/router';

export type BuddyBadge = 'quintal' | 'sole' | 'grey';

const BADGE_INFO: Record<BuddyBadge, { label: string; title: string }> = {
  quintal: { label: 'Quintal', title: '100 presentations written, 100 read, and 100 rehearsed.' },
  sole: { label: 'Sole', title: 'Held the highest author-read count for a qualifying period.' },
  grey: { label: 'Grey', title: 'An established source of public-domain or openly licensed presentations.' },
};

export function AuthorBadges({ badges = [] }: { badges?: string[] }) {
  const valid = [...new Set(
    badges
      .filter((badge): badge is string => typeof badge === 'string')
      .map((badge) => badge.trim().toLowerCase())
      .filter((badge): badge is BuddyBadge => badge in BADGE_INFO),
  )];
  if (!valid.length) return null;
  return (
    <span className="pb-author-badges" aria-label={`Author badges: ${valid.map((badge) => BADGE_INFO[badge].label).join(', ')}`}>
      {valid.map((badge) => (
        <span key={badge} className={`pb-author-badge pb-author-badge-${badge}`} title={BADGE_INFO[badge].title}>
          {BADGE_INFO[badge].label}
        </span>
      ))}
    </span>
  );
}

export interface AuthorCornerProps {
  author: string;
  username?: string;
  photoURL?: string;
  sourceType?: 'person' | 'archive' | 'admin';
  sourceName?: string;
  sourceURL?: string;
  badges?: string[];
  compact?: boolean;
}

function safeHttpsUrl(value?: string): string {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function AuthorCorner({
  author,
  username,
  photoURL,
  sourceType = 'person',
  sourceName,
  sourceURL,
  badges,
  compact = false,
}: AuthorCornerProps) {
  const displayName = (sourceType === 'archive' ? sourceName : '')?.trim() || author.trim() || 'Anonymous';
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() || 'PB';
  const image = safeHttpsUrl(photoURL);
  const archiveURL = sourceType === 'archive' ? safeHttpsUrl(sourceURL) : '';
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [image]);

  const corner = (
    <span className={`pb-author-corner${compact ? ' pb-author-corner-compact' : ''}`}>
      <span className="pb-author-avatar" aria-hidden="true">
        {image && !imageFailed
          ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
          : <span>{initials}</span>}
      </span>
      <span className="pb-author-name">{username ? `@${username}` : displayName}</span>
      <AuthorBadges badges={badges} />
    </span>
  );

  if (username) {
    return (
      <Link
        to={`/${encodeURIComponent(username)}`}
        className="pb-author-link"
        aria-label={`View ${displayName}'s profile`}
        onClick={(event) => event.stopPropagation()}
      >
        {corner}
      </Link>
    );
  }
  if (archiveURL) {
    return (
      <a
        href={archiveURL}
        className="pb-author-link"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open source ${displayName}`}
        onClick={(event) => event.stopPropagation()}
      >
        {corner}
      </a>
    );
  }
  return <span className="pb-author-link">{corner}</span>;
}
