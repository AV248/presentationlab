'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from '@/lib/router';
import {
  BookMarked,
  Clapperboard,
  Feather,
  Globe,
  Info,
  Library,
  LogOut,
  MoreHorizontal,
  Palette,
  PenLine,
  Search,
  Shield,
  SlidersHorizontal,
  Trophy,
  X,
} from 'lucide-react';
import { Logo } from './Logo';
import { AccountMenu } from './AuthProvider';
import { CLERK_ENABLED } from '../services/clerk';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { festivalById } from '../data/festivals';
import { useProfile } from '../store/profile';
import { normalizeUsername } from '../lib/identity';
import { fetchSiteFestival, SUPPORT_EMAIL } from '../services/profiles';
import { fetchSiteNotice, type PublicSiteNotice } from '../services/siteNotice';
import { useCloud } from '../store/cloud';
import { useAuth } from '../store/auth';
import { modifierLabel, isApple } from '../lib/platform';
import { motionRoom } from '../lib/motion';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Library;
  hint: string;
}

/**
 * The five things this app is for. Everything else is a setting.
 *
 * 2.4 cut the navigation from ten flat entries to five verbs plus a
 * drawer of secondary rooms. The order is the order of the work: you
 * rehearse what you wrote, from what you read.
 */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/rehearse', label: 'Rehearse', icon: Clapperboard, hint: 'Full-screen teleprompter, pacing and breath' },
  { to: '/', label: 'Read', icon: Library, hint: 'The collection, and what arrived today' },
  { to: '/write', label: 'Write', icon: PenLine, hint: 'Draft with a coach and a dictionary at your elbow' },
  { to: '/arrivals', label: 'Arrivals', icon: Globe, hint: 'Five new speeches from the open archives, every session' },
  { to: '/desk', label: 'Desk', icon: Feather, hint: 'Lines, notes, letters and your progress' },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: '/topics', label: 'Guides', icon: BookMarked, hint: 'Speaking guides for every occasion' },
  { to: '/community', label: 'Community', icon: Trophy, hint: 'Leaderboard and the open mic' },
  { to: '/themes', label: 'Themes', icon: Palette, hint: 'Make the workspace yours' },
  { to: '/control', label: 'Settings', icon: SlidersHorizontal, hint: 'Content, data, cloud and comfort' },
  { to: '/about', label: 'About', icon: Info, hint: 'How Presentation Buddy works' },
];

