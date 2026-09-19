import { useMemo, useState, type CSSProperties } from 'react';
import {
  Check,
  Dices,
  LayoutGrid,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Type,
  Waves,
  X,
} from 'lucide-react';
import {
  AXES,
  AXIS_TOTAL,
  COMBINATIONS,
  COLOR_THEMES,
  LAYOUT_THEMES,
  MOTION_THEMES,
  PRESETS,
  UI_THEMES,
  UX_THEMES,
  colorById,
  layoutById,
  motionById,
  uiById,
  uxById,
} from '../design/index';
import type {
  AxisId,
  ColorTheme,
  LayoutTheme,
  MotionTheme,
  ThemePreset,
  ThemeSelection,
  UiTheme,
  UxTheme,
} from '../design/types';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';

const AXIS_ICON: Record<AxisId, typeof Palette> = {
  color: Palette,
  motion: Waves,
  layout: LayoutGrid,
  ui: Sparkles,
  ux: Type,
};

/* ------------------------------------------------------------------ */
/* Live previews                                                        */
/* ------------------------------------------------------------------ */

function ColorPreview({ theme }: { theme: ColorTheme }) {
  const p = theme.palette;
  const dark = theme.scheme === 'dark';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '1fr auto',
        gap: 8,
        padding: 10,
        borderRadius: 'var(--u-radius-sm)',
        background: p.bg,
        border: '1px solid var(--c-line)',
        height: 92,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <div
          style={{
            flex: 1,
            height: '100%',
            borderRadius: 6,
            background: p.panel,
            border: `1px solid ${p.line}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', inset: '8px 8px auto 8px', height: 4, borderRadius: 2, background: p.ink, opacity: 0.75 }} />
          <div style={{ position: 'absolute', inset: '18px 22px auto 8px', height: 3, borderRadius: 2, background: p.inkSoft, opacity: 0.5 }} />
          <div style={{ position: 'absolute', inset: '26px 16px auto 8px', height: 3, borderRadius: 2, background: p.inkMuted, opacity: 0.35 }} />
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              height: 12,
              width: 22,
              borderRadius: 4,
              background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})`,
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[p.accent, p.accent2, p.accent3].map((color) => (
          <span
            key={color}
            style={{ flex: 1, height: 8, borderRadius: 3, background: color, opacity: dark ? 1 : 0.95 }}
          />
        ))}
      </div>
    </div>
  );
}

function MotionPreview({ theme }: { theme: MotionTheme }) {
  const frozen = theme.speed === 0;
  const style: CSSProperties = {
    ['--demo-dur' as string]: theme.base,
    ['--demo-ease' as string]: theme.ease,
  };
  return (
    <div
      style={{
        height: 92,
        borderRadius: 'var(--u-radius-sm)',
        border: '1px solid var(--c-line)',
        background: 'var(--c-surface-3)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 10,
        ...style,
      }}
    >
      <div style={{ position: 'relative', height: 10 }}>
        {frozen ? (
          <span style={{ position: 'absolute', left: 0, width: 12, height: 10, borderRadius: 3, background: 'var(--c-ink-muted)' }} />
        ) : (
          <span
            style={{
              position: 'absolute',
              left: 0,
              width: 12,
              height: 10,
              borderRadius: 3,
              background: 'var(--c-accent)',
              animation: 'pb-demo-x var(--demo-dur) var(--demo-ease) infinite alternate',
            }}
          />
        )}
        <span style={{ position: 'absolute', inset: '4px 0 auto 0', height: 1, background: 'var(--c-line)' }} />
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 14,
              height: 22,
              borderRadius: 5,
              background: 'var(--c-accent-soft)',
              border: '1px solid var(--c-accent-line)',
              transform: frozen ? 'none' : 'translateY(0)',
              animation: frozen
                ? undefined
                : `pb-demo-y var(--demo-dur) var(--demo-ease) ${(i * theme.stagger) / 1000}s infinite alternate`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const LAYOUT_PREVIEWS: Record<string, CSSProperties> = {
  grid: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '18px' },
  bento: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '18px' },
  masonry: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '18px' },
  timeline: { gridTemplateColumns: '1fr', gridAutoRows: '12px' },
  spotlight: { gridTemplateColumns: '1fr', gridAutoRows: '14px' },
  gallery: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '24px' },
  list: { gridTemplateColumns: '1fr', gridAutoRows: '10px' },
  split: { gridTemplateColumns: '1fr 1fr', gridAutoRows: '18px' },
  editorial: { gridTemplateColumns: '1fr 1fr', gridAutoRows: '18px' },
  carousel: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '26px' },
  zen: { gridTemplateColumns: '1fr', gridAutoRows: '16px' },
  dashboard: { gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: '14px' },
  dossier: { gridTemplateColumns: '1fr', gridAutoRows: '12px' },
  newsprint: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '18px' },
  showcase: { gridTemplateColumns: 'repeat(2, 1fr)', gridAutoRows: '30px' },
  ribbon: { gridTemplateColumns: '1fr', gridAutoRows: '12px' },
  table: { gridTemplateColumns: '1fr', gridAutoRows: '10px' },
  constellation: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '18px' },
  theatre: { gridTemplateColumns: 'repeat(2, 1fr)', gridAutoRows: '30px' },
  focus: { gridTemplateColumns: '1fr', gridAutoRows: '34px' },
  stack: { gridTemplateColumns: '1fr', gridAutoRows: '16px' },
  ledger: { gridTemplateColumns: '1fr', gridAutoRows: '10px' },
};

