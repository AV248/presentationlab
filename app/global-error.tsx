'use client';

/**
 * The last resort: the failure happened above the app's own shell, so this
 * file renders its own `<html>` and `<body>` and cannot rely on any of the
 * site's styles being loaded. Hence the inline styles — this page has to look
 * like something on its own.
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  // The detail stays in the console, which is where the platform keeps it and
  // where a maintainer can find it. It is not rendered: a stack trace is not a
  // thing to show a reader.
  console.error('[pb] the app failed above its own shell', error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f3ebdf',
          color: '#2b2723',
          fontFamily: 'Georgia, serif',
        }}
      >
        <main style={{ maxWidth: 560, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.4rem', marginBottom: 12 }}>Presentation Buddy could not start</h1>
          <p style={{ lineHeight: 1.7, marginBottom: 20 }}>
            Something failed before the site could load. Reloading usually fixes it; if it keeps
            happening, the address below is the one to report.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid #2b2723',
              background: 'transparent',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          <p style={{ marginTop: 24, fontSize: '0.8rem', opacity: 0.7 }}>
            amaavrit@yahoo.com · contact.aavrit.dedyn.io
          </p>
        </main>
      </body>
    </html>
  );
}
