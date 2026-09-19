import { Link } from 'react-router-dom';
import { Compass, Library } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="pb-panel" style={{ padding: 'clamp(32px, 6vw, 64px)', textAlign: 'center' }}>
      <Compass size={40} style={{ color: 'var(--c-accent)', margin: '0 auto 14px' }} />
      <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: 10 }}>Off the script</h1>
      <p className="pb-muted" style={{ maxWidth: 420, margin: '0 auto 22px' }}>
        That page does not exist. The library is a good place to find your footing again.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/" className="pb-btn pb-btn-primary">
          <Library size={16} /> Back to the library
        </Link>
        <Link to="/studio" className="pb-btn">
          Write a speech
        </Link>
      </div>
    </div>
  );
}
