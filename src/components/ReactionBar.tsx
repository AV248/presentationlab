import { useState } from 'react';
import { Heart, Share2, ThumbsDown } from 'lucide-react';
import type { CollectionItem } from '../hooks/useCollection';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { useCloud } from '../store/cloud';
import { recordShare, setReaction } from '../services/data';
import { shareOrCopy } from '../lib/platform';
import { absoluteUrl } from '../lib/seo';
import { useGate } from './SignIn';

interface ReactionBarProps {
  item: CollectionItem;
  onCountsChange?: (likes: number, dislikes: number, shares: number) => void;
}

/**
 * Like, dislike and share. All three need an account, because all three move
 * a real counter that belongs to real people.
 */
export function ReactionBar({ item, onCountsChange }: ReactionBarProps) {
  const user = useAuth((s) => s.user);
  const setReactionLocal = useAuth((s) => s.setReactionLocal);
  const toast = useUi((s) => s.toast);
  const connect = useCloud((s) => s.connect);
  const gate = useGate();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<{ likes: number; dislikes: number; shares: number } | null>(null);

  const likes = local?.likes ?? item.likes ?? 0;
  const dislikes = local?.dislikes ?? item.dislikes ?? 0;
  const shares = local?.shares ?? item.shares ?? 0;
  const mine = item.myReaction;

  const countersExist = item.likes !== null;

  const react = (kind: 'like' | 'dislike') => {
    gate(() => {
      if (item.source !== 'cloud') {
        toast('Reactions are counted for published speeches in the shared library.', 'info');
        return;
      }
      setBusy(true);
      setReaction(item.id, user!.uid, kind)
        .then((state) => {
          setReactionLocal(item.id, state.kind);
          setLocal({ likes: state.likes, dislikes: state.dislikes, shares });
          onCountsChange?.(state.likes, state.dislikes, shares);
        })
        .catch((error) => {
          toast((error as Error)?.message ?? 'That did not save. Try again.', 'error');
        })
        .finally(() => setBusy(false));
    }, 'Sign in to let a writer know their words landed.');
  };

  // Every share is a real, permanent link straight to this speech — no
  // account needed to send it; the counter only moves when someone signed
  // in shares a published speech.
  const share = () => {
    const url = absoluteUrl(`/read/${encodeURIComponent(item.id)}`);
    void (async () => {
      const result = await shareOrCopy(item.title, item.preview, url);
      if (result === 'failed') {
        toast('Sharing is not supported here — copy the link instead.', 'warn');
        return;
      }
      if (item.source === 'cloud' && user) {
        try {
          const total = await recordShare(item.id, user.uid);
          setLocal({ likes, dislikes, shares: total });
          onCountsChange?.(likes, dislikes, total);
        } catch {
          /* share still happened; the counter is secondary */
        }
      }
      toast(result === 'shared' ? 'Shared — thank you' : 'Link copied to your clipboard', 'success');
      void connect(true);
    })();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button
        type="button"
        className="pb-btn pb-btn-sm"
        onClick={() => react('like')}
        aria-pressed={mine === 'like'}
        disabled={busy}
        title={countersExist ? 'Like this speech' : 'Reactions need a published speech'}
      >
        <Heart size={14} fill={mine === 'like' ? 'var(--c-bad)' : 'none'} color={mine === 'like' ? 'var(--c-bad)' : undefined} />
        {countersExist ? likes : '—'}
      </button>
      <button
        type="button"
        className="pb-btn pb-btn-sm pb-btn-ghost"
        onClick={() => react('dislike')}
        aria-pressed={mine === 'dislike'}
        disabled={busy}
        title="Not for me"
      >
        <ThumbsDown
          size={14}
          fill={mine === 'dislike' ? 'var(--c-ink-muted)' : 'none'}
          color={mine === 'dislike' ? 'var(--c-ink-muted)' : undefined}
        />
        {countersExist ? dislikes : '—'}
      </button>
      <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={share} title="Share">
        <Share2 size={14} />
        {countersExist ? shares : 'Share'}
      </button>
    </div>
  );
}
