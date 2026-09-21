interface LogoProps {
  size?: number;
  className?: string;
  /** Show the wordmark next to the mark. */
  withWordmark?: boolean;
  /** Draw the mark inside its brand tile (icons, avatars). */
  tile?: boolean;
}

/**
 * The Presentation Buddy mark — "The Rise".
 *
 * Three steps climbing left to right, drawn as one unbroken stroke, with a
 * single point of light resting above the top step. It is the whole idea of
 * this place in one shape: nothing arrives finished, you build it a step at
 * a time, and the light is what you are climbing towards.
 *
 * One stroke, one dot. It survives a 16px favicon, a monochrome print and a
 * 512px app icon without losing a thing.
 */
export function Logo({ size = 32, className, withWordmark = false, tile = false }: LogoProps) {
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Presentation Buddy"
      style={{ flex: '0 0 auto', overflow: 'visible' }}
    >
      {tile && <rect x="0" y="0" width="32" height="32" rx="8" fill="var(--c-accent)" />}
      <path
        d="M5 25.5 H11.5 V18.5 H18 V11.5 H24.5"
        fill="none"
        stroke={tile ? 'var(--c-accent-ink)' : 'var(--c-accent)'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.5" cy="5" r="2.6" fill={tile ? 'var(--c-accent-ink)' : 'var(--c-accent)'} />
    </svg>
  );

  if (!withWordmark) {
    return (
      <span className={className} style={{ display: 'inline-flex' }}>
        {mark}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}
    >
      {mark}
      <span
        style={{
          fontFamily: 'var(--x-font-display)',
          fontWeight: 700,
          fontSize: '1.02rem',
          letterSpacing: '-0.015em',
          lineHeight: 1.05,
          color: 'var(--c-ink)',
          whiteSpace: 'nowrap',
        }}
      >
        Presentation
        <br />
        <span style={{ color: 'var(--c-accent)' }}>Buddy</span>
      </span>
    </span>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return <Logo size={size} />;
}

/**
 * Standalone mark with the house palette baked in — used for favicons,
 * app icons and share cards, where CSS variables are not available.
 * Mirrors scripts/lib/mark.mjs; keep the two in step.
 */
export function logoSvgStatic(size: number, bg = '#1d4f45', ink = '#f7f3ec'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="8" fill="${bg}"/>
  <path d="M5 25.5 H11.5 V18.5 H18 V11.5 H24.5" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24.5" cy="5" r="2.6" fill="${ink}"/>
</svg>`;
}
