# Convex — bounded safety mirror

Turso is the only canonical presentation store. Convex is not connected to the
reader, writer, live activity feed or presence UI. It keeps a deterministic
cohort of at most `floor(published presentations / 100)` personal works; an
individual marker contains at most 1% of that work's UTF-8 body bytes. Works
under 100 bytes contribute no body text.

The global cohort is marked in Turso by additive sampling triggers. The server
only returns an author's slice when their published personal presentation is
in that cohort. Convex's public entry point accepts an id and a short-lived
Clerk session, not caller-supplied content. It fetches the selected slice from
the fixed canonical Presentation Buddy API, which verifies the Clerk session,
checks ownership, and rereads the row from Turso. Only a private internal
mutation can persist the response. A direct Convex caller therefore cannot
invent or replace recovery text. Each write also reconciles Convex membership
against Turso's current global sample, and a delete/status change cannot make
the global ratio grow silently.

The fixed callback origin defaults to the current `VITE_SITE_URL` value,
`https://presentationbuddy.aavrit.dedyn.io`. If that canonical domain changes,
update the fallback in `convex/safety.ts`; this uses no additional deployment
variable. The existing `VITE_CONVEX_URL` and Clerk `convex` JWT template remain
optional. If Convex is absent or the safety write fails, the Turso share still
succeeds. Nothing reads Convex to render a presentation or silently replace
canonical content.

The previous presence/activity feature is retired. Its `presence`, `activity`
and `counters` tables remain declared only so an existing deployment can roll
forward without a schema-validation failure; no current function reads or
writes them. Purge those historical rows before removing their definitions in
a later deployment.