function LayoutPreview({ theme }: { theme: LayoutTheme }) {
  const cells = theme.mode === 'dashboard' ? 8 : theme.mode === 'focus' ? 1 : 6;
  const radius = Math.max(2, parseFloat(theme.radius) / 3);
  return (
    <div
      style={{
        height: 92,
        padding: 10,
        borderRadius: 'var(--u-radius-sm)',
        border: '1px solid var(--c-line)',
        background: 'var(--c-surface-3)',
        display: 'grid',
        gap: 4,
        ...LAYOUT_PREVIEWS[theme.mode],
      }}
    >
      {Array.from({ length: cells }).map((_, i) => (
        <span
          key={i}
          style={{
            background: i === 0 ? 'var(--c-accent-soft)' : 'var(--c-line-soft)',
            border: `1px solid ${i === 0 ? 'var(--c-accent-line)' : 'var(--c-line)'}`,
            borderRadius: radius,
            gridColumn:
              theme.mode === 'bento' && i === 0
                ? 'span 2'
                : theme.mode === 'constellation' && i === 0
                  ? 'span 2'
                  : theme.mode === 'showcase' && i === 0
                    ? 'span 2'
                    : undefined,
          }}
        />
      ))}
    </div>
  );
}

function UiPreview({ theme }: { theme: UiTheme }) {
  const surface =
    theme.alpha >= 1 ? 'var(--c-surface-solid)' : 'var(--c-surface)';
  return (
    <div
      style={{
        height: 92,
        borderRadius: 'var(--u-radius-sm)',
        border: '1px solid var(--c-line)',
        background: 'var(--c-surface-3)',
        padding: 12,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 56,
          background: surface,
          backgroundImage: 'var(--grad-sheen)',
          border: `${theme.border} solid var(--c-line)`,
          borderRadius: `calc(var(--u-radius) * ${theme.radiusScale})`,
          boxShadow: theme.shadow,
          backdropFilter: theme.blur === '0px' ? undefined : `blur(${theme.blur})`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 6,
            background: 'var(--grad-brand)',
            flex: '0 0 auto',
          }}
        />
        <span style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--c-ink-muted)', opacity: 0.6 }} />
        <span style={{ width: 22, height: 5, borderRadius: 3, background: 'var(--c-accent)', opacity: 0.85 }} />
      </div>
    </div>
  );
}

