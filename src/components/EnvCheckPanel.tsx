'use client';

/**
 * The environment, made visible.
 *
 * Rendered in two places on purpose:
 *   • the sign-in sheet, when sign-in is not configured — the exact moment
 *     somebody needs to know *which* variable is missing;
 *   • the admin workspace's Setup tab, for a routine check after a change.
 *
 * It shows presence, never values, and it can ask the server for its own
 * verdict — which is the only way to see the server-only variables, since
 * those never enter the browser bundle.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, RefreshCw, ServerCog, TriangleAlert } from 'lucide-react';
import {
  CLIENT_VARIABLE_NAMES,
  SERVER_VARIABLE_NAMES,
  auditEnvironment,
  probeServerEnv,
  type ServerProbe,
} from '../services/envCheck';

function StatusMark({ status }: { status: 'set' | 'missing' | 'placeholder' | 'danger' }) {
  if (status === 'set') {
    return <CheckCircle2 size={13} style={{ color: 'var(--c-ok)', flex: '0 0 auto' }} aria-label="set" />;
  }
  if (status === 'danger') {
    return <TriangleAlert size={13} style={{ color: 'var(--c-bad)', flex: '0 0 auto' }} aria-label="wrong" />;
  }
  return <CircleDashed size={13} style={{ color: 'var(--c-ink-muted)', flex: '0 0 auto' }} aria-label="missing" />;
}

export function EnvCheckPanel({ compact = false }: { compact?: boolean }) {
  const [groups, setGroups] = useState(() => auditEnvironment());
  const [probe, setProbe] = useState<ServerProbe | null>(null);
  const [checking, setChecking] = useState(false);

  const runProbe = async () => {
    setChecking(true);
    const result = await probeServerEnv();
    setProbe(result);
    setChecking(false);
  };

  // Ask the server once on mount: it is a single cheap request, and its
  // answer is the only sight we get of the server-only variables.
  useEffect(() => {
    void runProbe();
    // Re-running the audit on mount covers HMR in development.
    setGroups(auditEnvironment());
  }, []);

  const cloudOk = groups.find((g) => g.id === 'data')?.ok ?? false;
  const clerkOk = groups.find((g) => g.id === 'clerk')?.ok ?? false;
  const serverOk = probe?.ok ?? false;

  return (
    <div style={{ display: 'grid', gap: compact ? 12 : 16 }}>
      {!compact && (
        <div>
          <span className="pb-eyebrow">
            <ServerCog size={12} /> Environment
          </span>
          <h2 style={{ fontSize: '1.05rem', margin: '6px 0 4px' }}>What this deployment is running on</h2>
          <p className="pb-muted" style={{ fontSize: '0.82rem', lineHeight: 1.65 }}>
            Presence only — no value is ever shown. Variables beginning <span className="pb-mono">VITE_</span> are
            baked into the browser bundle at build time, so <strong>changing one requires a redeploy</strong>, not
            just a save.
          </p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id} className="pb-well" style={{ padding: compact ? '10px 12px' : 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.86rem' }}>{group.title}</strong>
            <span
              className="pb-mono"
              style={{
                fontSize: '0.68rem',
                color: group.ok ? 'var(--c-ok)' : group.weight === 'optional' ? 'var(--c-ink-muted)' : 'var(--c-bad)',
              }}
            >
              {group.ok ? 'complete' : group.weight === 'optional' ? 'optional → house fallback' : 'incomplete'}
            </span>
          </div>

          <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {group.vars.map((variable) => (
              <li key={variable.name} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
                <StatusMark status={variable.status} />
                <div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span className="pb-mono" style={{ fontSize: '0.74rem', wordBreak: 'break-all' }}>
                      {variable.name}
                    </span>
                    {variable.hint && (
                      <span className="pb-muted" style={{ fontSize: '0.7rem' }}>
                        {variable.hint}
                      </span>
                    )}
                  </div>
                  {/* Only explain a variable when it needs attention — a clean
                      list should stay quiet. */}
                  {variable.status !== 'set' && (
                    <p className="pb-muted" style={{ fontSize: '0.74rem', lineHeight: 1.6, marginTop: 2 }}>
                      {variable.what} <em>{variable.breaks}</em>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* The server-only half. Their values can never be seen from here — so
          we ask the endpoint that uses them. */}
      <div className="pb-well" style={{ padding: compact ? '10px 12px' : 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.86rem' }}>Server-only variables</strong>
          <button
            type="button"
            className="pb-btn"
            onClick={() => void runProbe()}
            disabled={checking}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}
          >
            <RefreshCw size={13} className={checking ? 'pb-spin' : undefined} aria-hidden="true" />
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </div>
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {SERVER_VARIABLE_NAMES.map((name) => (
            <li key={name} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
              <StatusMark status={probe === null ? 'missing' : serverOk ? 'set' : probe.missing.includes(name) ? 'danger' : 'placeholder'} />
              <span className="pb-mono" style={{ fontSize: '0.74rem', wordBreak: 'break-all' }}>{name}</span>
            </li>
          ))}
        </ul>
        <p
          className="pb-muted"
          style={{ fontSize: '0.74rem', lineHeight: 1.6, marginTop: 8 }}
          aria-live="polite"
        >
          {probe === null
            ? checking
              ? 'Asking the reading room…'
              : 'Not checked yet.'
            : probe.ok
              ? `${probe.label}: ${probe.detail}`
              : `${probe.label}${probe.reachable ? '' : ' (or the API is not deployed)'}: ${probe.detail}`}
        </p>
      </div>

      <details className="pb-well" style={{ padding: '10px 12px' }}>
        <summary className="pb-muted" style={{ fontSize: '0.78rem', cursor: 'pointer', userSelect: 'none' }}>
          The full list, in the order to paste into Vercel
        </summary>
        <ol className="pb-mono" style={{ fontSize: '0.72rem', lineHeight: 1.9, marginTop: 8, paddingInlineStart: 20 }}>
          {CLIENT_VARIABLE_NAMES.map((name) => (
            <li key={name} style={{ wordBreak: 'break-all' }}>{name}</li>
          ))}
        </ol>
        <p className="pb-muted" style={{ fontSize: '0.74rem', lineHeight: 1.6, marginTop: 6 }}>
          Then the {SERVER_VARIABLE_NAMES.length} server-only ones above, with <strong>no</strong> VITE_ prefix.
          Full instructions, including where each value comes from:{' '}
          <span className="pb-mono">docs/ENV.md</span>. Clerk {clerkOk ? 'is' : 'is not'} configured and the
          database {cloudOk ? 'is' : 'is not'} — that is why the site currently behaves the way it does.
        </p>
      </details>
    </div>
  );
}
