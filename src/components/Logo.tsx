interface LogoProps {
  size?: number;
  className?: string;
  /** Show the wordmark next to the mark. */
  withWordmark?: boolean;
}

/**
 * Presentation Buddy mark: a spotlight over a rising stage of bars —
 * the "talk" and the "lift" in one shape. Drawn in SVG so it stays crisp
 * from a 16px favicon to a 512px app icon, and inherits the live theme.
 */
export function Logo({ size = 34, className, withWordmark = false }: LogoProps) {
  const id = `pb-logo-${Math.round(size)}`;
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
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
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
        {/* spotlight cone */}
        <path d="M24 9.5 L31.5 21 L16.5 21 Z" fill="var(--c-accent-ink)" opacity="0.92" />
        <circle cx="24" cy="8.6" r="2.1" fill="var(--c-accent-ink)" />
        {/* rising bars */}
        <rect x="12" y="25" width="5.4" height="11" rx="2.4" fill="var(--c-accent-ink)" opacity="0.55" />
        <rect x="21.3" y="22" width="5.4" height="14" rx="2.4" fill="var(--c-accent-ink)" opacity="0.78" />
        <rect x="30.6" y="18.5" width="5.4" height="17.5" rx="2.4" fill="var(--c-accent-ink)" />
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
