import { Link } from 'react-router-dom';
import {
  BookOpenText,
  Clapperboard,
  Download,
  Feather,
  Globe,
  Keyboard,
  Library,
  Lock,
  PenLine,
  Trophy,
} from 'lucide-react';
import { AXES, COMBINATIONS } from '../design/index';
import { detectPlatform, installInstructions, isStandalone, modifierLabel } from '../lib/platform';
import { useSpeeches } from '../hooks/useCollection';
import { useAuth } from '../store/auth';
import { COLOPHON } from '../lib/heart';

const STEPS = [
  {
    icon: Library,
    title: 'Read what has already been said',
    body: 'A starter library of speeches and structures written for this app, plus public-domain speeches fetched live from Wikisource — and, first in line, whatever people have published themselves.',
  },
  {
    icon: PenLine,
    title: 'Write with someone looking over your shoulder',
    body: 'The studio watches your hook, your evidence, your landing, your filler words, your longest sentences and your readability while you type.',
  },
  {
    icon: Clapperboard,
    title: 'Say it out loud, before it counts',
    body: 'Set a pace, breathe first, run the teleprompter, and let the over/under clock tell you the truth about your timing.',
  },
  {
    icon: Feather,
    title: 'Keep what moved you',
    body: 'Save the line that stopped you, argue with a page in the margin, write yourself a letter for the morning of the real thing.',
  },
];

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl+K', 'Command palette'],
  ['/', 'Search the library'],
  ['T', 'Theme studio'],
  ['?', 'Shortcut help'],
  ['G', 'Jump to a page by number'],
  ['Space', 'Play / pause rehearsal'],
  ['↑ / ↓', 'Adjust rehearsal pace'],
  ['R', 'Restart rehearsal'],
  ['F', 'Fullscreen during practice'],
  ['Esc', 'Close panels and overlays'],
];

export function AboutPage() {
  const items = useSpeeches();
  const user = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const platform = detectPlatform();
  const install = installInstructions();
  const standalone = isStandalone();
  const mod = modifierLabel();

  const yours = items.filter((item) => item.source === 'user').length;
  const shared = items.filter((item) => item.source === 'cloud').length;
  const web = items.filter((item) => item.source === 'web').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 34px)' }}>
        <span className="pb-eyebrow">About</span>
        <h1 style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.5rem)', margin: '10px 0 14px' }}>
          A quiet workspace for people who have to speak
        </h1>
        <p className="pb-soft" style={{ fontSize: '1.02rem', maxInlineSize: '62ch', lineHeight: 1.75 }}>
          Most speaking advice is either a list of tips or a template nobody finishes. This is the
          middle thing: real speeches to learn from, a studio that reads your draft back to you, and a
          rehearsal room that keeps your pace honest — with every number on screen belonging to a
          real speech, a real reader or a real author.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginTop: 22,
          }}
        >
          <Fact label="Speeches here now" value={String(items.length)} />
          <Fact label="Yours" value={String(yours)} />
          <Fact label="Shared by people" value={String(shared)} />
          <Fact label="From the web" value={String(web)} />
          <Fact label="Theme options" value={String(AXES.reduce((sum, axis) => sum + axis.options.length, 0))} />
          <Fact label="Combinations" value={COMBINATIONS.toLocaleString()} />
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
          gap: 12,
        }}
      >
        {STEPS.map((step, index) => (
          <div key={step.title} className="pb-panel anim-enter" style={{ padding: '18px 20px', ['--i' as string]: index }}>
            <step.icon size={20} style={{ color: 'var(--c-accent)', marginBottom: 10 }} />
            <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>{step.title}</h3>
            <p className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.7 }}>{step.body}</p>
          </div>
        ))}
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
          gap: 12,
        }}
      >
        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Lock size={17} /> Privacy, plainly
          </h2>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Your drafts, notes, bookmarks and reading positions live in this browser. They are not uploaded.',
              'No analytics, no advertising scripts, no cookie banner.',
              'Sign-in is handled by Google or Microsoft. We store your name, e-mail and picture so your words can be attributed to you — never a password.',
              'Firestore holds only what you publish, plus anonymous counters for views, likes, dislikes and shares.',
              'Export everything, or wipe the device, from the Control Room.',
            ].map((line) => (
              <li key={line} className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.65 }}>
                • {line}
              </li>
            ))}
          </ul>
          <p className="pb-muted" style={{ fontSize: '0.78rem', marginTop: 12 }}>
            {user
              ? `Signed in as ${user.displayName ?? user.email}${role ? ` (${role})` : ''}.`
              : 'You are browsing without an account, which is fine — reading is free.'}
          </p>
        </section>

        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Download size={17} /> {install.title}
          </h2>
          <p className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.7, marginBottom: 12 }}>
            {install.steps}
          </p>
          <p className="pb-muted" style={{ fontSize: '0.78rem', lineHeight: 1.7 }}>
            Detected platform: <strong>{platform}</strong>
            {standalone ? ' · already running as an installed app' : ''}. Installed, it opens
            instantly, works offline and remembers your theme.
          </p>
        </section>
      </div>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Keyboard size={17} /> Keyboard shortcuts
        </h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {SHORTCUTS.map(([keys, description]) => (
            <div
              key={keys}
              style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '1px solid var(--c-line-soft)' }}
            >
              <span className="pb-kbd" style={{ minWidth: 92, justifyContent: 'center' }}>
                {keys.replace('⌘', mod)}
              </span>
              <span className="pb-soft" style={{ fontSize: '0.86rem' }}>{description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Trophy size={17} /> Where everything comes from
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            {
              icon: PenLine,
              text: 'Speeches published by signed-in people. These sit first on the Latest shelf, always.',
            },
            {
              icon: Globe,
              text: 'Public-domain speeches fetched from Wikisource, each with its licence and a link to the original page.',
            },
            {
              icon: Library,
              text: 'The starter library: speeches and structures written for Presentation Buddy, here so the app is useful the moment it opens.',
            },
          ].map((row) => (
            <p key={row.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <row.icon size={16} style={{ color: 'var(--c-accent)', flex: '0 0 auto', marginTop: 2 }} />
              <span className="pb-soft" style={{ fontSize: '0.88rem', lineHeight: 1.7 }}>{row.text}</span>
            </p>
          ))}
        </div>

        <div className="pb-rule" style={{ marginTop: 22 }}>
          <span>Colophon</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
          <p className="pb-muted" style={{ fontSize: '0.82rem', lineHeight: 1.7 }}>{COLOPHON.type}</p>
          <p className="pb-muted" style={{ fontSize: '0.82rem', lineHeight: 1.7 }}>{COLOPHON.made}</p>
          <p className="pb-muted" style={{ fontSize: '0.82rem', lineHeight: 1.7 }}>{COLOPHON.promise}</p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <Link to="/studio" className="pb-btn pb-btn-primary">
            <PenLine size={16} /> Start writing
          </Link>
          <Link to="/themes" className="pb-btn">
            <BookOpenText size={16} /> Change the look
          </Link>
          <Link to="/control" className="pb-btn pb-btn-ghost">
            Control room
          </Link>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="pb-well" style={{ padding: '12px 14px' }}>
      <div style={{ fontFamily: 'var(--x-font-display)', fontWeight: 700, fontSize: '1.2rem' }}>{value}</div>
      <div className="pb-muted" style={{ fontSize: '0.7rem' }}>{label}</div>
    </div>
  );
}
