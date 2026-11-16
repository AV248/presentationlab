'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../store/auth';
import { clerkSessionToken } from '../services/clerk';
import type { HealthReport } from '../server/health';

export function DbmsPage() {
  const ready = useAuth((state) => state.ready);
  const role = useAuth((state) => state.role);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const authorized = role === 'admin' || role === 'owner';

  const refresh = useCallback(async () => {
    if (!authorized) return;
    setLoading(true);
    setError('');
    try {
      const token = await clerkSessionToken();
      if (!token) throw new Error('Your sign-in has expired. Sign in again.');
      const response = await fetch('/api/admin/dbms', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json() as HealthReport | { message?: string };
      if (!response.ok) throw new Error('message' in payload ? payload.message || 'The report could not be loaded.' : 'The report could not be loaded.');
      setReport(payload as HealthReport);
    } catch (cause) {
      setReport(null);
      setError((cause as Error).message || 'The diagnostic report could not be reached.');
    } finally {
      setLoading(false);
    }
  }, [authorized]);

  useEffect(() => { if (ready && authorized) void refresh(); }, [ready, authorized, refresh]);

  if (!ready) return <div className="pb-page pb-narrow"><p className="pb-muted">Checking your sign-in…</p></div>;
  if (!authorized) {
    return (
      <div className="pb-page pb-narrow">
        <section className="pb-panel" style={{ padding: 24 }}>
          <ShieldAlert size={20} style={{ color: 'var(--c-warn)' }} />
          <h1 className="pb-page-title" style={{ marginTop: 8 }}>Workspace access required</h1>
          <p className="pb-muted">This diagnostics room is restricted to Presentation Buddy administrators.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="pb-page pb-narrow pb-dbms">
      <header className="pb-page-head">
        <span className="pb-eyebrow"><Activity size={13} /> Admin workspace</span>
        <h1 className="pb-page-title">Database & service health</h1>
        <p className="pb-page-sub">Read-only probes of the services the app depends on. This report never returns keys or credential values.</p>
      </header>
      <div className="pb-panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong>{report ? `Status: ${report.verdict}` : 'Status unavailable'}</strong>
            <p className="pb-muted" style={{ fontSize: '0.83rem', marginTop: 4 }}>{report?.summary ?? (error || 'Waiting for the first probe.')}</p>
          </div>
          <button type="button" className="pb-btn pb-btn-sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={13} /> {loading ? 'Checking…' : 'Run checks'}
          </button>
        </div>
        {report?.at && <p className="pb-muted" style={{ fontSize: '0.72rem', marginTop: 10 }}>Checked {new Date(report.at).toLocaleString('en-US', { timeZone: 'UTC' })}</p>}
      </div>
      {error && <p className="pb-notice" role="alert">{error}</p>}
      <section aria-label="Service checks" style={{ display: 'grid', gap: 9 }}>
        {report?.checks.map((check) => (
          <article key={check.id} className="pb-panel" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '0.98rem' }}>{check.title}</h2>
              <span className="pb-chip" data-status={check.status}>{check.status}{check.critical ? ' · required' : ' · optional'}</span>
            </div>
            <p className="pb-muted" style={{ fontSize: '0.82rem', lineHeight: 1.65, marginTop: 6 }}>{check.detail}</p>
            {check.vars.length > 0 && <p className="pb-mono pb-muted" style={{ fontSize: '0.7rem', marginTop: 8 }}>Variables: {check.vars.join(', ')}</p>}
            {check.ms !== undefined && <p className="pb-muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>Probe: {check.ms} ms</p>}
            {check.fix && <p className="pb-soft" style={{ fontSize: '0.78rem', lineHeight: 1.6, marginTop: 8 }}>Next step: {check.fix}</p>}
          </article>
        ))}
      </section>
      <a className="pb-btn pb-btn-ghost" href="/admin">Back to the admin workspace</a>
    </div>
  );
}
