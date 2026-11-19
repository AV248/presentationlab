'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useRouteParams } from '@/lib/router';
import { AtSign, Feather, Link2, MapPin, Mic2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useProfile } from '../store/profile';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useGate } from '../components/SignIn';
import { validateUsername, normalizeUsername, RESERVED_HANDLES } from '../lib/identity';
import { claimUsername, fetchHandleState, fetchProfile, isUsernameAvailable, type PublicProfile } from '../services/profiles';
import { workPath, slugifySegment, presentationPath } from '../lib/paths';
import { fetchSpeechesByUsernameResult, type CloudSpeech } from '../services/data';
import { shortUrl } from '../lib/share';
import { copyText } from '../lib/platform';
import { usePageMeta } from '../lib/usePageMeta';
import { Markdown } from '../components/Markdown';
import { AuthorCorner } from '../components/AuthorCorner';
import { presentationViewName } from '../lib/motion';

/** What the server already read, handed over so the page can be rendered as
 *  HTML before the browser runs. Absent on a client-side navigation. */
export interface HandleSeed {
  username: string;
  profile: PublicProfile | null;
  works: CloudSpeech[];
  handleState: 'held' | 'free' | 'unknown';
  worksStatus?: 'available' | 'unavailable';
}

/** /:username — everything about a person and their work.
 *  /:username/:slug — one of their creations, at their own address. */
