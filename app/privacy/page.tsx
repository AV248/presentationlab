import { routeMetadata } from '@/lib/routeMeta';

export const metadata = routeMetadata('/privacy');

export default function Page() {
  return (
    <article className="pb-page pb-narrow pb-legal">
      <header className="pb-page-head">
        <span className="pb-eyebrow">A human-sized privacy note</span>
        <h1 className="pb-page-title">Privacy</h1>
        <p className="pb-page-sub">Last updated October 2026</p>
      </header>
      <section className="pb-panel" style={{ padding: 'clamp(20px, 4vw, 30px)' }}>
        <h2>What the app keeps</h2>
        <p>Drafts are local-first and stay on your device until you deliberately choose to share them. A public presentation and profile details you choose to publish are visible to visitors and search engines.</p>
        <h2>Account and public profile</h2>
        <p>Clerk handles sign-in identity. Presentation Buddy stores profile, username, badge and social information with its application data providers. We do not display your sign-in email on your public profile. Do not put private or sensitive information into a public presentation, bio or comment.</p>
        <h2>Service data</h2>
        <p>Like most hosted services, the app's infrastructure may process basic technical information needed to serve pages, protect the service and diagnose errors. We do not sell personal information. Browser storage may be used for local drafts, preferences and offline support.</p>
        <h2>Public-domain archives</h2>
        <p>Some rehearsal texts are retrieved from public archives. Archive texts remain attributed to their source and are subject to the licence or terms shown with that source.</p>
        <h2>Your choices</h2>
        <p>You can edit profile details in <a href="/settings">profile settings</a>. To ask about access, correction or removal, contact <a href="mailto:amaavrit@yahoo.com">amaavrit@yahoo.com</a>.</p>
        <h2>Children and changes</h2>
        <p>Presentation Buddy is a general-purpose speaking tool, not designed to collect information from children. This notice may change as the service changes; the date above indicates the latest revision.</p>
      </section>
    </article>
  );
}
