import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A friendly last line of defence: if a screen ever throws, the reader keeps
 * their library (it lives in localStorage) and gets a way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Presentation Buddy crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="pb-panel" style={{ padding: 'clamp(24px, 5vw, 48px)', textAlign: 'center' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>🛟</div>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Something went sideways</h1>
        <p className="pb-muted" style={{ maxWidth: 460, margin: '0 auto 18px' }}>
          Your speeches, drafts and settings are safe — they live on this device. Try reloading, or
          reset the theme from the Control Room if a combination misbehaved.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="pb-btn pb-btn-primary" onClick={() => window.location.reload()}>
            Reload Presentation Buddy
          </button>
          <a className="pb-btn" href="#/">
            Back to the library
          </a>
        </div>
        <pre
          className="pb-well"
          style={{
            marginTop: 20,
            padding: 12,
            textAlign: 'left',
            fontSize: '0.72rem',
            overflowX: 'auto',
            color: 'var(--c-ink-muted)',
          }}
        >
          {error.message}
        </pre>
      </div>
    );
  }
}
