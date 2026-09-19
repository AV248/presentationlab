import { Link } from 'react-router-dom';
import {
  BookOpenText,
  Clapperboard,
  Download,
  Keyboard,
  Library,
  Lock,
  Palette,
  PenLine,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { NAV } from '../components/AppShell';
import { AXES, COMBINATIONS } from '../design/index';
import { detectPlatform, installInstructions, isStandalone, modifierLabel } from '../lib/platform';
import { useSpeeches } from '../hooks/useCollection';

const STEPS = [
  {
    icon: Library,
    title: 'Read the room',
    body: 'Browse a library of original speeches and fill-in structures by occasion — commencement, pitch, toast, eulogy, rally, launch and more.',
  },
  {
    icon: PenLine,
    title: 'Write with a coach',
    body: 'Draft in the studio while it watches your hook, evidence, landing, filler words, sentence length and readability in real time.',
  },
  {
    icon: Clapperboard,
    title: 'Rehearse out loud',
    body: 'Open the teleprompter, set your words-per-minute, and let the pacing timer tell you honestly whether you are over or under.',
  },
  {
    icon: Sparkles,
    title: 'Make it yours',
    body: 'Choose from five independent theme axes and thousands of combinations, then save your favourite as a named preset.',
  },
];

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl+K', 'Command palette — search and jump anywhere'],
  ['/', 'Focus search'],
  ['T', 'Open the theme studio'],
  ['?', 'Shortcut help'],
  ['G', 'Jump to a page by number'],
  ['Space', 'Play / pause the teleprompter'],
  ['↑ / ↓', 'Adjust rehearsal pace'],
  ['R', 'Restart a rehearsal'],
  ['F', 'Fullscreen during practice'],
  ['Esc', 'Close panels and overlays'],
];

export function AboutPage() {
  const items = useSpeeches();
  const platform = detectPlatform();
  const install = installInstructions();
  const standalone = isStandalone();
  const mod = modifierLabel();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 34px)' }}>
        <span className="pb-eyebrow">About</span>
        <h1 style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.5rem)', margin: '10px 0 14px' }}>
          A quiet workspace for people who have to speak
        </h1>
        <p className="pb-soft" style={{ fontSize: '1.02rem', maxInlineSize: '62ch', lineHeight: 1.7 }}>
          Presentation Buddy exists because most speaking advice is either a list of tips or a
          template nobody finishes. This is the middle thing: a library of real speeches to learn
          from, a studio that reads your draft back to you, and a rehearsal room that keeps your
          pace honest.
        </p>
        <p className="pb-muted" style={{ maxInlineSize: '62ch', marginTop: 12, lineHeight: 1.7 }}>
          It runs entirely in your browser. No account, no tracking, no upload — and it works on a
          plane.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <Link to="/studio" className="pb-btn pb-btn-primary pb-btn-lg">
            <PenLine size={18} /> Start writing
          </Link>
          <Link to="/themes" className="pb-btn pb-btn-lg">
            <Palette size={18} /> Explore themes
          </Link>
          <Link to="/" className="pb-btn pb-btn-lg pb-btn-ghost">
            <BookOpenText size={18} /> Read the library ({items.length})
          </Link>
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
            <p className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.65 }}>{step.body}</p>
          </div>
        ))}
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Keyboard size={17} /> Keyboard shortcuts
        </h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {SHORTCUTS.map(([keys, description]) => (
            <div
              key={keys}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                paddingBottom: 8,
                borderBottom: '1px solid var(--c-line-soft)',
              }}
            >
              <span className="pb-kbd" style={{ minWidth: 92, justifyContent: 'center' }}>
                {keys.replace('⌘', mod)}
              </span>
              <span className="pb-soft" style={{ fontSize: '0.86rem' }}>{description}</span>
            </div>
          ))}
        </div>
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
              'Your drafts, likes, bookmarks and reading progress are stored in this browser only.',
              'There is no analytics, no cookie banner and no third-party script.',
              'Cloud sync is opt-in and off unless you configure Firebase yourself.',
              'Export or delete everything from the Control Room at any time.',
            ].map((line) => (
              <li key={line} className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.6 }}>
                • {line}
              </li>
            ))}
          </ul>
        </section>

        <section className="pb-panel" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Download size={17} /> {install.title}
          </h2>
          <p className="pb-muted" style={{ fontSize: '0.84rem', lineHeight: 1.65, marginBottom: 12 }}>
            {install.steps}
          </p>
          <p className="pb-muted" style={{ fontSize: '0.78rem' }}>
            Detected platform: <strong>{platform}</strong>
            {standalone ? ' · already running as an installed app' : ''}. Installed, it opens
            instantly, works offline and keeps your theme.
          </p>
        </section>
      </div>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Trophy size={17} /> What’s inside
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Fact label="Original speeches" value={String(items.length)} />
          <Fact label="Theme options" value={String(AXES.reduce((sum, axis) => sum + axis.options.length, 0))} />
          <Fact label="Combinations" value={COMBINATIONS.toLocaleString()} />
          <Fact label="Pages" value={String(NAV.length)} />
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="pb-well" style={{ padding: '12px 14px' }}>
      <div style={{ fontFamily: 'var(--x-font-display)', fontWeight: 700, fontSize: '1.15rem' }}>{value}</div>
      <div className="pb-muted" style={{ fontSize: '0.72rem' }}>{label}</div>
    </div>
  );
}
