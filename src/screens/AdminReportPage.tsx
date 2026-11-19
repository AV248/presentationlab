'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { clerkSessionToken } from '../services/clerk';

type AuditReport = typeof import('../server/deepReviewReport').DEEP_REVIEW_REPORT;
type LoadState = { kind: 'loading' } | { kind: 'forbidden' } | { kind: 'error'; message: string } | { kind: 'ready'; report: AuditReport };

function StateNote({ children, bad = false }: { children: React.ReactNode; bad?: boolean }) {
  return <div className={bad ? 'pb-alert' : 'pb-well'} role={bad ? 'alert' : 'status'} style={{ padding: 16 }}>{children}</div>;
}

const severityTone: Record<string, string> = {
  Critical: 'var(--c-bad, #a13b32)',
  High: 'var(--c-accent2, #b9702e)',
  Moderate: 'var(--c-ink-muted)',
  Low: 'var(--c-ink-muted)',
};

export function AdminReportPage() {
  const ready = useAuth((state) => state.ready);
  const user = useAuth((state) => state.user);
  const openSignIn = useUi((state) => state.openSignIn);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: 'loading' });
    const token = await clerkSessionToken();
    if (!token) {
      setState({ kind: 'error', message: 'Your sign-in session could not be read. Sign in again and retry.' });
      return;
    }
    try {
      const response = await fetch('/api/admin/report', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
        signal,
      });
      if (response.status === 403) {
        setState({ kind: 'forbidden' });
        return;
      }
      const payload = await response.json().catch(() => ({})) as { report?: AuditReport; message?: string };
      if (!response.ok || !payload.report) throw new Error(payload.message ?? 'The private report could not be loaded.');
      setState({ kind: 'ready', report: payload.report });
    } catch (cause) {
      if (signal?.aborted) return;
      setState({ kind: 'error', message: cause instanceof Error ? cause.message : 'The private report could not be loaded.' });
    }
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [ready, user?.uid, load]);

  if (!ready) return <main className="pb-page pb-narrow"><StateNote>Checking your sign-in…</StateNote></main>;
  if (!user) {
    return (
      <main className="pb-page pb-narrow">
        <header className="pb-page-head"><span className="pb-eyebrow"><ShieldCheck size={13} /> Private review</span><h1 className="pb-page-title">Administrator access required</h1></header>
        <section className="pb-panel" style={{ padding: 22 }}>
          <p className="pb-muted" style={{ lineHeight: 1.7 }}>This report is private to Presentation Buddy administrators. Sign in with an authorized account to continue.</p>
          <button type="button" className="pb-btn pb-btn-primary" onClick={() => openSignIn('Sign in with an administrator account to read the private review.')}>Sign in</button>
        </section>
      </main>
    );
  }

  if (state.kind === 'loading') return <main className="pb-page pb-narrow"><StateNote>Checking your administrator role and opening the report…</StateNote></main>;
  if (state.kind === 'forbidden') {
    return (
      <main className="pb-page pb-narrow">
        <header className="pb-page-head"><span className="pb-eyebrow"><ShieldCheck size={13} /> Private review</span><h1 className="pb-page-title">Administrator access required</h1></header>
        <StateNote bad>Your account does not hold an admin or owner role. The report content was not returned.</StateNote>
        <p style={{ marginTop: 14 }}><a className="pb-btn pb-btn-ghost" href="/admin"><ArrowLeft size={14} /> Workspace</a></p>
      </main>
    );
  }
  if (state.kind === 'error') {
    return (
      <main className="pb-page pb-narrow">
        <header className="pb-page-head"><span className="pb-eyebrow"><ShieldCheck size={13} /> Private review</span><h1 className="pb-page-title">The review could not be opened</h1></header>
        <StateNote bad>{state.message}</StateNote>
        <button type="button" className="pb-btn" style={{ marginTop: 14 }} onClick={() => void load()}><RefreshCw size={14} /> Try again</button>
      </main>
    );
  }

  const report = state.report;
  return (
    <main className="pb-page pb-narrow" style={{ display: 'grid', gap: 14 }}>
      <header className="pb-page-head">
        <span className="pb-eyebrow"><FileText size={13} /> {report.classification} · Review date {report.reviewDate}</span>
        <h1 className="pb-page-title">{report.title}</h1>
        <p className="pb-page-sub">Product version {report.productVersion}. A private, code-focused review of the public site, data paths, admin controls and known operational risks.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="pb-btn pb-btn-ghost" href="/admin"><ArrowLeft size={14} /> Back to workspace</a>
          <button type="button" className="pb-btn" onClick={() => void load()}><RefreshCw size={14} /> Reload report</button>
        </div>
      </header>

      <section className="pb-panel" style={{ padding: '20px 22px' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>Executive summary</h2>
        <p style={{ lineHeight: 1.8, margin: 0 }}>{report.executiveSummary}</p>
      </section>

      <section>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 10px' }}>System boundaries reviewed</h2>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {report.architecture.map((part) => (
            <article key={part.system} className="pb-panel" style={{ padding: 14 }}>
              <strong>{part.system}</strong><p className="pb-muted" style={{ lineHeight: 1.65, fontSize: '.82rem', margin: '5px 0 0' }}>{part.responsibility}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div><h2 style={{ fontSize: '1.05rem', margin: 0 }}>Findings and remediation</h2><p className="pb-muted" style={{ fontSize: '.78rem', margin: '4px 0 0' }}>{report.findings.length} findings · patches are branch changes, not production attestations</p></div>
          <span className="pb-chip">Code review</span>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {report.findings.map((finding) => (
            <article key={finding.id} className="pb-panel" style={{ padding: '17px 19px' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className="pb-mono" style={{ fontSize: '.72rem' }}>{finding.id}</span>
                <span className="pb-chip" style={{ color: severityTone[finding.severity], borderColor: severityTone[finding.severity] }}>{finding.severity}</span>
                <h3 style={{ fontSize: '.98rem', margin: 0 }}>{finding.area}</h3>
                <span className="pb-muted" style={{ marginLeft: 'auto', fontSize: '.74rem' }}>{finding.status}</span>
              </div>
              <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
                <div><strong style={{ fontSize: '.78rem' }}>Signal</strong><p className="pb-soft" style={{ lineHeight: 1.65, fontSize: '.84rem', margin: '3px 0 0' }}>{finding.signal}</p></div>
                <div><strong style={{ fontSize: '.78rem' }}>Impact</strong><p className="pb-soft" style={{ lineHeight: 1.65, fontSize: '.84rem', margin: '3px 0 0' }}>{finding.impact}</p></div>
                <div><strong style={{ fontSize: '.78rem' }}>Resolution / next step</strong><p className="pb-soft" style={{ lineHeight: 1.65, fontSize: '.84rem', margin: '3px 0 0' }}>{finding.resolution}</p></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.02rem', margin: '0 0 8px' }}>Scope</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          {report.scope.map((item) => <li key={item} className="pb-muted" style={{ lineHeight: 1.6, fontSize: '.82rem' }}>{item}</li>)}
        </ul>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.02rem', margin: '0 0 8px' }}>Controls and preserved behavior</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          {report.controlsAndPreservedBehavior.map((item) => <li key={item} className="pb-muted" style={{ lineHeight: 1.6, fontSize: '.82rem' }}>{item}</li>)}
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: '1.02rem', margin: '0 0 8px' }}><AlertTriangle size={15} style={{ display: 'inline', verticalAlign: '-2px' }} /> Follow-up risks and operator actions</h2>
        <div className="pb-well" style={{ padding: '14px 18px' }}>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 7 }}>
            {report.followUpRisks.map((item) => <li key={item} style={{ lineHeight: 1.65, fontSize: '.82rem' }}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.02rem', margin: '0 0 4px' }}>Verification record · {report.verification.state}</h2>
        <p className="pb-muted" style={{ fontSize: '.78rem', lineHeight: 1.65 }}>The code can be checked locally. Production behavior requires a deployment and authorized database access; this report will not blur those two.</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 5 }}>
          {report.verification.checks.map((item) => <li key={item} className="pb-muted" style={{ lineHeight: 1.6, fontSize: '.8rem' }}>{item}</li>)}
        </ul>
      </section>
    </main>
  );
}
