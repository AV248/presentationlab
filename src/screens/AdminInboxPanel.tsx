'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Mail, RefreshCw, Save } from 'lucide-react';
import { useUi } from '../store/ui';
import {
  fetchAdminInbox,
  updateAdminInboxItem,
  type AdminInboxItem,
  type InboxKind,
  type InboxStatus,
} from '../services/admin';

const STATUS: InboxStatus[] = ['new', 'read', 'resolved', 'dismissed'];
type Filter = 'all' | InboxKind;

function statusName(value: InboxStatus): string {
  return value === 'new' ? 'New' : value === 'read' ? 'Read' : value === 'resolved' ? 'Resolved' : 'Dismissed';
}

function pageLink(value: string): string | null {
  const url = value.trim();
  if (!url || url.startsWith('//')) return null;
  if (url.startsWith('/') && !url.startsWith('/\\')) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeEmail(value: string): string | null {
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

export function AdminInboxPanel() {
  const toast = useUi((state) => state.toast);
  const [items, setItems] = useState<AdminInboxItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [drafts, setDrafts] = useState<Record<string, { status: InboxStatus; adminNote: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAdminInbox();
      setItems(result.items);
      setWarnings(result.warnings);
      setDrafts({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The private inbox could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = filter === 'all' ? items : items.filter((item) => item.kind === filter);
  const newCount = items.filter((item) => item.status === 'new').length;

  const draftFor = (item: AdminInboxItem) => drafts[`${item.source}:${item.id}`] ?? {
    status: item.status,
    adminNote: item.adminNote,
  };

  const save = async (item: AdminInboxItem) => {
    const key = `${item.source}:${item.id}`;
    const draft = draftFor(item);
    setSavingKey(key);
    try {
      await updateAdminInboxItem(item, draft.status, draft.adminNote);
      toast('Inbox update saved.', 'success');
      await load();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Inbox update could not be saved.', 'error');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <section className="pb-page" style={{ display: 'grid', gap: 12 }}>
      <header className="pb-panel" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <span className="pb-eyebrow"><Mail size={13} /> Private correspondence</span>
            <h2 style={{ fontSize: '1.2rem', margin: '6px 0 4px' }}>Inbox {newCount > 0 && <span className="pb-chip pb-chip-accent">{newCount} new</span>}</h2>
            <p className="pb-muted" style={{ fontSize: '.82rem', lineHeight: 1.6, margin: 0 }}>
              Database-stored reports, messages, and star feedback. Only an authenticated admin can read or update these records.
            </p>
          </div>
          <button type="button" className="pb-btn pb-btn-sm" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={13} /> {loading ? 'Loading…' : 'Refresh inbox'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <label className="pb-label" htmlFor="admin-inbox-filter" style={{ margin: 0 }}>Show</label>
          <select id="admin-inbox-filter" className="pb-input" style={{ width: 'auto', minWidth: 190 }} value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            <option value="all">Everything ({items.length})</option>
            <option value="report">Reports ({items.filter((item) => item.kind === 'report').length})</option>
            <option value="message">Messages ({items.filter((item) => item.kind === 'message').length})</option>
            <option value="feedback">Feedback ({items.filter((item) => item.kind === 'feedback').length})</option>
          </select>
        </div>
      </header>

      {warnings.map((warning) => <p key={warning} className="pb-well" role="status" style={{ padding: 12, margin: 0 }}>{warning}</p>)}
      {error && <p className="pb-alert" role="alert" style={{ padding: 12, margin: 0 }}>{error}</p>}
      {loading && items.length === 0 && <div className="pb-panel" style={{ padding: 20 }} role="status">Opening the private inbox…</div>}
      {!loading && !error && visible.length === 0 && (
        <div className="pb-panel" style={{ padding: 24 }}>
          <p className="pb-muted" style={{ margin: 0 }}>{items.length ? 'Nothing matches this filter.' : 'No database messages are available yet.'}</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {visible.map((item) => {
          const key = `${item.source}:${item.id}`;
          const draft = draftFor(item);
          const link = pageLink(item.pageUrl);
          const email = safeEmail(item.contactEmail);
          const busy = savingKey === key;
          return (
            <article key={key} className="pb-panel" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="pb-chip">{item.kind === 'report' ? 'Report' : item.kind === 'message' ? 'Message' : 'Feedback'}</span>
                <span className="pb-chip">{statusName(item.status)}</span>
                {item.category && <span className="pb-muted" style={{ fontSize: '.78rem' }}>{item.category}</span>}
                <span className="pb-muted" style={{ marginLeft: 'auto', fontSize: '.75rem' }}>{dateLabel(item.createdAt)}</span>
              </div>
              <h3 style={{ fontSize: '1rem', margin: '10px 0 8px' }}>
                {item.subject || (item.kind === 'report' ? 'A report needs review' : item.kind === 'message' ? 'Private message' : 'Site feedback')}
                {item.rating !== null && <span className="pb-muted" style={{ fontWeight: 400, fontSize: '.8rem' }}> · {item.rating}/5 stars</span>}
              </h3>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.7, margin: '0 0 12px' }}>{item.message}</p>
              <div className="pb-muted" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.74rem', marginBottom: 12 }}>
                {item.uid && <span>Account: <span className="pb-mono">{item.uid}</span></span>}
                {link && <a href={link} target={link.startsWith('http') ? '_blank' : undefined} rel={link.startsWith('http') ? 'noopener noreferrer' : undefined}>
                  <ExternalLink size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Page context
                </a>}
                {email && <a href={`mailto:${email}`}>Reply to {email}</a>}
              </div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', alignItems: 'end' }}>
                <div>
                  <label className="pb-label" htmlFor={`inbox-status-${key}`}>Status</label>
                  <select
                    id={`inbox-status-${key}`}
                    className="pb-input"
                    value={draft.status}
                    onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draftFor(item), status: event.target.value as InboxStatus } }))}
                  >
                    {STATUS.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 180 }}>
                  <label className="pb-label" htmlFor={`inbox-note-${key}`}>Private admin note</label>
                  <input
                    id={`inbox-note-${key}`}
                    className="pb-input"
                    maxLength={1000}
                    value={draft.adminNote}
                    onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draftFor(item), adminNote: event.target.value } }))}
                    placeholder="Optional, visible to admins only"
                  />
                </div>
                <button type="button" className="pb-btn pb-btn-sm" disabled={busy} onClick={() => void save(item)}>
                  {busy ? <RefreshCw size={13} /> : <Save size={13} />} {busy ? 'Saving…' : 'Save review'}
                </button>
              </div>
              {item.adminNote && <p className="pb-muted" style={{ fontSize: '.76rem', margin: '10px 0 0' }}><Check size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Existing admin note: {item.adminNote}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
