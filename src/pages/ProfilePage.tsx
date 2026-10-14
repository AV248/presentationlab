import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AtSign, Feather, Link2, MapPin, Mic2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useProfile } from '../store/profile';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useGate } from '../components/SignIn';
import { validateUsername, normalizeUsername, RESERVED_HANDLES } from '../lib/identity';
import { claimUsername, fetchProfile, isUsernameAvailable, type PublicProfile } from '../services/profiles';
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
  const [loaded, setLoaded] = useState(false);
  const me = useProfile(); const user = useAuth((s) => s.user);
  const mine = useLibrary((s) => s.mine);
  const isMine = Boolean(username) && me.username === username;
  usePageMeta(profile ? `${profile.displayName} (@${username})` : `@${username}`, { description: profile?.bio || `Speeches and work by @${username} on Presentation Buddy.`, robots: profile || isMine ? undefined : 'noindex, follow' });
  useEffect(() => { let alive = true; void (async () => {
    const p = await fetchProfile(username);
    const w = await fetchSpeechesByUsername(username);
    if (!alive) return; setProfile(p); setWorks(w); setLoaded(true);
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
  const display = profile ?? (isMine ? { username, uid: user?.uid ?? '', displayName: me.displayName || username, bio: me.bio, location: me.location, website: me.website, signature: me.signature, createdAt: '' } : null);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--l-rhythm)' }}>
      <section className="pb-panel anim-enter" style={{ padding:'clamp(20px,4vw,36px)' }}>
        <span className="pb-eyebrow"><AtSign size={12} /> {username}</span>
        <h1 style={{ fontSize:'clamp(1.7rem,4vw,2.5rem)', margin:'8px 0' }}>{display?.displayName ?? `@${username}`}</h1>
        {display?.bio ? <p className="pb-soft" style={{ maxInlineSize:'62ch', lineHeight:1.65 }}>{display.bio}</p> : <p className="pb-muted">This stage is claimed. The speeches below are theirs alone.</p>}
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
function NotFoundHandle({ username, what }: { username: string; what?: string }) { return (<div className="pb-panel" style={{ padding:36, textAlign:'center' }}><h2 style={{ marginBottom:8 }}>{what ? 'That speech is not here' : 'No one holds this handle yet'}</h2><p className="pb-muted" style={{ marginBottom:16 }}>@{username} {what ? 'has not published it at this address.' : 'is free. If it is yours, claim it before someone else climbs with it.'}</p><Link to="/claim" className="pb-btn pb-btn-primary">Claim a username</Link></div>); }

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
        <div style={{ display:'grid', gap:12, marginTop:18 }}>
          <div><label className="pb-label" htmlFor="claim-username">Username *</label><div style={{display:'flex',alignItems:'center',gap:8}}><span className="pb-muted">pb.devs.surf/</span><input id="claim-username" className="pb-input" value={claimed || form.username} disabled={Boolean(claimed)} readOnly={Boolean(claimed)} onChange={(e)=>setForm({...form,username:normalizeUsername(e.target.value)})} placeholder="yourname" autoComplete="off" /></div>
          <p className="pb-muted" style={{fontSize:'0.78rem',marginTop:5}}>{claimed ? 'Locked forever — Clerk itself refuses changes to it. The details below can be edited any time.' : clerkUsername && normalizeUsername(form.username) === clerkUsername ? '✓ Set in your Clerk account — confirm it here and it becomes your address.' : state==='checking' ? 'Checking…' : state==='free' ? '✓ Available — claiming also sets it in your Clerk account.' : state==='taken' ? '✗ Already taken' : state==='invalid' && form.username ? v.error : 'Claiming sets this same username in Clerk (Manage Account).'}</p></div>
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
