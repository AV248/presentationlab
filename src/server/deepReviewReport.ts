/**
 * Internal code-review record. It is served only by /api/admin/report after
 * Clerk session verification and a live Supabase role check; never import this
 * module into a client component or a public page.
 */
export const DEEP_REVIEW_REPORT = {
  title: 'Presentation Buddy — Deep Website Review',
  reviewDate: '2026-10-13',
  productVersion: '3.1',
  classification: 'Private · administrator access only',
  executiveSummary: 'The review found a high-impact mismatch between the canonical Turso presentation IDs and reaction/share functions that still targeted Supabase’s legacy speeches table. The same audit found avoidable work in public handle routes, a report form that only opened an email draft, no database-backed admin inbox, a first-visit splash animation, and public community labels that could fall back to account email. This branch moves reactions, shares, public contributor metrics, and contact submissions onto paths aligned with the current architecture; adds an admin-only inbox and report endpoint; removes the splash; and prevents public community names from exposing email addresses. Local typecheck, regression checks, production build, and route checks now pass. No production database change, deployment, or live-site retest was performed.',
  scope: [
    'App Router public profile and content routes, metadata, structured data, and the /api/library request path.',
    'Turso canonical presentation reads, write transactions, reactions, shares, counters, and profile-card payloads.',
    'Clerk request verification, Supabase public profile reads, administrator-role checks, and row-level security boundaries.',
    'Feedback/report/message flows, database schema, admin-panel navigation and inbox experience.',
    'Community contributor aggregation, app shell, PWA behavior, route inventory, and logo/splash motion.',
  ],
  architecture: [
    { system: 'Clerk', responsibility: 'Authentication, session token, stable user identity.' },
    { system: 'Supabase', responsibility: 'Profiles, usernames, roles, badges, and private inbox/feedback records protected by RLS.' },
    { system: 'Turso', responsibility: 'Canonical published presentation bodies, versions, views, reaction/share ledgers, and public counters.' },
    { system: 'Convex', responsibility: 'Optional safety mirror only; not a source of published content or identity.' },
    { system: 'Browser storage', responsibility: 'Private drafts and local-first writing until the writer deliberately shares.' },
  ],
  findings: [
    {
      id: 'R-01', severity: 'Critical', area: 'Reactions and shares',
      signal: 'The browser sent canonical Turso presentation IDs to Supabase RPCs whose foreign keys and counter updates target the legacy public.speeches table. A Turso-only ID therefore had no guaranteed matching row in the old table.',
      impact: 'Reaction requests could fail with a foreign-key error or update the wrong/incomplete counter path. Share accounting had the same storage-boundary problem.',
      resolution: 'Added authenticated Node routes that verify the Clerk bearer token and transact against Turso. Per-user reaction/share tables are keyed by canonical presentation ID; reaction updates apply signed counter deltas so historical public totals are not reset when the new ledger starts empty. Repeats toggle/no-op as intended.',
      status: 'Local transaction tests and the production build pass; applying the production migration and retesting the live site remain pending.',
    },
    {
      id: 'R-02', severity: 'High', area: 'Profile and content route latency',
      signal: 'A content URL could download a full writer listing—including every body—just to find one slug for metadata. Profile cards also selected full bodies, handle/profile reads were separate, and the library endpoint ran an extra connection/schema probe before each read.',
      impact: 'More database round trips and payload bytes on /username and /username/content, with avoidable latency and more chances for an unnecessary dependency failure.',
      resolution: 'Added direct handle-plus-profile lookup with a parallel compatibility fallback and request-scoped caching; added a direct writer/slug/folder content query; made writer listings metadata-only; started profile enrichment and badge reads concurrently; added writer-address indexes; removed the per-GET probe. The API now reports the actual read result and uses a shorter edge cache window.',
      status: 'Local reader and route checks pass; deployed PostgREST relationship behavior and live timings remain unverified.',
    },
    {
      id: 'R-03', severity: 'High', area: 'Reports, feedback, and messages',
      signal: 'The public report/feedback form generated a mailto draft. A message was not stored by the site, and a visitor who never sent the email left no database record for administrators to review.',
      impact: 'No reliable, auditable report queue; no direct in-product way to triage user reports and messages.',
      resolution: 'Added a signed-in contact API writing to Supabase inbox_messages; the contact form now forwards the Clerk session token, and the server verifies it before writing. Added status/note fields and RLS policies, plus a role-checked admin inbox that reads contact submissions and existing star-feedback rows and can set status/private admin notes. No service-role key is used or exposed.',
      status: 'Patched in this branch. Apply the additive Supabase schema before accepting database submissions; deployment/database verification is pending.',
    },
    {
      id: 'R-04', severity: 'High', area: 'Admin deep-review report',
      signal: 'There was no private, in-product home for the requested audit findings.',
      impact: 'Review results would be scattered in a chat or file instead of available to authorized site operators.',
      resolution: 'Added /admin/report backed by a no-store API that verifies the Clerk session and checks the live Supabase admin/owner role before returning report content. The page itself ships no report data to an unauthenticated visitor.',
      status: 'Patched in this branch; authorization requires live Clerk/Supabase configuration to exercise.',
    },
    {
      id: 'R-05', severity: 'Moderate', area: 'Logo motion and first paint',
      signal: 'The animated full-screen splash ran on a visitor’s first session and its per-session check added document-head script and CSS animation paths.',
      impact: 'Delayed access to content and introduced motion that was not needed for core functionality.',
      resolution: 'Removed the splash from the app shell, its first-paint session script, and its splash-specific animation rules. The logo mark itself remains static.',
      status: 'Patched in this branch.',
    },
    {
      id: 'R-06', severity: 'Moderate', area: 'Community contributor metrics',
      signal: 'Contributor reads used a legacy document-style users collection and counters, while current public works and reaction counters are canonical in Turso. Community author labels also fell back to signed-in email when no display name was set.',
      impact: 'The leaderboard could be empty, stale, or out of sync with published work, and public community pages could expose an account email as an author name.',
      resolution: 'Added a cached, bounded public API that aggregates published Turso work/counters and joins only public display-name/photo fields from Supabase. Email-like profile/post author labels are replaced with Anonymous, and new posts no longer fall back to email. No profile email column is returned.',
      status: 'Local community privacy checks pass; live profile RLS and aggregate values remain unverified.',
    },
    {
      id: 'R-07', severity: 'Moderate', area: 'Legacy per-reader engagement state',
      signal: 'Existing reaction and share rows remain in the old Supabase compatibility ledgers. The new Turso ledgers are additive and do not import legacy per-user rows.',
      impact: 'Aggregate counters are preserved, but a prior reaction may not appear selected after cutover. If that person reacts again, the new Turso ledger can count the action as fresh; changing kind will not subtract their legacy counter. A legacy share may also be counted once more. No legacy row is deleted by this patch.',
      resolution: 'Keep legacy storage intact and use Turso for new engagement. A controlled migration would require authorized database access, a verified presentation-ID mapping, and a dedupe policy for historical share rows.',
      status: 'Open migration consideration; no database access or migration was performed.',
    },
    {
      id: 'R-08', severity: 'Moderate', area: 'Existing official-account RPC permissions',
      signal: 'The previously reported 42501 errors for admin_create_official_account and admin_set_official_active are distinct from the reaction foreign-key mismatch.',
      impact: 'Official-account creation/activation may still be blocked by grants or RLS configuration, independently of the reaction repair.',
      resolution: 'Kept separate in this review. No production Supabase permissions were inspected or changed.',
      status: 'Open; requires an authorized database-side diagnosis.',
    },
  ],
  controlsAndPreservedBehavior: [
    'Admin inbox and report data require a verified Clerk session and an admin/owner role; Supabase RLS remains the second authorization boundary.',
    'The public report/feedback form is signed-in and rate-limited. Inputs are bounded; report/contact rows are private by default.',
    'Turso credentials remain server-only. The browser uses relative same-origin API paths; no new deployment variables are introduced.',
    'Published-content SEO, canonical URLs, structured data, route metadata, service-worker registration, and existing security headers remain in place.',
    'Drafts remain local-first; no auto-publish path was added. Content and profiles remain in their established authoritative stores.',
    'The three primary writing actions, badge rules, provenance policy, and moderation workflow were not changed by this review.',
  ],
  followUpRisks: [
    'A production operator must apply the additive inbox/feedback changes in supabase/schema.sql before /api/contact can persist messages. The user declined connecting Supabase; no production query, schema application, or credential access occurred in this review.',
    'Existing Turso deployments should receive turso/schema.sql additions. The app’s existing verified-write schema preparation is additive, but no production Turso migration was run here.',
    'The new route-level in-memory rate limits are per process, not a global distributed throttle. For higher traffic, move them to a shared limiter.',
    'PostgREST embedding, Clerk token acceptance by the project’s Supabase configuration, and real latency improvements need a deployed retest.',
    'Historical per-user reaction/share ownership and the separate official-account 42501 issue remain unverified and are not claimed fixed.',
  ],
  verification: {
    state: 'Code-level checks passed; production verification pending',
    checks: [
      'npm run typecheck: passed.',
      'npm run verify:all: passed, including typecheck, secret/environment/schema/Postgres checks, bounded HTTP input checks (3 assertions), community privacy checks (10 assertions), Turso reading checks (30 assertions), reaction/share transactions (8 assertions), the Turso self-test, Convex safety (16 assertions), production build, and route checks (77 assertions).',
      'npm run build: passed; Next.js 16.4.6 compiled and generated all routes. The sandbox ran Node 22.22.3 although this repository declares Node 26.13.1, so repeat the build on the deployment runtime.',
      'npm run check:routes: passed (77 assertions), including production-server route/SEO/security checks with a local Turso file database and a PostgREST stub, plus fail-closed checks for the new admin/contact APIs.',
      'No production deployment, production Supabase query/schema application, live Turso migration, Clerk-admin authorization exercise, or live reaction retest was performed.',
    ],
  },
} as const;
