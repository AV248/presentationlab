import type { ReactNode } from 'react';

/**
 * Structured data, rendered on the server.
 *
 * 2.x wrote this into each prerendered page from the route registry at build
 * time. It is the same registry and the same objects — a server component can
 * simply render them, which is one whole build step fewer.
 *
 * `dangerouslySetInnerHTML` is the only way to emit a JSON-LD block, and it is
 * safe here for a specific reason: the value is `JSON.stringify`d from objects
 * authored in `src/data/routes.ts`, never from anything a visitor typed.
 * `JSON.stringify` escapes `<` inside strings, so a `</script>` written into a
 * speech title could not close this tag early.
 */
export function JsonLd({ data }: { data: Record<string, unknown>[] }): ReactNode {
  return (
    <>
      {data.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
    </>
  );
}
