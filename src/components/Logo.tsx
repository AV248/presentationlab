interface LogoProps {
  size?: number;
  className?: string;
  /** Show the wordmark next to the mark. */
  withWordmark?: boolean;
}

/**
 * The Presentation Buddy mark — "Voices Rising".
 *
 * A speech bubble carries three voice bars that crescendo left to right,
 * with a small spark breaking free at the top: the exact moment a quiet
 * thought becomes something worth saying out loud. The mark is drawn in
 * SVG, inherits the live theme's accent pair (every theme re-tints it),
 * and stays crisp from a 16px favicon to a 512px app icon.
 */
export function Logo({ size = 34, className, withWordmark = false }: LogoProps) {
  const id = `pb-logo-${Math.round(size)}-${withWordmark ? 'w' : 'm'}`;
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label="Presentation Buddy"
        style={{ flex: '0 0 auto' }}
      >
        <defs>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--c-accent)" />
            <stop offset="100%" stopColor="var(--c-accent-2)" />
          </linearGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x="1.5"
          y="1.5"
          width="45"
          height="45"
          rx="13"
          fill={`url(#${id}-bg)`}
          stroke="var(--c-line)"
          strokeWidth="1"
        />
        <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill={`url(#${id}-sheen)`} />
        {/* speech bubble */}
        <rect
          x="8"
          y="7.5"
          width="27"
          height="21"
          rx="8.5"
          fill="none"
          stroke="var(--c-accent-ink)"
          strokeWidth="3"
          opacity="0.96"
        />
        <path
          d="M14 27.5 L11 35.5 L21.5 28"
          fill="none"
          stroke="var(--c-accent-ink)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.96"
        />
        {/* voices rising */}
        <rect x="14.4" y="17.5" width="3.4" height="5.5" rx="1.7" fill="var(--c-accent-ink)" opacity="0.72" />
        <rect x="20.3" y="14.5" width="3.4" height="8.5" rx="1.7" fill="var(--c-accent-ink)" opacity="0.86" />
        <rect x="26.2" y="11.5" width="3.4" height="11.5" rx="1.7" fill="var(--c-accent-ink)" />
        {/* the spark */}
        <path
          d="M38.5 6.5 L39.9 10.1 L43.5 11.5 L39.9 12.9 L38.5 16.5 L37.1 12.9 L33.5 11.5 L37.1 10.1 Z"
          fill="var(--c-accent-ink)"
          opacity="0.95"
        />
        {/* ground */}
        <rect x="13" y="37.5" width="17" height="3" rx="1.5" fill="var(--c-accent-ink)" opacity="0.28" />
      </svg>
      {withWordmark && (
        <span
          style={{
            fontFamily: 'var(--x-font-display)',
            fontWeight: 700,
            fontSize: '1.02rem',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            color: 'var(--c-ink)',
          }}
        >
          Presentation
          <br />
          <span style={{ color: 'var(--c-accent)' }}>Buddy</span>
        </span>
      )}
    </span>
  );
}

export function LogoMark({ size = 34 }: { size?: number }) {
  return <Logo size={size} />;
}

/**
 * Standalone mark with the house palette baked in — used for favicons,
 * app icons and share cards, where CSS variables are not available.
 */
export function logoSvgStatic(size: number, a1 = '#b0532f', a2 = '#2f5d54'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a1}"/>
      <stop offset="100%" stop-color="${a2}"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill="url(#bg)"/>
  <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill="url(#sheen)"/>
  <rect x="8" y="7.5" width="27" height="21" rx="8.5" fill="none" stroke="#fbf7f1" stroke-width="3" opacity="0.96"/>
  <path d="M14 27.5 L11 35.5 L21.5 28" fill="none" stroke="#fbf7f1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.96"/>
  <rect x="14.4" y="17.5" width="3.4" height="5.5" rx="1.7" fill="#fbf7f1" opacity="0.72"/>
  <rect x="20.3" y="14.5" width="3.4" height="8.5" rx="1.7" fill="#fbf7f1" opacity="0.86"/>
  <rect x="26.2" y="11.5" width="3.4" height="11.5" rx="1.7" fill="#fbf7f1"/>
  <path d="M38.5 6.5 L39.9 10.1 L43.5 11.5 L39.9 12.9 L38.5 16.5 L37.1 12.9 L33.5 11.5 L37.1 10.1 Z" fill="#fbf7f1" opacity="0.95"/>
  <rect x="13" y="37.5" width="17" height="3" rx="1.5" fill="#fbf7f1" opacity="0.28"/>
</svg>`;
}
