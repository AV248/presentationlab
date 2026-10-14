import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AtSign, Feather, Link2, MapPin, Mic2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useProfile } from '../store/profile';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useGate } from '../components/SignIn';
import { validateUsername, normalizeUsername, RESERVED_HANDLES } from '../lib/identity';
import { claimUsername, fetchHandleState, fetchProfile, isUsernameAvailable, type PublicProfile } from '../services/profiles';
import { fetchSpeechesByUsername, type CloudSpeech } from '../services/data';
import { shortUrl } from '../lib/share';
import { copyText } from '../lib/platform';
import { usePageMeta } from '../lib/seo';
import { Markdown } from '../components/Markdown';

/** /:username — everything about a person and their work.
 *  /:username/:slug — one of their creations, at their own address. */
export function HandlePage() {
  const { username: raw, slug } = useParams<{ username: string; slug?: string }>();
  const username = normalizeUsername(raw ?? '');
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [works, setWorks] = useState<CloudSpeech[]>([]);
  const [handleState, setHandleState] = useState<'held' | 'free' | 'unknown' | null>(null);
  const [loaded, setLoaded] = useState(false);
  const me = useProfile(); const user = useAuth((s) => s.user);
  const mine = useLibrary((s) => s.mine);
  const isMine = Boolean(username) && me.username === username;
  usePageMeta(profile ? `${profile.displayName} (@${username})` : `@${username}`, { description: profile?.bio || `Speeches and work by @${username} on Presentation Buddy.`, robots: profile || isMine ? undefined : 'noindex, follow' });
  useEffect(() => { let alive = true; void (async () => {
    const state = await fetchHandleState(username);
    const p = await fetchProfile(username);
    const w = await fetchSpeechesByUsername(username);
    if (!alive) return; setHandleState(state); setProfile(p); setWorks(w); setLoaded(true);
  })(); return () => { alive = false; }; }, [username]);
  const localWorks = useMemo(() => isMine ? mine.filter((m) => m.status === 'published') : [], [isMine, mine]);
  if (RESERVED_HANDLES.has(username)) return <NotFoundHandle username={username} />;
  if (slug) {
    const work = works.find((w) => (w.slug || '') === slug || w.id === slug)
      ?? localWorks.find((w) => (w.slug || '') === slug || w.id === slug);
    if (work) return <HandleWork username={username} work={work} />;
    if ((loaded || isMine) && !work) return <NotFoundHandle username={username} what="speech" />;
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

  const display = profile ?? (isMine ? { username, uid: user?.uid ?? '', displayName: me.displayName || username, bio: me.bio, location: me.location, website: me.website, signature: me.signature, createdAt: '' } : null);
  if (!display) return <p className="pb-muted" style={{ padding: 24 }}>Opening @{username}…</p>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding:'clamp(20px,4vw,36px)' }}>
        <span className="pb-eyebrow"><AtSign size={12} /> {username}</span>
        <h1 style={{ fontSize:'clamp(1.7rem,4vw,2.5rem)', margin:'8px 0' }}>{display?.displayName ?? `@${username}`}</h1>
        {display.bio
          ? <p className="pb-soft" style={{ maxInlineSize: '62ch', lineHeight: 1.65 }}>{display.bio}</p>
          : <p className="pb-muted">{isMine ? 'No introduction yet — add a bio from Control and it appears here.' : 'No introduction yet.'}</p>}
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:12 }} className="pb-muted">
          {display?.location && <span><MapPin size={13} style={{display:'inline',verticalAlign:'-2px'}} /> {display.location}</span>}
          {display?.website && <a href={display.website.startsWith('http') ? display.website : `https://${display.website}`} target="_blank" rel="noopener noreferrer"><Link2 size={13} style={{display:'inline',verticalAlign:'-2px'}} /> {display.website}</a>}
          <span>{works.length + localWorks.length} published</span>
        </div>
        {display?.signature && <p style={{ fontFamily:'var(--x-font-display)', fontStyle:'italic', marginTop:14 }}>— {display.signature}</p>}
        <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
          <button type="button" className="pb-btn" onClick={() => void copyText(shortUrl(`/${username}`))}>Copy {shortUrl(`/${username}`)}</button>
          {isMine && <Link to="/control" className="pb-btn pb-btn-ghost">Edit your profile</Link>}
        </div>
      </section>
      <section>
        <h2 style={{ fontSize:'1.1rem', marginBottom:12 }}>Their work</h2>
        {[...works, ...localWorks].length === 0 && <div className="pb-panel" style={{ padding:24 }}><p className="pb-muted">{loaded || !isMine ? 'Nothing published here yet.' : 'Publish from the Writing Desk and it will live at this address.'}</p></div>}
        <div style={{ display:'grid', gap:10 }}>
          {works.map((w) => (<article key={w.id} className="pb-panel" style={{ padding:'16px 18px' }}><Link to={`/${username}/${w.slug || w.id}`} style={{ fontWeight:700, fontSize:'1.05rem' }}>{w.title}</Link><p className="pb-soft" style={{ marginTop:6, lineHeight:1.6 }}>{w.preview}</p><div style={{ display:'flex', gap:8, marginTop:10 }}><Link className="pb-btn pb-btn-sm" to={`/read/${w.id}`}>Read</Link><Link className="pb-btn pb-btn-sm pb-btn-ghost" to={`/rehearse/${w.id}`}><Mic2 size={13}/> Rehearse</Link></div></article>))}
          {localWorks.map((w) => (<article key={w.id} className="pb-panel" style={{ padding:'16px 18px' }}><Link to={`/${username}/${w.slug || w.id}`} style={{ fontWeight:700, fontSize:'1.05rem' }}>{w.title}</Link><p className="pb-soft" style={{ marginTop:6, lineHeight:1.6 }}>{w.preview}</p></article>))}
        </div>
      </section>
    </div>
  );
}
function HandleWork({ username, work }: { username: string; work: { id: string; title: string; preview: string; content: string; category: string; credits?: string; signature?: string; allowCopy?: boolean } }) {
  const toast = useUi((s) => s.toast);
  const url = shortUrl(`/${username}/${(work as { slug?: string }).slug ?? work.id}`);
  const protectedWork = work.allowCopy === false;
  return (
    <article className={`pb-panel anim-enter${protectedWork ? ' pb-protected' : ''}`} style={{ padding:'clamp(20px,4vw,40px)' }}
      onCopy={protectedWork ? (e) => { e.preventDefault(); toast('© This work is protected by its writer.', 'warn'); } : undefined}
      onContextMenu={protectedWork ? (e) => e.preventDefault() : undefined}>
      <span className="pb-eyebrow">@{username} · {work.category}</span>
      <h1 style={{ fontSize:'clamp(1.6rem,4vw,2.4rem)', margin:'10px 0' }}>{work.title}</h1>
      {work.preview && <p className="pb-soft" style={{ lineHeight:1.65, maxInlineSize:'62ch' }}>{work.preview}</p>}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', margin:'16px 0' }}>
        <button type="button" className="pb-btn" onClick={async () => { const ok = await copyText(url); toast(ok ? url : 'Copy failed', ok ? 'success' : 'error'); }}>Copy {url}</button>
        <Link className="pb-btn pb-btn-ghost" to={`/rehearse/${work.id}`}><Mic2 size={14} /> Rehearse it</Link>
        <Link className="pb-btn pb-btn-ghost" to={`/${username}`}>More by @{username}</Link>
      </div>
      <Markdown text={work.content} className="pb-prose" />
      {work.credits && <p className="pb-muted" style={{ fontSize:'0.8rem', marginTop:20 }}>Credits: {work.credits}</p>}
      {work.signature && <p style={{ fontFamily:'var(--x-font-display)', fontStyle:'italic', marginTop:10 }}>— {work.signature}</p>}
      {protectedWork && <p className="pb-chip" style={{ marginTop:14 }}>© Protected by the writer — read & rehearse here, share the link</p>}
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

/** What each token-exchange failure means, in words somebody can act on. */
const CLOUD_PROBLEM: Record<string, string> = {
  'not-configured': 'Firebase is not configured for this build, so there is nowhere to record a handle.',
  'no-session': 'The Clerk session was not ready in time — try again in a moment.',
  'endpoint-missing': 'The API half of the deployment is missing: /api/clerk-firebase-token answered 404.',
  'server-misconfigured':
    'The token endpoint is deployed but not configured — it answered 501, and its message names the variable (CLERK_SECRET_KEY or FIREBASE_SERVICE_ACCOUNT_JSON).',
  unauthorized: 'The token endpoint refused the request (401) — check that CLERK_AUTHORIZED_PARTIES lists this exact origin.',
  'server-error': 'The token endpoint answered with an error. The deployment logs will have the detail.',
  network: 'The request to the token endpoint did not complete — offline, or something is blocking /api.',
};

/** /claim — the username lives in Clerk; this page claims it for the site.
 *  • Username set in Clerk's Manage Account → arrives here pre-filled.
 *  • Username typed here → written back into Clerk (Manage Account shows it).
 *  • One username per user, forever: once claimed it can never be changed,
 *    here, in Clerk sync, or in Firestore (claimUsername enforces it). */
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
      // 2) Firestore claim: handles/{username} lock + users/{uid} profile.
      //    That write needs a cloud session (Clerk traded for a Firebase
      //    token). If it is not up, try once more here — and if it still is
      //    not, say what is wrong rather than letting the write fail as a
      //    bare "insufficient permissions".
      if (user?.providerId === 'clerk' && !useAuth.getState().bridge?.ok) {
        const { retryCloudSession } = await import('../services/clerk');
        const ok = await retryCloudSession();
        if (!ok) {
          const reason = useAuth.getState().bridge?.reason;
          throw new Error(
            `The site could not open a cloud session, so @${username} cannot be recorded yet. ${
              reason ? CLOUD_PROBLEM[reason] : ''
            } The sign-in sheet's environment check names what is missing.`,
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
      // The rare race worth naming: Clerk took the name, Firestore refused it
      // because somebody claimed it a moment earlier. Say exactly that.
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
