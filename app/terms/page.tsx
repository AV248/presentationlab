import { routeMetadata } from '@/lib/routeMeta';

export const metadata = routeMetadata('/terms');

export default function Page() {
  return (
    <article className="pb-page pb-narrow pb-legal">
      <header className="pb-page-head">
        <span className="pb-eyebrow">Plain language, not fine-print theatre</span>
        <h1 className="pb-page-title">Terms of use</h1>
        <p className="pb-page-sub">Last updated October 2026</p>
      </header>
      <section className="pb-panel" style={{ padding: 'clamp(20px, 4vw, 30px)' }}>
        <h2>Using the service</h2>
        <p>Presentation Buddy provides tools for writing and rehearsing speeches and a library of public material. Use it lawfully, respect other people, and keep your account credentials secure. You are responsible for the material you deliberately publish.</p>
        <h2>Your work</h2>
        <p>You retain rights in the work you create. A draft remains private and local-first until you deliberately share it. When you publish, you grant Presentation Buddy permission to host, display and index that presentation so the public page can work. You must have the rights needed to make that grant.</p>
        <h2>Reading and copying</h2>
        <p>We provide no controls to copy, remix, or download public presentations. Your device export is limited to writing you created; it excludes other people's public work and archive texts. Public speech text must still be delivered to your browser to be read, so browser-delivered text cannot be made impossible to copy. Please respect each writer's rights and the archive licence shown with sourced work.</p>
        <h2>Archive works</h2>
        <p>Archive texts are provided for rehearsal with attribution and the source licence where available. Their rights status and terms come from the linked archive, not from this service.</p>
        <h2>Availability and moderation</h2>
        <p>The service is provided as-is and may change or be unavailable. We may restrict or remove material that violates the <a href="/policy">community policy</a>, law, or service safety. We do not promise that public pages will remain available forever.</p>
        <h2>Contact</h2>
        <p>Questions about these terms: <a href="mailto:amaavrit@yahoo.com">amaavrit@yahoo.com</a>.</p>
      </section>
    </article>
  );
}
