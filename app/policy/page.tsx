import { routeMetadata } from '@/lib/routeMeta';

export const metadata = routeMetadata('/policy');

export default function Page() {
  return (
    <article className="pb-page pb-narrow pb-legal">
      <header className="pb-page-head">
        <span className="pb-eyebrow">Care for the room</span>
        <h1 className="pb-page-title">Community policy</h1>
        <p className="pb-page-sub">A public speaking library works only when people can trust the room.</p>
      </header>
      <section className="pb-panel" style={{ padding: 'clamp(20px, 4vw, 30px)' }}>
        <h2>Be a person, not a target</h2>
        <p>No harassment, threats, hate, doxxing, impersonation or repeated unwanted contact. Critique ideas without making somebody's identity the subject.</p>
        <h2>Share work you may share</h2>
        <p>Only publish material you wrote or have permission to publish. Cite sources, keep archive attribution intact, and do not use the public library to distribute private information, spam or unlawful material.</p>
        <h2>Keep provenance honest</h2>
        <p>Official and vetted-source badges are awarded by the service, not self-assigned. Do not misrepresent authorship, credentials, endorsements or an archive's licence.</p>
        <h2>Moderation</h2>
        <p>Content may be hidden or removed when it violates this policy or creates a safety or legal risk. Repeated or serious abuse may lead to account restrictions. If you see a problem, use <a href="/report">Report</a>; use <a href="/feedback">Feedback</a> for product suggestions.</p>
        <p>For urgent policy questions, contact <a href="mailto:amaavrit@yahoo.com">amaavrit@yahoo.com</a>.</p>
      </section>
    </article>
  );
}
