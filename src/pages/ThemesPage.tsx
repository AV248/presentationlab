import {
  Accessibility,
  Laptop,
  MonitorSmartphone,
  Smartphone,
  Sparkles,
  Tablet,
} from 'lucide-react';
import { ThemeStudio } from '../components/ThemeStudio';
import { AXES, COMBINATIONS } from '../design/index';
import { detectPlatform } from '../lib/platform';
import { pageMetaFor } from '../data/routes';
import { SITE_URL, usePageMeta } from '../lib/seo';

const DEVICE_NOTES = [
  {
    icon: Smartphone,
    title: 'Phones (iOS & Android)',
    points: [
      'Bottom tab bar with 44px+ touch targets and safe-area padding for notches and home bars.',
      'Horizontal snap carousels, sheet-style panels and no hover-only interactions.',
      'Installable as a full-screen app with offline support via the service worker.',
    ],
  },
  {
    icon: Tablet,
    title: 'Tablets (iPad, Android, Surface)',
    points: [
      'The rail collapses into a swipe-in drawer so the reading column keeps full width.',
      'Two-pane studio and reader layouts reflow to stacked at portrait widths.',
      'Split view, external keyboards and pencil input all behave natively.',
    ],
  },
  {
    icon: Laptop,
    title: 'Laptops (macOS & Windows)',
    points: [
      'Full keyboard shortcut set: ⌘K / Ctrl+K palette, T for themes, ? for help.',
      'Hover states, cursor-reactive card highlights and precise pointer targets.',
      'Platform-native font stacks — SF Pro on macOS, Segoe UI on Windows.',
    ],
  },
  {
    icon: MonitorSmartphone,
    title: 'Large screens & TV',
    points: [
      'Type and spacing scale up automatically above 1800px.',
      'Stage-display typography theme for reading from the back of a room.',
      'High-contrast and reduced-motion themes for bright rooms and shared displays.',
    ],
  },
];

export function ThemesPage() {
  const meta = pageMetaFor('/themes');
  usePageMeta(meta?.title ?? 'Themes', {
    description: meta?.description,
    image: meta?.card ? `${SITE_URL}/cards/${meta.card}.png` : undefined,
    jsonLd: meta?.jsonLd,
  });

  const platform = detectPlatform();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding: 'clamp(20px, 3vw, 32px)' }}>
        <span className="pb-eyebrow">Theme studio</span>
        <h1 style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.3rem)', margin: '10px 0 10px' }}>
          {COMBINATIONS.toLocaleString()} ways to make it yours
        </h1>
        <p className="pb-soft" style={{ maxInlineSize: '58ch' }}>
          Five axes that mix freely — pick a palette, a motion personality, a layout, an interface
          material and a typography system. Everything changes instantly and is remembered on this
          device.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {AXES.map((axis) => (
            <span key={axis.id} className="pb-chip pb-chip-accent">
              {axis.options.length} {axis.label}
            </span>
          ))}
        </div>
      </section>

      <ThemeStudio variant="page" />

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Sparkles size={17} /> Tuned for every screen
        </h2>
        <p className="pb-muted" style={{ fontSize: '0.84rem', marginBottom: 16 }}>
          You are browsing on <strong>{platform}</strong>. Presentation Buddy adapts layout, hit
          targets, typography scale and input handling to the device it finds itself on.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
            gap: 12,
          }}
        >
          {DEVICE_NOTES.map((note) => (
            <div key={note.title} className="pb-well" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <note.icon size={17} style={{ color: 'var(--c-accent)' }} />
                <strong style={{ fontSize: '0.9rem' }}>{note.title}</strong>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {note.points.map((point) => (
                  <li key={point} className="pb-muted" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
                    • {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Accessibility size={17} /> Accessibility is a theme, not an afterthought
        </h2>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            'Pick the “Still” motion theme, or let the app follow your device’s reduced-motion setting.',
            'Paperwhite and Maximum Contrast colour themes clear WCAG AA contrast on every surface.',
            'Dyslexia Friendly, Large Print and Low Stimulation typography themes change spacing, weight and measure — not just size.',
            'A contrast booster in the Control Room strengthens borders and text hierarchy app-wide.',
            'Everything is keyboard reachable, with visible focus rings sized by the active typography theme.',
          ].map((line) => (
            <li key={line} className="pb-soft" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
              ✓ {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