export function HandlePage({ initial }: { initial?: HandleSeed } = {}) {
  // The route is `/[username]/[[...rest]]`: one piece is the speech, two are
  // folder-then-speech. Reading it here keeps the URL grammar in exactly one
  // place, and every link into this page is still written by `profilePath`.
  const { username: raw, rest } = useRouteParams<{ username: string; rest?: string[] }>();
  const pieces = Array.isArray(rest) ? rest : rest ? [rest] : [];
  const folder = pieces.length > 1 ? pieces[0] : undefined;
  const slug = pieces.length ? pieces[pieces.length - 1] : undefined;
  const username = normalizeUsername(raw ?? '') || initial?.username || '';
  // Seeded from the server when there is a server answer: the page is already
  // HTML, and these are the values that were rendered into it.
  const [profile, setProfile] = useState<PublicProfile | null>(initial?.profile ?? null);
  const [works, setWorks] = useState<CloudSpeech[]>(initial?.works ?? []);
  const [handleState, setHandleState] = useState<'held' | 'free' | 'unknown' | null>(
    initial?.handleState ?? null,
  );
  const [loaded, setLoaded] = useState(Boolean(initial));
  const [worksStatus, setWorksStatus] = useState<'available' | 'unavailable'>(initial?.worksStatus ?? 'available');
  const me = useProfile(); const user = useAuth((s) => s.user);
  const mine = useLibrary((s) => s.mine);
  const isMine = Boolean(username) && me.username === username;
  usePageMeta(profile ? `${profile.displayName} (@${username})` : `@${username}`, { description: profile?.bio || `Speeches and work by @${username} on Presentation Buddy.`, robots: profile || isMine ? undefined : 'noindex, follow' });
  useEffect(() => {
    // The server already answered for this handle; asking again would be a
    // round trip to render what is on the screen.
    if (initial) return;
    let alive = true;
    void (async () => {
      // Client-side route transitions receive the same parallel read pattern as
      // the server-rendered route rather than waiting on three serial requests.
      const [state, p, result] = await Promise.all([
        fetchHandleState(username),
        fetchProfile(username),
        fetchSpeechesByUsernameResult(username),
      ]);
      if (!alive) return;
      setHandleState(state);
      setProfile(p);
      setWorks(result.items);
      setWorksStatus(result.status === 'error' ? 'unavailable' : 'available');
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [username, initial]);
  const localWorks = useMemo(() => isMine ? mine.filter((m) => m.status === 'published') : [], [isMine, mine]);
  if (RESERVED_HANDLES.has(username)) return <NotFoundHandle username={username} />;
  if (slug) {
    // The address a writer chose: /user1/speech, or /user1/folder/speech with
    // exactly one folder. Resolution order matters — an exact match on both
    // segments, then a match on the speech alone (a link made before folders
    // existed, or a work moved into a folder afterwards), then a folder's own
    // listing.
    const bySegments = <T extends PathListItem>(list: T[]): T | undefined =>
      list.find((w) => (w.folder ?? '') === (folder ?? '') && ((w.slug ?? '') === slug || w.id === slug));
    const bySlugOnly = <T extends PathListItem>(list: T[]): T | undefined =>
      list.find((w) => !folder && ((w.slug ?? '') === slug || w.id === slug));
    const work = bySegments(works) ?? bySegments(localWorks) ?? bySlugOnly(works) ?? bySlugOnly(localWorks);
    if (work) return <HandleWork username={username} work={work} />;

    if (!folder) {
      const inFolder = [...works, ...localWorks].filter((w) => (w.folder ?? '') === slug);
      if (inFolder.length) return <HandleFolder username={username} folder={slug} works={inFolder} />;
    }
    if (loaded && worksStatus === 'unavailable') {
      return (
        <div className="pb-panel" style={{ padding: 28, textAlign: 'center' }} role="status">
          <h2 style={{ marginBottom: 8 }}>This work could not be checked</h2>
          <p className="pb-muted" style={{ lineHeight: 1.65, marginBottom: 14 }}>
            The reading room did not answer, so we will not mistake a connection problem for a missing presentation.
          </p>
          <button type="button" className="pb-btn" onClick={() => window.location.reload()}>Try again</button>
        </div>
      );
    }
    if (loaded || isMine) return <NotFoundHandle username={username} what="speech" />;
    return <p className="pb-muted" style={{ padding: 24 }}>Opening @{username}/{slug}…</p>;
  }
  // Nobody holds this address: say so plainly instead of rendering a page
  // (which is what used to happen — every free handle looked claimed).
  if (loaded && !profile && !isMine && handleState === 'free') return <NotFoundHandle username={username} />;

  // The read could not be made (offline, or the rules refused it). That is
  // not the same as "free", so it is not reported as one.
  if (loaded && !profile && !isMine && handleState === 'unknown') {
    return (
      <div className="pb-panel" style={{ padding: 36, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>We could not check that handle</h2>
        <p className="pb-muted" style={{ marginBottom: 16, lineHeight: 1.65 }}>
          @{username} could not be looked up just now — the connection is offline, or the database
          refused the read. Reload to try again.
        </p>
        <Link to="/" className="pb-btn">Back to the library</Link>
      </div>
    );
  }

  const display = profile ?? (isMine ? { username, uid: user?.uid ?? '', displayName: me.displayName || username, bio: me.bio, location: me.location, website: me.website, signature: me.signature, createdAt: '', photoURL: user?.photoURL ?? '' } : null);
  if (!display && loaded) {
    return (
      <div className="pb-panel" style={{ padding: 28, textAlign: 'center' }} role="status">
        <h2 style={{ marginBottom: 8 }}>This profile could not be opened</h2>
        <p className="pb-muted" style={{ lineHeight: 1.65, marginBottom: 14 }}>
          @{username} is held, but its profile details are not available right now. Try again shortly.
        </p>
        <button type="button" className="pb-btn" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  if (!display) return <p className="pb-muted" style={{ padding: 24 }}>Opening @{username}…</p>;
  return (
    <div className="pb-page anim-author-arrival" style={{ display:'flex', flexDirection:'column', gap:'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding:'clamp(20px,4vw,36px)' }}>
        <div className="pb-profile-author-corner">
          <AuthorCorner author={display.displayName} username={display.username} photoURL={display.photoURL} arrival />
        </div>
        <span className="pb-eyebrow"><AtSign size={12} /> {username}</span>
        <h1 style={{ fontSize:'clamp(1.7rem,4vw,2.5rem)', margin:'8px 0' }}>{display?.displayName ?? `@${username}`}</h1>
        {display.bio
          ? <p className="pb-soft" style={{ maxInlineSize: '62ch', lineHeight: 1.65 }}>{display.bio}</p>
          : <p className="pb-muted">{isMine ? 'No introduction yet — add a bio in Profile settings and it appears here.' : 'No introduction yet.'}</p>}
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:12 }} className="pb-muted">
          {display?.location && <span><MapPin size={13} style={{display:'inline',verticalAlign:'-2px'}} /> {display.location}</span>}
          {display?.website && <a href={display.website.startsWith('http') ? display.website : `https://${display.website}`} target="_blank" rel="noopener noreferrer"><Link2 size={13} style={{display:'inline',verticalAlign:'-2px'}} /> {display.website}</a>}
          <span>{works.length >= 60 ? '60+' : works.length + localWorks.length} published</span>
        </div>
        {display?.signature && <p style={{ fontFamily:'var(--x-font-display)', fontStyle:'italic', marginTop:14 }}>— {display.signature}</p>}
        <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
          <button type="button" className="pb-btn" onClick={() => void copyText(shortUrl(`/${username}`))}>Copy {shortUrl(`/${username}`)}</button>
          {isMine && <Link to="/settings" className="pb-btn pb-btn-ghost">Edit your profile</Link>}
        </div>
      </section>
      <section>
        <h2 style={{ fontSize:'1.1rem', marginBottom:12 }}>Their work</h2>
        {[...works, ...localWorks].length === 0 && <div className="pb-panel" style={{ padding:24 }}><p className="pb-muted">{worksStatus === 'unavailable' ? 'The reading room could not be reached, so this list may be incomplete. Reload to try again.' : loaded || !isMine ? 'Nothing published here yet.' : 'Publish from the Writing Desk and it will live at this address.'}</p></div>}
        <div style={{ display:'grid', gap:10 }}>
          {works.map((w) => (
            <article key={w.id} className="pb-panel" style={{ padding:'16px 18px' }}>
              <div className="pb-profile-work-author">
                <AuthorCorner author={w.author} username={w.username || username} photoURL={w.authorPhotoURL} badges={w.authorBadges} compact />
              </div>
              <Link to={workPath(username, w.slug || w.id, w.folder ?? '')} style={{ fontWeight:700, fontSize:'1.05rem' }}>{w.title}</Link>
              <p className="pb-soft" style={{ marginTop:6, lineHeight:1.6 }}>{w.preview}</p>
              <div style={{ display:'flex', gap:8, marginTop:10 }}>
                <Link className="pb-btn pb-btn-sm" to={presentationPath(w)}>Read</Link>
                <Link className="pb-btn pb-btn-sm pb-btn-ghost" to={`/rehearse/${encodeURIComponent(w.id)}`}><Mic2 size={13}/> Rehearse</Link>
              </div>
            </article>
          ))}
          {localWorks.map((w) => (
            <article key={w.id} className="pb-panel" style={{ padding:'16px 18px' }}>
              <div className="pb-profile-work-author">
                <AuthorCorner author={user?.displayName ?? me.displayName ?? username} username={username} photoURL={user?.photoURL ?? ''} compact />
              </div>
              <Link to={workPath(username, w.slug || w.id, w.folder ?? '')} style={{ fontWeight:700, fontSize:'1.05rem' }}>{w.title}</Link>
              <p className="pb-soft" style={{ marginTop:6, lineHeight:1.6 }}>{w.preview}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
function HandleWork({ username, work }: { username: string; work: { id: string; title: string; preview: string; content: string; category: string; credits?: string; signature?: string; allowCopy?: boolean; author?: string; authorPhotoURL?: string; authorBadges?: string[]; sourceType?: 'person' | 'archive' | 'admin'; sourceName?: string; sourceURL?: string } }) {
  return (
    <article className="pb-panel anim-enter" style={{ padding:'clamp(20px,4vw,40px)' }}>
      <div className="pb-reader-author-row">
        <AuthorCorner author={work.author ?? username} username={username} photoURL={work.authorPhotoURL} badges={work.authorBadges} arrival />
      </div>
      <span className="pb-eyebrow">@{username} · <Link to={`/category/${slugifySegment(work.category)}`}>{work.category}</Link></span>
      <h1
        style={{
          fontSize: 'clamp(1.6rem,4vw,2.4rem)',
          margin: '10px 0',
          viewTransitionName: presentationViewName(work.id),
        }}
      >
        {work.title}
      </h1>
      {work.preview && <p className="pb-soft" style={{ lineHeight:1.65, maxInlineSize:'62ch' }}>{work.preview}</p>}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', margin:'16px 0' }}>
        <Link className="pb-btn pb-btn-ghost" to={`/rehearse/${encodeURIComponent(work.id)}`}><Mic2 size={14} /> Rehearse it</Link>
        <Link className="pb-btn pb-btn-ghost" to={`/${username}`}>More by @{username}</Link>
      </div>
      <Markdown text={work.content} className="pb-prose" />
      {work.credits && <p className="pb-muted" style={{ fontSize:'0.8rem', marginTop:20 }}>Credits: {work.credits}</p>}
      {work.signature && <p style={{ fontFamily:'var(--x-font-display)', fontStyle:'italic', marginTop:10 }}>— {work.signature}</p>}
    </article>
  );
}
function NotFoundHandle({ username, what }: { username: string; what?: string }) {
  return (
    <div className="pb-panel" style={{ padding: 36, textAlign: 'center' }}>
      <h2 style={{ marginBottom: 8 }}>{what ? 'That speech is not here' : 'Profile not found'}</h2>
      <p className="pb-muted" style={{ marginBottom: 16, lineHeight: 1.65 }}>
        {what
          ? <>@{username} has not published anything at this address.</>
          : <>No one holds <strong>@{username}</strong> yet. If it is yours, claim it before someone else climbs with it.</>}
      </p>
      {!what && <Link to="/claim" className="pb-btn pb-btn-primary">Claim @{username}</Link>}
      {what && <Link to={`/${username}`} className="pb-btn">See @{username}</Link>}
    </div>
  );
}

/** The shape a listing needs — both a cloud speech and a local draft have it. */
interface PathListItem { id: string; title: string; preview: string; slug?: string; folder?: string }

/** A folder of one writer's work: /user1/<folder>. */
function HandleFolder({ username, folder, works }: { username: string; folder: string; works: PathListItem[] }) {
  usePageMeta(`@${username}/${folder}`, {
    description: `Writing filed under ${folder} by @${username} on Presentation Buddy.`,
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--l-rhythm)' }}>
      <section className="pb-panel" style={{ padding: 'clamp(18px,3.5vw,26px)' }}>
        <span className="pb-eyebrow">Folder</span>
        <h1 style={{ fontSize: 'clamp(1.4rem,3vw,2rem)', margin: '6px 0' }}>
          <span className="pb-mono">@{username}/{folder}</span>
        </h1>
        <p className="pb-soft" style={{ lineHeight: 1.65 }}>
          {works.length} {works.length === 1 ? 'piece' : 'pieces'} filed here by @{username}.
        </p>
      </section>
      <div style={{ display: 'grid', gap: 12 }}>
        {works.map((w) => (
          <article key={w.id} className="pb-panel" style={{ padding: '16px 18px' }}>
            <Link to={workPath(username, w.slug || w.id, w.folder ?? '')} style={{ fontWeight: 700, fontSize: '1.05rem' }}>
              {w.title}
            </Link>
            <p className="pb-soft" style={{ marginTop: 6, lineHeight: 1.6 }}>{w.preview}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Link className="pb-btn pb-btn-sm" to={presentationPath({ ...w, username })}>Read</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/** What each connection failure means, in words somebody can act on. */
const CLOUD_PROBLEM: Record<string, string> = {
  'not-configured':
    'This build has no database configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), so there is nowhere to record a handle.',
  'no-session': 'The Clerk session was not ready in time — try again in a moment.',
  unauthorized:
    'The database refused the Clerk session token. Postgres has to be told that Clerk is a trusted issuer — Supabase → Authentication → Third-party auth → Clerk — with this instance as the issuer.',
  'server-error':
    'The database answered with an error. Applying supabase/schema.sql is the usual fix; the technical line below names the rest.',
  network: 'The request to the database did not complete — offline, or something is blocking it.',
};

/** /claim — the username lives in Clerk; this page claims it for the site.
 *  • Username set in Clerk's Manage Account → arrives here pre-filled.
 *  • Username typed here → written back into Clerk (Manage Account shows it).
 *  • One username per user, forever: once claimed it can never be changed —
 *    here, in Clerk, or in the database. Both ends enforce it: the server
 *    writes it once through /api/clerk-set-username, and `handles` has a real
 *    unique index. */
export function ClaimPage() {
  usePageMeta('Your username', { robots: 'noindex, follow' });
  const user = useAuth((s) => s.user); const gate = useGate(); const toast = useUi((s) => s.toast);
  const me = useProfile(); const set = useProfile((s) => s.set); const navigate = useNavigate();
  const clerkUsername = normalizeUsername(user?.username ?? '');
  const claimed = me.username || '';
  // What the field starts with: the claimed name, else Clerk's, else blank.
  const [form, setForm] = useState({ username: claimed || clerkUsername || me.username, displayName: me.displayName, bio: me.bio, location: me.location, website: me.website, signature: me.signature });
  const [state, setState] = useState<'idle'|'checking'|'free'|'taken'|'invalid'>('idle'); const [busy, setBusy] = useState(false);
  const bridge = useAuth((s) => s.bridge);
  const [retrying, setRetrying] = useState(false);
  const cloudDown = Boolean(bridge && !bridge.ok);
  const cloudReason = bridge?.reason ? CLOUD_PROBLEM[bridge.reason] : null;
  // The specific words behind the failure — Postgres names the policy it
  // refused, PostgREST names the code. Without this a rejected token reads as
  // "network" and sends everyone looking at the wrong thing.
  const cloudDetail = bridge?.detail ?? null;
  const v = validateUsername(form.username || '___');
  // Clerk username appearing after mount (set in Manage Account) fills the field.
  useEffect(() => { if (!claimed && clerkUsername) setForm((f) => ({ ...f, username: f.username || clerkUsername })); }, [claimed, clerkUsername]);
  useEffect(() => { if (claimed || !form.username) { setState('idle'); return undefined; } const vv = validateUsername(form.username); if (!vv.ok) { setState('invalid'); return undefined; } setState('checking'); const tm = window.setTimeout(() => { void isUsernameAvailable(form.username, user?.uid).then((ok) => setState(ok ? 'free' : 'taken')); }, 400); return () => window.clearTimeout(tm); }, [form.username, user?.uid, claimed]);
  const save = () => gate(async () => {
    setBusy(true);
    try {
      const username = normalizeUsername(claimed || form.username);
      // 1) Clerk first — it is the username's home. Our server does the write
      //    with the secret key, so it still works when Clerk's "Restrict
      //    changes" toggle is on (which is what makes the name immutable).
      //    No-ops when Clerk already holds this exact name.
      if (user?.providerId === 'clerk' && !clerkUsername) {
        const { setClerkUsername } = await import('../services/clerk');
        const outcome = await setClerkUsername(username);
        if (!outcome.ok) throw new Error(outcome.message ?? 'Clerk did not accept that username.');
      }
      // 2) The claim itself: the `handles` row is the lock, `profiles` mirrors
      //    it. Both writes need the session the bridge established. If it is
      //    not up, try once more here — and if it still is not, say what is
      //    wrong rather than letting the write fail as a bare refusal.
      if (user?.providerId === 'clerk' && !useAuth.getState().bridge?.ok) {
        const { retryCloudSession } = await import('../services/clerk');
        const ok = await retryCloudSession();
        if (!ok) {
          const reason = useAuth.getState().bridge?.reason;
          const detail = useAuth.getState().bridge?.detail;
          throw new Error(
            `The site could not open a cloud session, so @${username} cannot be recorded yet. ${
              reason ? CLOUD_PROBLEM[reason] : ''
            }${detail ? ` (${detail})` : ''} The sign-in sheet's environment check names what is missing.`,
          );
        }
      }
      const finalName = await claimUsername(user!.uid, username, form);
      set({ ...form, username: finalName });
      toast(`@${finalName} is yours — ${shortUrl(`/${finalName}`)}`, 'success');
      navigate(`/${finalName}`);
    }
    catch (e) {
      const message = (e as Error).message;
      // The rare race worth naming: Clerk took the name, the database refused
      // it because somebody claimed it a moment earlier. Say exactly that.
      toast(
        /already (taken|claimed)/i.test(message)
          ? `${message} If Clerk already set it on your account, contact amaavrit@yahoo.com so it can be released.`
          : message,
        'error',
      );
    } finally { setBusy(false); }
  }, 'Sign in first — a username has to belong to someone.');
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--l-rhythm)', maxInlineSize:720 }}>
      <section className="pb-panel anim-enter" style={{ padding:'clamp(20px,4vw,32px)' }}>
        <span className="pb-eyebrow"><ShieldCheck size={12} /> Your handle</span>
        <h1 style={{ fontSize:'clamp(1.6rem,3.5vw,2.2rem)', margin:'8px 0' }}>{claimed ? `@${claimed} is yours` : 'Claim your corner of the stage'}</h1>
        <p className="pb-soft" style={{ lineHeight:1.65 }}>One unique username per person — and it can never be changed, so choose the name you want to be introduced by. Everything you publish lives under it: <strong className="pb-mono">{shortUrl(`/${normalizeUsername(claimed || form.username || 'you')}/your-speech`)}</strong>. The path after your name is yours alone, shaped only by your own work.</p>
        {cloudDown && (
          <div className="pb-well" style={{ padding:'12px 14px', marginTop:14, display:'grid', gap:8, borderColor:'var(--c-warn)' }} role="status">
            <strong style={{ fontSize:'0.88rem' }}>One thing is missing before a claim can be recorded</strong>
            <p className="pb-muted" style={{ fontSize:'0.8rem', lineHeight:1.6 }}>
              {cloudReason ?? 'The site has no cloud session, so it cannot write your handle down yet.'}
            </p>
            {cloudDetail && (
              <p className="pb-mono pb-muted" style={{ fontSize:'0.72rem', lineHeight:1.6, wordBreak:'break-word', margin:0 }}>
                {cloudDetail}
              </p>
            )}
            <div>
              <button
                type="button"
                className="pb-btn pb-btn-sm"
                disabled={retrying}
                onClick={() => { setRetrying(true); void import('../services/clerk').then(({ retryCloudSession }) => retryCloudSession()).then((ok) => { setRetrying(false); toast(ok ? 'Cloud session ready — try again.' : 'Still not connected — the sign-in sheet names what is missing.', ok ? 'success' : 'error'); }); }}
              >
                {retrying ? 'Trying…' : 'Try the connection again'}
              </button>
            </div>
          </div>
        )}
        <div style={{ display:'grid', gap:12, marginTop:18 }}>
          <div><label className="pb-label" htmlFor="claim-username">Username *</label><div style={{display:'flex',alignItems:'center',gap:8}}><span className="pb-muted">pb.devs.surf/</span><input id="claim-username" className="pb-input" value={claimed || form.username} disabled={Boolean(claimed)} readOnly={Boolean(claimed)} onChange={(e)=>setForm({...form,username:normalizeUsername(e.target.value)})} placeholder="yourname" autoComplete="off" /></div>
          <p className="pb-muted" style={{fontSize:'0.78rem',marginTop:5}}>{claimed ? 'Locked forever — Clerk itself refuses changes to it. The details below can be edited any time.' : clerkUsername && normalizeUsername(form.username) === clerkUsername ? '✓ Set in your Clerk account — confirm it here and it becomes your address.' : state==='checking' ? 'Checking…' : state==='free' ? '✓ Available — claiming also sets it in your Clerk account.' : state==='taken' ? (clerkUsername && normalizeUsername(form.username) === clerkUsername ? '✗ Your Clerk username is already held by someone else on the site — choose a different name here, and Clerk keeps whichever you confirm.' : '✗ Already taken — try another name.') : state==='invalid' && form.username ? v.error : 'Claiming sets this same username in Clerk (Manage Account).'}</p></div>
          <div><label className="pb-label" htmlFor="claim-name">Display name</label><input id="claim-name" className="pb-input" value={form.displayName} onChange={(e)=>setForm({...form,displayName:e.target.value})} placeholder="What the room should call you" /></div>
          <div><label className="pb-label" htmlFor="claim-bio">Bio</label><textarea id="claim-bio" className="pb-textarea" rows={3} value={form.bio} onChange={(e)=>setForm({...form,bio:e.target.value})} placeholder="What you speak about, and why it matters to you…" /></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
            <div><label className="pb-label" htmlFor="claim-loc">Location</label><input id="claim-loc" className="pb-input" value={form.location} onChange={(e)=>setForm({...form,location:e.target.value})} /></div>
            <div><label className="pb-label" htmlFor="claim-web">Website</label><input id="claim-web" className="pb-input" value={form.website} onChange={(e)=>setForm({...form,website:e.target.value})} placeholder="yoursite.com" /></div>
          </div>
          <div><label className="pb-label" htmlFor="claim-sig">Signature</label><input id="claim-sig" className="pb-input" value={form.signature} onChange={(e)=>setForm({...form,signature:e.target.value})} placeholder="The line you sign your speeches with" /></div>
          <div><button type="button" className="pb-btn pb-btn-primary pb-btn-lg" disabled={busy || state==='taken' || state==='invalid' || !(claimed || form.username)} onClick={save}><Feather size={16} /> {claimed ? 'Save the details I share' : clerkUsername ? 'Confirm & claim my username' : 'Claim my username'}</button></div>
        </div>
      </section>
    </div>
  );
}
