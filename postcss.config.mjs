/**
 * Tailwind v4 runs as a PostCSS plugin under Next.js (Vite had its own
 * `@tailwindcss/vite` adapter). The stylesheet itself is unchanged:
 * `src/styles/index.css` still opens with `@import 'tailwindcss'` and the
 * `@theme inline` bridge, and is imported once, by `app/layout.tsx`.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