function UxPreview({ theme }: { theme: UxTheme }) {
  return (
    <div
      style={{
        height: 92,
        borderRadius: 'var(--u-radius-sm)',
        border: '1px solid var(--c-line)',
        background: 'var(--c-surface-3)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <span
        style={{
          fontFamily: theme.fontDisplay,
          fontWeight: theme.weightDisplay,
          fontSize: `${1.25 * theme.scale}rem`,
          letterSpacing: theme.tracking,
          textTransform: theme.caps ? 'uppercase' : undefined,
          color: 'var(--c-ink)',
          lineHeight: 1.1,
        }}
      >
        Speak well
      </span>
      <span
        style={{
          fontFamily: theme.fontBody,
          fontWeight: theme.weightBody,
          fontSize: `${0.62 * theme.scale}rem`,
          lineHeight: theme.leading,
          letterSpacing: theme.tracking,
          color: 'var(--c-ink-muted)',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        The quick brown fox jumps over the lazy dog while the room listens.
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Option card                                                          */
/* ------------------------------------------------------------------ */

interface OptionCardProps {
  id: string;
  name: string;
  note: string;
  active: boolean;
  onSelect: () => void;
  preview: React.ReactNode;
  meta?: string;
}

function OptionCard({ name, note, active, onSelect, preview, meta }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="pb-panel"
      style={{
        padding: 10,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderColor: active ? 'var(--c-accent)' : 'var(--c-line)',
        boxShadow: active ? `0 0 0 1px var(--c-accent-line), var(--u-shadow)` : 'var(--u-shadow)',
        background: active ? 'var(--c-accent-softer)' : 'var(--c-surface)',
      }}
    >
      {preview}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            border: `1px solid ${active ? 'var(--c-accent)' : 'var(--c-line-strong)'}`,
            background: active ? 'var(--c-accent)' : 'transparent',
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
          }}
        >
          {active && <Check size={11} color="var(--c-accent-ink)" strokeWidth={3} />}
        </span>
        <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--c-ink)' }}>{name}</span>
        {meta && (
          <span className="pb-mono" style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--c-ink-muted)' }}>
            {meta}
          </span>
        )}
      </span>
      <span style={{ fontSize: '0.74rem', lineHeight: 1.45, color: 'var(--c-ink-muted)' }}>{note}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Studio                                                               */
/* ------------------------------------------------------------------ */

export function ThemeStudio({ variant = 'sheet' }: { variant?: 'sheet' | 'page' }) {
  const theme = useSettings((s) => s.theme);
  const setAxis = useSettings((s) => s.setAxis);
  const setTheme = useSettings((s) => s.setTheme);
  const randomize = useSettings((s) => s.randomizeTheme);
  const reset = useSettings((s) => s.resetTheme);
  const presetId = useSettings((s) => s.presetId);
  const customPresets = useSettings((s) => s.customPresets);
  const savePreset = useSettings((s) => s.savePreset);
  const deletePreset = useSettings((s) => s.deletePreset);
  const setThemePanel = useUi((s) => s.setThemePanel);
  const toast = useUi((s) => s.toast);

  const [axis, setActiveAxis] = useState<AxisId>('color');
  const [query, setQuery] = useState('');
  const [presetName, setPresetName] = useState('');

  const presets = useMemo(() => [...customPresets, ...PRESETS], [customPresets]);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    switch (axis) {
      case 'color':
        return COLOR_THEMES.filter(
          (o) => !needle || o.name.toLowerCase().includes(needle) || o.note.toLowerCase().includes(needle),
        ).map((o) => ({
          id: o.id,
          name: o.name,
          note: o.note,
          meta: o.scheme,
          preview: <ColorPreview theme={o} />,
        }));
      case 'motion':
        return MOTION_THEMES.filter(
          (o) => !needle || o.name.toLowerCase().includes(needle) || o.note.toLowerCase().includes(needle),
        ).map((o) => ({
          id: o.id,
          name: o.name,
          note: o.note,
          meta: o.speed === 0 ? 'still' : `${o.stagger}ms`,
          preview: <MotionPreview theme={o} />,
        }));
      case 'layout':
        return LAYOUT_THEMES.filter(
          (o) => !needle || o.name.toLowerCase().includes(needle) || o.note.toLowerCase().includes(needle),
        ).map((o) => ({
          id: o.id,
          name: o.name,
          note: o.note,
          meta: o.mode,
          preview: <LayoutPreview theme={o} />,
        }));
      case 'ui':
        return UI_THEMES.filter(
          (o) => !needle || o.name.toLowerCase().includes(needle) || o.note.toLowerCase().includes(needle),
        ).map((o) => ({
          id: o.id,
          name: o.name,
          note: o.note,
          meta: o.style,
          preview: <UiPreview theme={o} />,
        }));
      default:
        return UX_THEMES.filter(
          (o) => !needle || o.name.toLowerCase().includes(needle) || o.note.toLowerCase().includes(needle),
        ).map((o) => ({
          id: o.id,
          name: o.name,
          note: o.note,
          meta: `${o.measure}ch`,
          preview: <UxPreview theme={o} />,
        }));
    }
  }, [axis, query]);

  const applyPreset = (preset: ThemePreset) => {
    const selection: ThemeSelection = {
      color: preset.color,
      motion: preset.motion,
      layout: preset.layout,
      ui: preset.ui,
      ux: preset.ux,
    };
    setTheme(selection, preset.id);
  };

  const summary = [
    colorById(theme.color).name,
    motionById(theme.motion).name,
    layoutById(theme.layout).name,
    uiById(theme.ui).name,
    uxById(theme.ux).name,
  ];

  const body = (
    <>
      <div
        style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--c-line-soft)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Palette size={19} style={{ color: 'var(--c-accent)' }} />
          <h2 style={{ fontSize: '1.15rem' }}>Theme studio</h2>
          <span className="pb-chip" style={{ marginLeft: 'auto' }}>
            {AXIS_TOTAL} options
          </span>
          {variant === 'sheet' && (
            <button
              type="button"
              className="pb-icon-btn"
              onClick={() => setThemePanel(false)}
              aria-label="Close theme studio"
            >
              <X size={17} />
            </button>
          )}
        </div>

        <p style={{ fontSize: '0.83rem', color: 'var(--c-ink-muted)', lineHeight: 1.6 }}>
          Five independent axes, all mixable — <strong style={{ color: 'var(--c-ink)' }}>
            {COMBINATIONS.toLocaleString()}
          </strong>{' '}
          possible combinations. Changes apply instantly and are saved to this device.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {summary.map((label, index) => (
            <button
              key={label}
              type="button"
              className="pb-chip pb-chip-accent"
              onClick={() => setActiveAxis(AXES[index].id)}
              title={`Edit ${AXES[index].label}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="pb-btn pb-btn-sm" onClick={randomize}>
            <Dices size={15} /> Surprise me
          </button>
          <button type="button" className="pb-btn pb-btn-sm pb-btn-ghost" onClick={reset}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      </div>

      <div className="pb-scroll" style={{ flex: 1, padding: '0 20px 28px' }}>
        <section style={{ marginTop: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
              justifyContent: 'space-between',
            }}
          >
            <h3 style={{ fontSize: '0.95rem' }}>Designer presets</h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--c-ink-muted)' }}>
              {presetId ? 'preset active' : 'custom combo'}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 8,
              scrollSnapType: 'x mandatory',
            }}
          >
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="pb-panel"
                style={{
                  flex: '0 0 168px',
                  scrollSnapAlign: 'start',
                  padding: 10,
                  textAlign: 'left',
                  borderColor: presetId === preset.id ? 'var(--c-accent)' : 'var(--c-line)',
                  background: presetId === preset.id ? 'var(--c-accent-softer)' : 'var(--c-surface)',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                  {colorById(preset.color).swatch.map((color) => (
                    <span
                      key={color}
                      style={{ flex: 1, height: 26, borderRadius: 6, background: color }}
                    />
                  ))}
                </div>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem' }}>{preset.name}</span>
                <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--c-ink-muted)', lineHeight: 1.4 }}>
                  {layoutById(preset.layout).name} · {uiById(preset.ui).name}
                </span>
                {preset.id.startsWith('custom-') && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Delete ${preset.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      deletePreset(preset.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.stopPropagation();
                        deletePreset(preset.id);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      color: 'var(--c-ink-muted)',
                      background: 'var(--c-surface-solid)',
                      borderRadius: 999,
                      padding: 4,
                    }}
                  >
                    <Trash2 size={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              savePreset(presetName);
              setPresetName('');
              toast('Combination saved as a preset', 'success');
            }}
            style={{ display: 'flex', gap: 8, marginTop: 10 }}
          >
            <input
              className="pb-input"
              placeholder="Name this combination…"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              aria-label="Preset name"
            />
            <button type="submit" className="pb-btn pb-btn-sm" disabled={!presetName.trim()}>
              Save
            </button>
          </form>
        </section>

        <section style={{ marginTop: 26 }}>
          <div
            role="tablist"
            aria-label="Theme axes"
            style={{
              display: 'flex',
              gap: 4,
              padding: 4,
              borderRadius: 'var(--u-radius-sm)',
              background: 'var(--c-surface-3)',
              border: '1px solid var(--c-line-soft)',
              overflowX: 'auto',
            }}
          >
            {AXES.map((item) => {
              const Icon = AXIS_ICON[item.id];
              const active = axis === item.id;
              return (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => {
                    setActiveAxis(item.id);
                    setQuery('');
                  }}
                  style={{
                    flex: 1,
                    minWidth: 'max-content',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '8px 10px',
                    borderRadius: 'calc(var(--u-radius-sm) - 2px)',
                    background: active ? 'var(--c-accent-soft)' : 'transparent',
                    color: active ? 'var(--c-accent)' : 'var(--c-ink-soft)',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon size={15} />
                  {item.label}
                  <span style={{ opacity: 0.6, fontWeight: 500 }}>{item.options.length}</span>
                </button>
              );
            })}
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--c-ink-muted)', margin: '10px 0 12px' }}>
            {AXES.find((a) => a.id === axis)?.blurb}
          </p>

          <div style={{ position: 'relative', marginBottom: 14 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 11,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--c-ink-muted)',
              }}
            />
            <input
              className="pb-input"
              placeholder={`Search ${options.length} ${AXES.find((a) => a.id === axis)?.label.toLowerCase()} options…`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ paddingLeft: 34 }}
              aria-label="Search theme options"
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(210px, 100%), 1fr))',
              gap: 12,
            }}
          >
            {options.map((option) => (
              <OptionCard
                key={option.id}
                id={option.id}
                name={option.name}
                note={option.note}
                meta={option.meta}
                active={theme[axis] === option.id}
                onSelect={() => setAxis(axis, option.id)}
                preview={option.preview}
              />
            ))}
            {!options.length && (
              <p className="pb-muted" style={{ gridColumn: '1 / -1', padding: '20px 0' }}>
                Nothing matches “{query}”.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );

  if (variant === 'page') {
    return (
      <div className="pb-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}>
        {body}
      </div>
    );
  }

  return (
    <div className="pb-sheet" role="dialog" aria-label="Theme studio" aria-modal="true">
      {body}
    </div>
  );
}
