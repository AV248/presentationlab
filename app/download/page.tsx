import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { routeMetadata } from '@/lib/routeMeta';

export const metadata = routeMetadata('/download');

interface ReleaseTarget {
  label: string;
  description: string;
  matches: (filename: string) => boolean;
}

const TARGETS: ReleaseTarget[] = [
  {
    label: 'Windows',
    description: 'A signed installer or standalone Windows application.',
    matches: (name) => /^presentation[-_ ]?buddy(?:[-_ ].*)?\.(?:exe|msi)$/i.test(name),
  },
  {
    label: 'Android',
    description: 'An installable Android package, when a release is ready.',
    matches: (name) => /^presentation[-_ ]?buddy(?:[-_ ].*)?\.(?:apk|aab)$/i.test(name),
  },
  {
    label: 'Proll',
    description: 'A Proll build, if its named release binary is present.',
    matches: (name) => /^proll(?:[-_ ].*)?\.(?:exe|msi|apk|aab|zip)$/i.test(name),
  },
];

function publicFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const entries: string[] = [];
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name);
    try {
      if (statSync(absolute).isDirectory()) entries.push(...publicFiles(absolute));
      else if (statSync(absolute).isFile()) entries.push(absolute);
    } catch {
      // A disappearing or unreadable release is never advertised.
    }
  }
  return entries;
}

function releaseFor(target: ReleaseTarget): string | null {
  const root = path.join(process.cwd(), 'public');
  const match = publicFiles(root).find((file) => target.matches(path.basename(file)));
  return match ? `/${path.relative(root, match).split(path.sep).map(encodeURIComponent).join('/')}` : null;
}

export default function Page() {
  const releases = TARGETS.map((target) => ({ ...target, href: releaseFor(target) }));
  return (
    <div className="pb-page pb-download-page">
      <header className="pb-panel" style={{ padding: 'clamp(22px, 4vw, 38px)' }}>
        <span className="pb-eyebrow">Downloads · Release files only</span>
        <h1 className="pb-page-title" style={{ marginTop: 8 }}>Get Presentation Buddy</h1>
        <p className="pb-page-sub" style={{ maxWidth: '68ch' }}>
          Official installers appear here only when their actual release files are included with the site. No mystery mirrors, and no button that leads to an empty folder.
        </p>
      </header>
      <section aria-label="Available downloads" className="pb-download-grid">
        {releases.map((release) => (
          <article key={release.label} className="pb-panel pb-download-card" style={{ padding: '18px 20px' }}>
            <h2 style={{ fontSize: '1.08rem' }}>{release.label}</h2>
            <p className="pb-muted" style={{ fontSize: '0.86rem', lineHeight: 1.65 }}>{release.description}</p>
            {release.href
              ? <a className="pb-btn pb-btn-primary" href={release.href} download>Download for {release.label}</a>
              : <span className="pb-chip" aria-label={`${release.label} download: Coming Soon`}>Coming Soon</span>}
          </article>
        ))}
      </section>
      <aside className="pb-well" style={{ padding: 16 }}>
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          The web app already installs through your browser on supported desktop and mobile devices. For a release question, write to <a href="mailto:amaavrit@yahoo.com">amaavrit@yahoo.com</a>.
        </p>
      </aside>
    </div>
  );
}
