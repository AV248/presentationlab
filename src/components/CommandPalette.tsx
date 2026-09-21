import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CornerDownLeft,
  Dices,
  FilePlus2,
  Focus,
  Library,
  Palette,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useSpeeches } from '../hooks/useCollection';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { NAV } from './AppShell';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: 'Speeches' | 'Pages' | 'Actions';
  icon: typeof Search;
  run: () => void;
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const close = useUi((s) => s.closePalette);
  const setThemePanel = useUi((s) => s.setThemePanel);
  const navigate = useNavigate();
  const items = useSpeeches();
  const createSpeech = useLibrary((s) => s.createSpeech);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const speechCommands: Command[] = items.slice(0, 200).map((item) => ({
      id: `speech-${item.id}`,
      label: item.title,
      hint: `${item.author} · ${item.minutes} min · ${item.category}`,
      group: 'Speeches',
      icon: Library,
      run: () => navigate(`/read/${encodeURIComponent(item.id)}`),
    }));

    const pageCommands: Command[] = NAV.map((item) => ({
      id: `page-${item.to}`,
      label: item.label,
      hint: item.hint,
      group: 'Pages',
      icon: item.icon,
      run: () => navigate(item.to),
    }));

    const actionCommands: Command[] = [
      {
        id: 'action-new',
        label: 'Write a new speech',
        hint: 'Open a fresh draft in the studio',
        group: 'Actions',
        icon: FilePlus2,
        run: () => {
          const id = createSpeech({ title: 'Untitled speech' });
          navigate(`/write/${id}`);
        },
      },
      {
        id: 'action-random',
        label: 'Open a random speech',
        hint: 'Serendipity mode',
        group: 'Actions',
        icon: Dices,
        run: () => {
          const pick = items[Math.floor(Math.random() * items.length)];
          if (pick) navigate(`/read/${encodeURIComponent(pick.id)}`);
        },
      },
      {
        id: 'action-theme',
        label: 'Open the theme studio',
        hint: `${items.length > 0 ? 'Five axes, instant preview' : ''}`,
        group: 'Actions',
        icon: Palette,
        run: () => setThemePanel(true),
      },
      {
        id: 'action-surprise',
        label: 'Surprise me with a theme',
        hint: 'Randomise all five axes',
        group: 'Actions',
        icon: Sparkles,
        run: () => setThemePanel(true),
      },
      {
        id: 'action-practice',
        label: 'Rehearse the last speech',
        hint: 'Teleprompter with pacing',
        group: 'Actions',
        icon: Focus,
        run: () => navigate('/rehearse'),
      },
      {
        id: 'action-community',
        label: 'See the leaderboard',
        hint: 'Authors ranked by likes',
        group: 'Actions',
        icon: Trophy,
        run: () => navigate('/community'),
      },
    ];

    return [...actionCommands, ...pageCommands, ...speechCommands];
  }, [items, navigate, createSpeech, setThemePanel]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands.slice(0, 24);
    return commands
      .filter(
        (command) =>
          command.label.toLowerCase().includes(needle) ||
          (command.hint ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 30);
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((index) => Math.min(results.length - 1, index + 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const command = results[active];
        if (command) {
          close();
          command.run();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, active, close]);

  if (!open) return null;

  let lastGroup = '';

  return (
    <div className="pb-overlay" onMouseDown={close} role="presentation">
      <div
        className="pb-modal"
        style={{ padding: 0, maxWidth: 620 }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--c-line-soft)',
          }}
        >
          <Search size={17} style={{ color: 'var(--c-ink-muted)' }} />
          <input
            ref={inputRef}
            className="pb-input"
            style={{ border: 'none', background: 'transparent', padding: 0 }}
            placeholder="Search speeches, pages and actions…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Command palette search"
          />
          <span className="pb-kbd">Esc</span>
        </div>

        <div style={{ maxHeight: '58vh', overflowY: 'auto', padding: 6 }}>
          {results.map((command, index) => {
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {showGroup && (
                  <div
                    className="pb-muted"
                    style={{
                      fontSize: '0.68rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      padding: '10px 12px 6px',
                    }}
                  >
                    {command.group}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    close();
                    command.run();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--u-radius-sm)',
                    background: index === active ? 'var(--c-accent-soft)' : 'transparent',
                    color: 'var(--c-ink)',
                    textAlign: 'left',
                  }}
                >
                  <command.icon size={16} style={{ color: 'var(--c-accent)', flex: '0 0 auto' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontWeight: 550,
                        fontSize: '0.9rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {command.label}
                    </span>
                    {command.hint && (
                      <span
                        className="pb-muted"
                        style={{
                          display: 'block',
                          fontSize: '0.72rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {command.hint}
                      </span>
                    )}
                  </span>
                  {index === active && <CornerDownLeft size={14} style={{ color: 'var(--c-accent)' }} />}
                </button>
              </div>
            );
          })}
          {!results.length && (
            <p className="pb-muted" style={{ padding: '26px 12px', textAlign: 'center', fontSize: '0.86rem' }}>
              Nothing matches “{query}”.
            </p>
          )}
        </div>

        <div
          className="pb-muted"
          style={{
            display: 'flex',
            gap: 14,
            padding: '10px 16px',
            borderTop: '1px solid var(--c-line-soft)',
            fontSize: '0.72rem',
          }}
        >
          <span>
            <span className="pb-kbd">↑</span> <span className="pb-kbd">↓</span> navigate
          </span>
          <span>
            <span className="pb-kbd">↵</span> open
          </span>
          <span>
            <span className="pb-kbd">esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
