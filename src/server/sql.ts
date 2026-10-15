/**
 * Splitting a `.sql` file into statements.
 *
 * ── Why this is not `sql.split(';')` ────────────────────────────────────────
 * Because a semicolon is a character that appears in this project's schemas in
 * four places that are not the end of a statement:
 *
 *   • inside a string — `values ('a; b')`. Both schemas have prose in them;
 *   • inside a dollar-quoted body — every function and trigger in
 *     `supabase/schema.sql` is `$$ … ; … $$`, and a split there produces
 *     fragments Postgres refuses;
 *   • inside a line comment — `-- Handles: the site's address book; one row…`;
 *   • inside a block comment, which in Postgres nests.
 *
 * A splitter that gets any of these wrong does not fail loudly. It sends prose
 * to the database as SQL, which is how a schema "applies" as 84 errors and one
 * afternoon of confusion — the exact failure this file was written after.
 *
 * The rule it implements is the one Postgres itself uses, in the same order of
 * precedence: a string, then a dollar quote, then a comment, then a semicolon.
 */
export function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const char = sql[i] as string;
    const pair = sql.slice(i, i + 2);

    /* A line comment. Dropped, and replaced by the newline that ended it: that
       is what Postgres does, and it is the only thing that keeps two tokens on
       either side of a comment from being glued together. */
    if (pair === '--') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      current += '\n';
      i = stop + 1;
      continue;
    }

    /* A block comment, which nests — `/* a /* b *​/ c *​/` is one comment. */
    if (pair === '/*') {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.slice(j, j + 2) === '/*') { depth += 1; j += 2; continue; }
        if (sql.slice(j, j + 2) === '*/') { depth -= 1; j += 2; continue; }
        j += 1;
      }
      current += ' ';
      i = j;
      continue;
    }

    /* A string. `''` inside a single-quoted string is an escaped quote; so is
       `\'` inside an E'…' string, which is why the prefix matters. */
    if (char === "'" || char === '"') {
      const quote = char;
      const prefixed = /[Ee]$/.test(current.trimEnd().slice(-1));
      let j = i + 1;
      while (j < sql.length) {
        const inner = sql[j] as string;
        if (prefixed && inner === '\\') { j += 2; continue; }
        if (inner === quote) {
          if (sql[j + 1] === quote) { j += 2; continue; }
          j += 1;
          break;
        }
        j += 1;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    /* A dollar-quoted body: `$$ … $$` or `$tag$ … $tag$`. Everything inside is
       text, including semicolons, comments and quotes. */
    if (char === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        const stop = close === -1 ? sql.length : close + tag[0].length;
        current += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (char === ';') {
      /*
       * A trigger is the exception to "a semicolon ends a statement".
       *
       * `create trigger … begin insert …; insert …; end;` contains as many
       * semicolons as it has actions, and SQLite — which is where this file is
       * applied — counts only the one after `end`. Splitting inside the body
       * produces fragments it refuses with "incomplete input", which is how
       * this was found.
       *
       * The body ends where the statement does: at the `end` that closes it.
       */
      const so_far = current + ';';
      if (/^\s*create\s+(temp\s+|temporary\s+)?trigger\b/i.test(so_far) && !/\bend\s*;\s*$/i.test(so_far)) {
        current = so_far;
        i += 1;
        continue;
      }
      if (current.trim()) statements.push(current.trim());
      current = '';
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}