/** Kept for the command palette and help dialog, which list everything. */
export const NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawer = useUi((s) => s.setDrawer);
  const openPalette = useUi((s) => s.openPalette);
  const setThemePanel = useUi((s) => s.setThemePanel);
  const setHelp = useUi((s) => s.setHelp);
  const contrast = useSettings((s) => s.contrast);
  const connect = useCloud((s) => s.connect);
  const [modifier, setModifier] = useState('Ctrl');
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setModifier(modifierLabel());
    void connect();
  }, [connect]);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawer(false);
  }, [location.pathname, setDrawer]);

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast;
  }, [contrast]);

  // Lock the page behind the drawer so phones do not scroll the layer below.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox');

      const mod = isApple() ? event.metaKey : event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        useUi.getState().togglePalette();
        return;
      }
      if (event.key === 'Escape' && useUi.getState().drawerOpen) {
        setDrawer(false);
        return;
      }
      if (typing) return;

      if (event.key === '/') {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.key.toLowerCase() === 't' && !mod) {
        event.preventDefault();
        setThemePanel(true);
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, openPalette, setHelp, setThemePanel, setDrawer]);

  const current = NAV.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  );
  const room = motionRoom(location.pathname);

  const renderNavLink = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      className="pb-navlink"
      title={item.hint}
    >
      <item.icon size={18} aria-hidden="true" />
      <span className="pb-navlink-label">{item.label}</span>
    </NavLink>
  );

  return (
    <div className="pb-shell">
      <a href="#main" className="pb-skip">
        Skip to content
      </a>

      {/* ---- the rail: desktop sidebar, phone/tablet drawer ---- */}
      <aside
        ref={drawerRef}
        className="pb-sidebar"
        data-open={drawerOpen}
        aria-label="Main navigation"
        aria-hidden={undefined}
      >
        <div className="pb-sidebar-head">
          <NavLink to="/" aria-label="Presentation Buddy home" style={{ display: 'flex', minWidth: 0 }}>
            <Logo size={30} withWordmark />
          </NavLink>
          <button
            type="button"
            className="pb-icon-btn pb-drawer-close"
            onClick={() => setDrawer(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="pb-nav-group" aria-label="Primary">
          {PRIMARY_NAV.map(renderNavLink)}
        </nav>

        <div className="pb-nav-rule" role="presentation">
          <span>More</span>
        </div>

        <nav className="pb-nav-group" aria-label="Secondary">
          {SECONDARY_NAV.map(renderNavLink)}
        </nav>

        <div style={{ flex: 1, minHeight: 16 }} />

        <AccountChip />
        <HandleLink />
        <a className="pb-navlink" href={`mailto:${SUPPORT_EMAIL}`} title={`Email ${SUPPORT_EMAIL}`}><span className="pb-navlink-label">Contact support</span></a>
        <CloudBadge />
      </aside>

      {drawerOpen && (
        <div className="pb-drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
      )}

      {/* ---- the column ---- */}
      <div className="pb-column">
        <PublicNoticeRibbon />
        <FestivalRibbon />
        <header className="pb-topbar">
          <button
            type="button"
            className="pb-icon-btn pb-drawer-button"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <MoreHorizontal size={19} />
          </button>

          <NavLink to="/" className="pb-topbar-mark" aria-label="Presentation Buddy home">
            <Logo size={24} />
          </NavLink>

          <span className="pb-topbar-title">{current?.label ?? 'Presentation Buddy'}</span>
          <span className="pb-topbar-hint">{current?.hint}</span>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="pb-btn pb-btn-ghost pb-search-trigger"
            onClick={openPalette}
            aria-label="Search and commands"
          >
            <Search size={16} aria-hidden="true" />
            <span>Search</span>
            <kbd className="pb-kbd">{modifier}K</kbd>
          </button>
        </header>

        <main id="main" className="pb-main" data-room={room}>
          {children}
        </main>
      </div>

      {/* ---- phone tab bar ---- */}
      <nav className="pb-bottomnav" aria-label="Sections">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} title={item.hint}>
            <item.icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function AccountChip() {
  const user = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const signOut = useAuth((s) => s.signOut);
  const openSignIn = useUi((s) => s.openSignIn);
  const toast = useUi((s) => s.toast);

  if (!user) {
    return (
      <button
        type="button"
        className="pb-btn pb-btn-block"
        onClick={() => openSignIn('Sign in to publish, react and appear on the leaderboard.')}
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="pb-account">
      {user.photoURL ? (
        <img src={user.photoURL} alt="" width={28} height={28} className="pb-avatar" />
      ) : (
        <span className="pb-avatar pb-avatar-letter" aria-hidden="true">
          {(user.displayName ?? user.email ?? '?').slice(0, 1).toUpperCase()}
        </span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <span className="pb-account-name">{user.displayName ?? user.email}</span>
        {role && (
          <NavLink to="/admin" className="pb-account-role">
            <Shield size={11} aria-hidden="true" /> Workspace
          </NavLink>
        )}
      </div>
      {/* Clerk's own menu offers profile management and switching accounts;
          without it we keep the plain sign-out button. */}
      {CLERK_ENABLED ? (
        <AccountMenu />
      ) : (
        <button
          type="button"
          className="pb-icon-btn"
          title="Sign out"
          aria-label="Sign out"
          onClick={() => {
            void signOut().then(() => toast('Signed out. Your drafts stay on this device.', 'info'));
          }}
        >
          <LogOut size={15} />
        </button>
      )}
    </div>
  );
}

function CloudBadge() {
  const status = useCloud((s) => s.status);
  const items = useCloud((s) => s.items);
  const error = useCloud((s) => s.error);

  const tone =
    status === 'online' ? 'var(--c-ok)' : status === 'error' ? 'var(--c-warn)' : 'var(--c-ink-muted)';
  const label = status === 'online'
    ? `Turso · ${items.length}`
    : status === 'connecting'
      ? 'Connecting…'
      : status === 'error'
        ? 'Library offline'
        : 'Local only';

  return (
    <div
      className="pb-cloud-badge"
      title={error ?? 'Bundled examples work offline; shared presentations are served from Turso.'}
    >
      <span className="pb-dot" style={{ background: tone, boxShadow: `0 0 8px ${tone}` }} />
      {label}
    </div>
  );
}

function PublicNoticeRibbon() {
  const [notice, setNotice] = useState<PublicSiteNotice | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void fetchSiteNotice().then((value) => { if (alive) setNotice(value); }); };
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<PublicSiteNotice | null>).detail;
      setNotice(detail ?? null);
    };
    refresh();
    window.addEventListener('pb:site-notice-updated', updated);
    return () => { alive = false; window.removeEventListener('pb:site-notice-updated', updated); };
  }, []);
  if (!notice?.active) return null;
  return <div className={`pb-site-notice pb-site-notice-${notice.tone}`} role={notice.tone === 'warning' ? 'alert' : 'status'}>{notice.message}</div>;
}

function FestivalRibbon() {
  // Owner-selected in the database only — visitors cannot change the season.
  const [site, setSite] = useState<string | null>(null);
  useEffect(() => { void fetchSiteFestival().then(setSite); }, []);
  const f = festivalById(site);
  if (f.id === 'none') return null;
  return <div className="pb-festival" role="note"><span aria-hidden="true">{f.emoji}</span><span><strong>{f.name}.</strong> {f.greeting}</span></div>;
}
function HandleLink() {
  const username = useProfile((s) => s.username);
  const user = useAuth((s) => s.user);
  if (!user) return null;

  // Claimed: the person's own page.
  if (username) {
    return (
      <NavLink className="pb-navlink" to={`/${username}`}>
        <span className="pb-navlink-label">@{username} — your page</span>
      </NavLink>
    );
  }

  // A username set in Clerk but not yet recorded here is a step *in
  // progress*, not a missing one — the label says which it is.
  const pending = normalizeUsername(user.username ?? '');
  return (
    <NavLink className="pb-navlink" to="/claim">
      <span className="pb-navlink-label">
        {pending ? `Finish claiming @${pending}` : 'Claim your @username'}
      </span>
    </NavLink>
  );
}
