import { useEffect, useState } from 'react';
import { Star, X } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useUi } from '../store/ui';
import { submitFeedback, flushFeedbackQueue } from '../services/profiles';
const KEY = 'pb.feedback.last';
/** Central feedback (2.6): appears at a random, unhurried moment — never in
 * the first minutes, never more than once a fortnight, never mid-rehearsal.
 * Stars first, words second. Saved to the `feedback` table (queued locally
 * when the cloud is off). */
export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0); const [hover, setHover] = useState(0);
  const [text, setText] = useState(''); const [sent, setSent] = useState(false);
  const user = useAuth((s) => s.user); const toast = useUi((s) => s.toast);
  useEffect(() => { void flushFeedbackQueue(); }, []);
  useEffect(() => {
    let last = 0; try { last = Number(localStorage.getItem(KEY) ?? 0); } catch { /* ignore */ }
    if (Date.now() - last < 14 * 24 * 3600_000) return undefined;
    const delay = 90_000 + Math.random() * 150_000; // random moment, 1.5–4 min in
    const t = window.setTimeout(() => { if (!location.pathname.startsWith('/rehearse')) setOpen(true); }, delay);
    return () => window.clearTimeout(t);
  }, []);
  if (!open) return null;
  const close = () => { setOpen(false); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } };
  return (
    <div className="pb-overlay" role="dialog" aria-modal="true" aria-label="Your feedback develops this website" onClick={close}>
      <div className="pb-modal pb-feedback" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pb-icon-btn pb-feedback-x" onClick={close} aria-label="Close feedback"><X size={16} /></button>
        {sent ? (<><h2>Thank you. Truly.</h2><p className="pb-soft">Your feedback develops this website — it is read, kept, and built on.</p><button type="button" className="pb-btn pb-btn-primary" onClick={close}>Back to my words</button></>)
        : (<>
          <span className="pb-eyebrow">Your feedback develops this website</span>
          <h2 style={{ margin: '8px 0 6px' }}>How is Presentation Buddy doing?</h2>
          <p className="pb-soft">Rate it honestly. Then, if you have ten seconds more, tell us the one thing we should fix or build next.</p>
          <div className="pb-stars" role="radiogroup" aria-label="Rate out of 5 stars">
            {[1,2,3,4,5].map((n) => (<button key={n} type="button" role="radio" aria-checked={rating===n} aria-label={`${n} star${n>1?'s':''}`} onMouseEnter={()=>setHover(n)} onMouseLeave={()=>setHover(0)} onClick={()=>setRating(n)}><Star size={34} fill={(hover||rating)>=n ? 'var(--c-accent2, #e8a317)' : 'none'} color={(hover||rating)>=n ? 'var(--c-accent2, #e8a317)' : 'var(--c-ink-muted)'} /></button>))}
          </div>
          <textarea className="pb-textarea" value={text} onChange={(e)=>setText(e.target.value)} rows={4} placeholder="The one thing I wish Presentation Buddy did…" aria-label="Your feedback" />
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button type="button" className="pb-btn pb-btn-primary" disabled={!rating} onClick={async()=>{ const where = await submitFeedback(user?.uid ?? null, rating, text.trim()); setSent(true); try{localStorage.setItem(KEY,String(Date.now()));}catch{/*ignore*/} toast(where==='cloud' ? 'Feedback saved — thank you' : 'Feedback kept on this device — thank you','success'); }}>Send feedback</button>
            <button type="button" className="pb-btn pb-btn-ghost" onClick={close}>Not now</button>
          </div>
        </>)}
      </div>
    </div>
  );
}
