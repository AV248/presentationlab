import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpenText,
  Clapperboard,
  Feather,
  Globe,
  Info,
  Library,
  LogOut,
  Menu,
  Palette,
  PenLine,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  User2,
  X,
} from 'lucide-react';
import { Logo } from './Logo';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { useCloud } from '../store/cloud';
import { useAuth } from '../store/auth';
import { modifierLabel, isApple } from '../lib/platform';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Library;
  hint: string;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Library', icon: Library, hint: 'Read the collection' },
  { to: '/studio', label: 'Studio', icon: PenLine, hint: 'Write, and let the coach read it back' },
  { to: '/practice', label: 'Practice', icon: Clapperboard, hint: 'Teleprompter, breathing and pacing' },
  { to: '/community', label: 'Community', icon: Trophy, hint: 'Leaderboard and the open mic' },
  { to: '/web', label: 'From the web', icon: Globe, hint: 'Public-domain speeches, fetched live' },
  { to: '/desk', label: 'Your desk', icon: Feather, hint: 'Lines, notes, letters and firsts' },
  { to: '/themes', label: 'Themes', icon: Palette, hint: 'Five axes, 114 options' },
  { to: '/control', label: 'Control Room', icon: SlidersHorizontal, hint: 'Content, data, cloud and admin' },
  { to: '/about', label: 'About', icon: Info, hint: 'How Presentation Buddy works' },
];

const BOTTOM_NAV = NAV.slice(0, 5);

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
        return;
      }
      if (event.key.toLowerCase() === 'g') {
        const next = window.prompt(
          'Jump to:\n1 Library\n2 Studio\n3 Practice\n4 Community\n5 Themes\n6 Control Room\n7 About',
        );
        const index = Number(next);
        if (index >= 1 && index <= NAV.length) navigate(NAV[index - 1].to);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, openPalette, setHelp, setThemePanel]);

  const current = NAV.find((item) => item.to === location.pathname);

  // Keep the browser tab in step with the page you are on.
  useEffect(() => {
    const name = current?.label ?? 'Presentation Buddy';
    document.title =
      name === 'Library' ? 'Presentation Buddy — speeches, studio and rehearsal' : `${name} · Presentation Buddy`;
  }, [current?.label]);

  return (
    <div className="pb-shell">
      <a href="#main" className="pb-sr-only">
        Skip to content
      </a>

      <aside className="pb-sidebar" data-open={drawerOpen} aria-label="Main navigation">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 18,
            paddingInline: 4,
          }}
        >
          <NavLink to="/" style={{ display: 'flex' }}>
            <Logo size={38} withWordmark />
          </NavLink>
          <button
            type="button"
            className="pb-icon-btn"
            onClick={() => setDrawer(false)}
            aria-label="Close navigation"
            style={{ display: drawerOpen ? undefined : 'none' }}
          >
            <X size={18} />
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="pb-navlink"
              title={item.hint}
            >
              <item.icon size={18} style={{ flex: '0 0 auto' }} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={{ flex: 1, minHeight: 24 }} />

        <button
          type="button"
          className="pb-btn pb-btn-primary pb-btn-block"
          onClick={() => setThemePanel(true)}
          style={{ marginBottom: 10 }}
        >
          <Sparkles size={16} /> Theme studio
        </button>
        <AccountChip />
        <div style={{ height: 8 }} />
        <CloudBadge />
      </aside>

      {drawerOpen && (
        <div className="pb-drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
      )}

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="pb-topbar">
          <button
            type="button"
            className="pb-icon-btn"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            data-drawer-button
          >
            <Menu size={19} />
          </button>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--x-font-display)',
                fontWeight: 650,
                fontSize: '1rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {current?.label ?? 'Presentation Buddy'}
            </span>
            <span className="pb-muted" style={{ fontSize: '0.78rem', display: 'none' }} data-hint>
              {current?.hint}
            </span>
          </div>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="pb-btn pb-btn-ghost pb-search-trigger"
            onClick={openPalette}
            style={{ maxWidth: 260, width: '100%', justifyContent: 'flex-start' }}
            aria-label="Search and jump"
          >
            <Search size={16} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Search speeches…</span>
            <span className="pb-kbd" style={{ marginLeft: 'auto' }}>
              {modifier}K
            </span>
          </button>

          <button
            type="button"
            className="pb-icon-btn"
            onClick={() => setThemePanel(true)}
            aria-label="Open theme studio"
            title="Theme studio (T)"
          >
            <Palette size={18} />
          </button>
          <button
            type="button"
            className="pb-icon-btn"
            onClick={() => setHelp(true)}
            aria-label="Keyboard shortcuts"
            title="Shortcuts (?)"
          >
            <BookOpenText size={18} />
          </button>
        </header>

        <main id="main" className="pb-main" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav className="pb-bottomnav" aria-label="Primary">
        {BOTTOM_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}>
            <item.icon size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setDrawer(true)} aria-label="More pages">
          <Menu size={19} />
          <span>More</span>
        </button>
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
        onClick={() => openSignIn('Sign in to like, share and publish.')}
      >
        <User2 size={15} /> Sign in
      </button>
    );
  }

  return (
    <div className="pb-well" style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
      {user.photoURL ? (
        <img src={user.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: 999, objectFit: 'cover' }} />
      ) : (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            background: 'var(--c-accent-soft)',
            border: '1px solid var(--c-accent-line)',
            color: 'var(--c-accent)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--x-font-display)',
            fontWeight: 700,
            fontSize: '0.85rem',
            flex: '0 0 auto',
          }}
        >
          {(user.displayName ?? user.email ?? '?').slice(0, 1).toUpperCase()}
        </span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.displayName ?? 'Signed in'}
        </div>
        <div className="pb-muted" style={{ fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {role ? `${role} · ` : ''}
          {user.email}
        </div>
      </div>
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
    </div>
  );
}

function CloudBadge() {
  const status = useCloud((s) => s.status);
  const enabled = useCloud((s) => s.enabled);
  const items = useCloud((s) => s.items);
  const error = useCloud((s) => s.error);

  const tone =
    status === 'online' ? 'var(--c-ok)' : status === 'error' ? 'var(--c-warn)' : 'var(--c-ink-muted)';
  const label = !enabled
    ? 'Local only'
    : status === 'online'
      ? `Cloud · ${items.length}`
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'error'
          ? 'Cloud offline'
          : 'Local only';

  return (
    <div
      className="pb-well"
      style={{ padding: '8px 10px', fontSize: '0.72rem', color: 'var(--c-ink-muted)' }}
      title={error ?? 'Bundled library works offline; cloud adds shared speeches when reachable.'}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: tone,
            boxShadow: `0 0 8px ${tone}`,
            flex: '0 0 auto',
          }}
        />
        {label}
      </span>
    </div>
  );
}
