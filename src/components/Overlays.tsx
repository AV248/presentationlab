import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Keyboard, Sparkles, X } from 'lucide-react';
import { ThemeStudio } from './ThemeStudio';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { NAV } from './AppShell';
import { modifierLabel } from '../lib/platform';

/** Slide-over wrapper for the theme studio. */
export function ThemeSheet() {
  const open = useUi((s) => s.themePanelOpen);
  const setOpen = useUi((s) => s.setThemePanel);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <>
      <div
        className="pb-overlay"
        onClick={() => setOpen(false)}
        role="presentation"
        style={{ background: 'var(--c-scrim)' }}
      />
      <ThemeStudio variant="sheet" />
    </>
  );
}

/** Shortcut reference dialog. */
export function HelpDialog() {
  const open = useUi((s) => s.helpOpen);
  const setOpen = useUi((s) => s.setHelp);
  const navigate = useNavigate();
  const mod = modifierLabel();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const shortcuts: [string, string][] = [
    [`${mod}K`, 'Command palette'],
    ['/', 'Search the library'],
    ['T', 'Theme studio'],
    ['?', 'This dialog'],
    ['G', 'Jump to page by number'],
    ['Space', 'Play / pause rehearsal'],
    ['↑ / ↓', 'Rehearsal pace'],
    ['R', 'Restart rehearsal'],
    ['F', 'Fullscreen'],
    ['Esc', 'Close overlays'],
  ];

  return (
    <div className="pb-overlay" onClick={() => setOpen(false)} role="presentation">
      <div
        className="pb-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Keyboard size={19} style={{ color: 'var(--c-accent)' }} />
          <h2 style={{ fontSize: '1.1rem' }}>Keyboard shortcuts</h2>
          <button
            type="button"
            className="pb-icon-btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
          {shortcuts.map(([keys, label]) => (
            <div
              key={keys}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 0',
                borderBottom: '1px solid var(--c-line-soft)',
              }}
            >
              <span className="pb-kbd" style={{ minWidth: 74, justifyContent: 'center' }}>
                {keys}
              </span>
              <span className="pb-soft" style={{ fontSize: '0.86rem' }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {NAV.map((item, index) => (
            <button
              key={item.to}
              type="button"
              className="pb-chip"
              onClick={() => {
                setOpen(false);
                navigate(item.to);
              }}
            >
              <span className="pb-kbd" style={{ marginRight: 6 }}>
                {index + 1}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Welcome strip shown once, to a first-time visitor.
 *
 * It points at the rehearsal room rather than the theme studio: the thing
 * that makes you better is speaking out loud, not choosing a colour. The
 * themes are still one tap away in the drawer for anyone who wants them.
 */
export function FirstRun() {
  const setOnboarded = useSettings((s) => s.setOnboarded);
  return (
    <div className="pb-panel" style={{ padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <Sparkles size={20} style={{ color: 'var(--c-accent)' }} />
      <div style={{ flex: '1 1 260px' }}>
        <strong style={{ fontSize: '0.92rem' }}>Qualities are not gifted, they are built.</strong>
        <p className="pb-muted" style={{ fontSize: '0.8rem' }}>
          Read something here, then go and say it out loud in the rehearsal room. That is the
          whole method.
        </p>
      </div>
      <Link
        to="/rehearse"
        className="pb-btn pb-btn-sm pb-btn-primary"
        onClick={() => setOnboarded(true)}
      >
        Start rehearsing
      </Link>
      <button
        type="button"
        className="pb-btn pb-btn-sm pb-btn-ghost"
        onClick={() => setOnboarded(true)}
      >
        Later
      </button>
    </div>
  );
}
