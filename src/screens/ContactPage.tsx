'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Mail, MessageSquareText, ShieldAlert } from 'lucide-react';

const CONTACT = 'amaavrit@yahoo.com';

type ContactKind = 'feedback' | 'report';

export function ContactPage({ kind }: { kind: ContactKind }) {
  const isReport = kind === 'report';
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState(isReport ? 'Content or safety' : 'Product suggestion');
  const [page, setPage] = useState('');
  const [opened, setOpened] = useState(false);

  const subject = isReport ? `Presentation Buddy report — ${category}` : `Presentation Buddy feedback — ${category}`;
  const body = useMemo(() => [
    `Type: ${category}`,
    page.trim() ? `Page or speech URL: ${page.trim()}` : '',
    '',
    'Message:',
    message.trim(),
  ].filter((line, index, all) => line || (index > 0 && all[index - 1] !== '')).join('\n'), [category, page, message]);
  const href = `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) return;
    setOpened(true);
    window.location.href = href;
  };

  return (
    <div className="pb-page pb-narrow pb-contact-page">
      <header className="pb-page-head">
        <span className="pb-eyebrow">{isReport ? <ShieldAlert size={13} /> : <MessageSquareText size={13} />} {isReport ? 'Report a problem' : 'Feedback'}</span>
        <h1 className="pb-page-title">{isReport ? 'Tell us what needs attention' : 'Help the room get better'}</h1>
        <p className="pb-page-sub">
          {isReport
            ? 'Flag a public presentation, community post, safety concern or broken page. Reports go directly to the maintainer.'
            : 'A thoughtful note is more useful than a star rating. Tell us what worked, what did not, or what the next useful thing should be.'}
        </p>
      </header>

      <form className="pb-panel pb-contact-form" onSubmit={submit} style={{ display: 'grid', gap: 14, padding: 'clamp(18px, 4vw, 26px)' }}>
        <div>
          <label className="pb-label" htmlFor="contact-kind">{isReport ? 'What is this about?' : 'Feedback topic'}</label>
          <select id="contact-kind" className="pb-input" value={category} onChange={(event) => setCategory(event.target.value)}>
            {(isReport
              ? ['Content or safety', 'Copyright or attribution', 'Privacy', 'Accessibility', 'Technical problem', 'Other']
              : ['Product suggestion', 'Something worked well', 'Accessibility', 'Technical problem', 'Other']
            ).map((option) => <option key={option}>{option}</option>)}
          </select>
        </div>
        <div>
          <label className="pb-label" htmlFor="contact-page">Page or speech URL <span className="pb-muted">(optional)</span></label>
          <input id="contact-page" className="pb-input" type="url" maxLength={500} value={page} onChange={(event) => setPage(event.target.value)} placeholder="https://dedyn.io/read/…" />
        </div>
        <div>
          <label className="pb-label" htmlFor="contact-message">{isReport ? 'What happened?' : 'Your note'}</label>
          <textarea id="contact-message" className="pb-textarea" rows={7} maxLength={5000} required value={message} onChange={(event) => setMessage(event.target.value)} placeholder={isReport ? 'Describe the issue and what a moderator should look at…' : 'A sentence or two is enough. Specific details help.'} />
          <span className="pb-muted" style={{ fontSize: '0.72rem' }}>{message.length}/5000</span>
        </div>
        <div className="pb-contact-actions">
          <button className="pb-btn pb-btn-primary" type="submit" disabled={!message.trim()}>
            <Mail size={15} /> {opened ? 'Open your email app again' : 'Continue by email'}
          </button>
          <a className="pb-btn pb-btn-ghost" href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </div>
        <p className="pb-muted" style={{ fontSize: '0.77rem', lineHeight: 1.65, margin: 0 }}>
          This opens your email app with the note filled in. Nothing is sent until you review it and press Send. Presentation Buddy does not send it to another contact service.
        </p>
      </form>
      {opened && <p className="pb-well" role="status" style={{ padding: 14, marginTop: 12 }}>If no email app opened, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> directly.</p>}
    </div>
  );
}
