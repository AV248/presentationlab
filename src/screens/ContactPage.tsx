'use client';

import { useState, type FormEvent } from 'react';
import { Mail, MessageSquareText, ShieldAlert } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { clerkSessionToken } from '../services/clerk';

const CONTACT = 'amaavrit@yahoo.com';

type ContactKind = 'feedback' | 'report' | 'message';

export function ContactPage({ kind }: { kind: ContactKind }) {
  const isReport = kind === 'report';
  const isMessage = kind === 'message';
  const user = useAuth((state) => state.user);
  const isLoaded = useAuth((state) => state.ready);
  const isSignedIn = Boolean(user);
  const openSignIn = useUi((state) => state.openSignIn);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState(isReport ? 'Content or safety' : isMessage ? 'General message' : 'Product suggestion');
  const [page, setPage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim() || !isSignedIn || sending) return;
    setSending(true);
    setError('');
    setSaved(false);
    try {
      const token = await clerkSessionToken();
      if (!token) throw new Error('Your sign-in session could not be read. Sign in again and retry.');
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kind,
          category,
          subject: subject.trim(),
          message: message.trim(),
          pageUrl: page.trim(),
          contactEmail: contactEmail.trim(),
        }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Your note could not be saved. Please try again.');
      setSaved(true);
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your note could not be saved. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pb-page pb-narrow pb-contact-page">
      <header className="pb-page-head">
        <span className="pb-eyebrow">{isReport ? <ShieldAlert size={13} /> : <MessageSquareText size={13} />} {isReport ? 'Report a problem' : isMessage ? 'Send a message' : 'Feedback'}</span>
        <h1 className="pb-page-title">{isReport ? 'Tell us what needs attention' : isMessage ? 'Leave a private note' : 'Help the room get better'}</h1>
        <p className="pb-page-sub">
          {isReport
            ? 'Flag a public presentation, community post, safety concern or broken page. The report is delivered to the private admin inbox.'
            : isMessage
              ? 'A private message to the maintainers. It will be visible only to authorized admins.'
              : 'A thoughtful note is more useful than a star rating. Your feedback is saved to the private admin inbox.'}
        </p>
      </header>

      {!isLoaded ? <div className="pb-panel" style={{ padding: 20 }} role="status">Checking your session…</div>
        : !isSignedIn ? <div className="pb-panel" style={{ padding: 20 }}>
          <p className="pb-muted" style={{ lineHeight: 1.7, margin: '0 0 12px' }}>Please sign in to send a private {isReport ? 'report' : isMessage ? 'message' : 'feedback'} to the admin inbox.</p>
          <button type="button" className="pb-btn pb-btn-primary" onClick={() => openSignIn(`Sign in to send a private ${isReport ? 'report' : isMessage ? 'message' : 'feedback'}.`)}>Sign in</button>
        </div>
        : <form className="pb-panel pb-contact-form" onSubmit={submit} style={{ display: 'grid', gap: 14, padding: 'clamp(18px, 4vw, 26px)' }}>
          <div>
            <label className="pb-label" htmlFor="contact-kind">{isReport ? 'What is this about?' : isMessage ? 'Topic' : 'Feedback topic'}</label>
            <select id="contact-kind" className="pb-input" value={category} onChange={(event) => setCategory(event.target.value)}>
              {(isReport
                ? ['Content or safety', 'Copyright or attribution', 'Privacy', 'Accessibility', 'Technical problem', 'Other']
                : isMessage
                  ? ['General message', 'Account', 'Partnership', 'Other']
                  : ['Product suggestion', 'Something worked well', 'Accessibility', 'Technical problem', 'Other']
              ).map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>
          {isMessage && <div>
            <label className="pb-label" htmlFor="contact-subject">Subject <span className="pb-muted">(optional)</span></label>
            <input id="contact-subject" className="pb-input" maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>}
          <div>
            <label className="pb-label" htmlFor="contact-page">Page or speech URL <span className="pb-muted">(optional)</span></label>
            <input id="contact-page" className="pb-input" type="url" maxLength={1000} value={page} onChange={(event) => setPage(event.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="pb-label" htmlFor="contact-message">{isReport ? 'What happened?' : isMessage ? 'Your message' : 'Your note'}</label>
            <textarea id="contact-message" className="pb-textarea" rows={7} maxLength={5000} required value={message} onChange={(event) => setMessage(event.target.value)} placeholder={isReport ? 'Describe the issue and what a moderator should look at…' : 'A sentence or two is enough. Specific details help.'} />
            <span className="pb-muted" style={{ fontSize: '0.72rem' }}>{message.length}/5000</span>
          </div>
          <div>
            <label className="pb-label" htmlFor="contact-email">Reply-to email <span className="pb-muted">(optional)</span></label>
            <input id="contact-email" className="pb-input" type="email" maxLength={254} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="you@example.com" />
          </div>
          <div className="pb-contact-actions">
            <button className="pb-btn pb-btn-primary" type="submit" disabled={!message.trim() || sending}>
              <Mail size={15} /> {sending ? 'Saving securely…' : 'Send to admin inbox'}
            </button>
            <a className="pb-btn pb-btn-ghost" href={`mailto:${CONTACT}`}>Email directly</a>
          </div>
          <p className="pb-muted" style={{ fontSize: '0.77rem', lineHeight: 1.65, margin: 0 }}>
            Your note is stored with restricted access. Public profile data is not included; the reply-to email is optional.
          </p>
          {error && <p className="pb-alert" role="alert">{error}</p>}
          {saved && <p className="pb-well" role="status">Saved. Thank you — the admin inbox has it.</p>}
        </form>}
    </div>
  );
}
