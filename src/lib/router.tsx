/**
 * One router, two spellings.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * 2.x was a single-page app and every one of its 21 screens links to the next
 * with `react-router`'s vocabulary: `<Link to=…>`, `useNavigate()`,
 * `useParams()`, `useLocation()`, `<NavLink>` with `aria-current="page"`.
 * Moving to the Next.js App Router means those screens now use the framework's
 * router — but rewriting 40-odd call sites by hand would be a large, dull diff
 * with a real chance of silently breaking a deep link.
 *
 * So the vocabulary is kept and the implementation is swapped underneath it:
 * this module is the *only* place that knows Next.js routing exists. Screens
 * import from `@/lib/router` and carry on saying `to=`.
 *
 * ── What it is not ──────────────────────────────────────────────────────────
 * It is not a second router. There is no history stack of its own, no context,
 * no state: every function here is a thin, honest translation into
 * `next/link` and `next/navigation`. Two routers in one app is how a URL ends
 * up disagreeing with the page on screen.
 */
'use client';

import NextLink from 'next/link';
import {
  usePathname,
  useRouter,
  useParams as useNextParams,
} from 'next/navigation';
import { useEffect, type AnchorHTMLAttributes, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { startSpatialTransition } from './motion';

/** What `to` accepts, as 2.x code already uses it. */
export type To = string | { pathname?: string; search?: string; hash?: string };

/** A link that leaves the site keeps the browser's default handling. */
function isExternal(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}

function hrefOf(to: To): string {
  if (typeof to === 'string') return to;
  const pathname = to.pathname ?? '';
  return `${pathname}${to.search ?? ''}${to.hash ?? ''}`;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: To;
  replace?: boolean;
  children?: ReactNode;
}

/**
 * `<Link to="/read/x">` — client-side navigation, prefetched, exactly as
 * `next/link` does it. An off-site URL (advert, sponsor, documentation)
 * becomes a plain anchor; handing a remote URL to the framework router would
 * make it try to navigate to a route that does not exist.
 */
type LinkNavigateHandler = NonNullable<ComponentProps<typeof NextLink>['onNavigate']>;

export function Link({ to, replace, children, ...rest }: LinkProps) {
  const href = hrefOf(to);
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  if (isExternal(href)) {
    return (
      <a href={href} rel="noopener noreferrer" target="_blank" {...rest}>
        {children}
      </a>
    );
  }

  const onNavigate: LinkNavigateHandler = (event) => {
    const update = () => {
      if (replace) router.replace(href);
      else router.push(href);
    };
    // Prevent Next's own push only when immediately replacing it with either
    // the native spatial transition or the same ordinary router update.
    event.preventDefault();
    if (!startSpatialTransition(pathname, href, update)) update();
  };

  return (
    <NextLink href={href || '/'} replace={replace} onNavigate={onNavigate} {...rest}>
      {children}
    </NextLink>
  );
}

type NavLinkClassName = string | ((state: { isActive: boolean }) => string);

interface NavLinkProps extends Omit<LinkProps, 'className'> {
  className?: NavLinkClassName;
  style?: CSSProperties;
  /** Match the whole path, not just the prefix. `/` needs this. */
  end?: boolean;
}

/**
 * `<NavLink>` with the one behaviour the stylesheet actually relies on:
 * `aria-current="page"` on the current section. `src/styles/index.css` styles
 * `.pb-navlink[aria-current='page']`, so this attribute *is* the active state.
 */
export function NavLink({ to, end, className, ...rest }: NavLinkProps) {
  const pathname = usePathname();
  const href = hrefOf(to);
  const isActive = Boolean(
    pathname && (end || href === '/' ? pathname === href : pathname.startsWith(href)),
  );
  const resolved =
    typeof className === 'function' ? className({ isActive }) : [className, isActive ? 'active' : ''].filter(Boolean).join(' ').trim();

  return (
    <Link
      to={to}
      className={resolved || undefined}
      {...(isActive ? { 'aria-current': 'page' as const } : {})}
      {...rest}
    />
  );
}

/**
 * The router. Returns a function that accepts a path, an options object, or a
 * number — `navigate(-1)` goes back, as it did before.
 */
export function useNavigate() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  return (to: To | number, options?: { replace?: boolean }) => {
    if (typeof to === 'number') {
      if (typeof window !== 'undefined') window.history.go(to);
      return;
    }
    const href = hrefOf(to);
    if (!href) return;
    const update = () => {
      if (options?.replace) router.replace(href);
      else router.push(href);
    };
    if (!startSpatialTransition(pathname, href, update)) update();
  };
}

/**
 * Route parameters. Next.js hands back `string | string[]` (a catch-all can
 * repeat); 2.x code expects a string, so arrays are joined by their first
 * member and an absent key is `undefined` rather than `''`.
 */
export function useParams<T extends Record<string, string | undefined> = Record<string, string>>(): T {
  const params = useNextParams() as Record<string, string | string[] | undefined>;
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out as T;
}

/**
 * The framework's own parameters, arrays intact.
 *
 * `useParams` above deliberately flattens a repeated segment to its first
 * value, which is what every 2.x call site wants. A catch-all route does not
 * want that: `/[username]/[[...rest]]` is *one, two or no* pieces and the
 * screen has to see all of them. Same source, no translation.
 */
export function useRouteParams<
  T extends Record<string, string | string[] | undefined> = Record<string, string | string[]>,
>(): T {
  return (useNextParams() ?? {}) as T;
}

/** `useLocation()`, as much of it as 2.x reads: `pathname` and `search`. */
export function useLocation() {
  const pathname = usePathname() ?? '/';
  return {
    pathname,
    search: typeof window === 'undefined' ? '' : window.location.search,
    hash: typeof window === 'undefined' ? '' : window.location.hash,
    key: 'next',
    state: null,
  };
}

/**
 * `<Navigate to=… />` — the old name for a redirect that happens after paint.
 * Used only by the retired-path shims (`/practice` → `/rehearse`), which are
 * now `permanent` redirects in `next.config.ts`; this stays for screens that
 * decide *during render* that the visitor belongs somewhere else.
 */
export function Navigate({ to, replace = false }: { to: To; replace?: boolean }) {
  const router = useRouter();
  const href = hrefOf(to);

  useEffect(() => {
    if (!href) return;
    if (replace) router.replace(href);
    else router.push(href);
  }, [href, replace, router]);

  return null;
}
