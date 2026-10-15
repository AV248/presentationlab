/**
 * Reading configuration on the server, at the moment it is used.
 *
 * ── Why this is a file and not just `process.env` ───────────────────────────
 * `next.config.ts` inlines five `VITE_*` variables at build time, on purpose:
 * the dashboard keeps its existing variable names, and the browser code keeps
 * reading them. Inlining is a text substitution — `process.env.VITE_SUPABASE_URL`
 * is replaced with the value the build saw, everywhere it appears, including in
 * server bundles.
 *
 * That is exactly right for the client bundle and wrong for the server. The
 * server's configuration is not a build-time fact: it is whatever the host has
 * handed this process, and it must be read as such. Otherwise a server started
 * with a different database — a preview, a local run, a test — would silently
 * keep talking to the one that was configured when the build ran, and the only
 * symptom would be an empty page.
 *
 * Bracket access is not rewritten by the inliner, so this reads the real
 * environment. That is the whole trick, and it is worth a named function
 * because a bare `process.env[something]` in a codebase that otherwise reads
 * `process.env.SOMETHING` looks like a mistake.
 */
export function serverEnv(name: string): string {
  return (process.env?.[name] ?? '').trim();
}

/** The first of several names that is set — for variables with an alias. */
export function serverEnvAny(...names: string[]): string {
  for (const name of names) {
    const value = serverEnv(name);
    if (value) return value;
  }
  return '';
}
