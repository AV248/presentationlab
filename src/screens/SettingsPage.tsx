'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Link } from '@/lib/router';
import { Save, UserRound } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useProfile } from '../store/profile';
import { useUi } from '../store/ui';
import { fetchOwnProfile, updateOwnProfile } from '../services/profiles';
import { usePageMeta } from '../lib/usePageMeta';

interface Details {
  displayName: string;
  bio: string;
  location: string;
  website: string;
  signature: string;
}

const EMPTY: Details = { displayName: '', bio: '', location: '', website: '', signature: '' };

export function SettingsPage() {
  usePageMeta('Profile settings · Presentation Buddy', {
    description: 'Edit the public profile details attached to your Presentation Buddy account.',
    robots: 'noindex, nofollow',
  });

  const user = useAuth((state) => state.user);
  const ready = useAuth((state) => state.ready);
  const openSignIn = useUi((state) => state.openSignIn);
  const toast = useUi((state) => state.toast);
  const profile = useProfile();
  const setProfile = useProfile((state) => state.set);
  const [form, setForm] = useState<Details>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      displayName: profile.displayName || user.displayName || '',
      bio: profile.bio,
      location: profile.location,
      website: profile.website,
      signature: profile.signature,
    });
    let alive = true;
    setLoading(true);
    void fetchOwnProfile(user.uid).then((publicProfile) => {
      if (!alive || !publicProfile) return;
      const next = {
        displayName: publicProfile.displayName || user.displayName || '',
        bio: publicProfile.bio,
        location: publicProfile.location,
        website: publicProfile.website,
        signature: publicProfile.signature,
      };
      setForm(next);
      setProfile({ username: publicProfile.username, ...next });
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user, profile.displayName, profile.bio, profile.location, profile.website, profile.signature, setProfile]);

  const change = (field: keyof Details, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const clean = await updateOwnProfile(user.uid, form);
      setProfile({ ...clean, username: profile.username });
      toast('Your profile details are saved.', 'success');
    } catch (error) {
      toast((error as Error).message || 'Profile changes could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <div className="pb-page pb-narrow"><p className="pb-muted">Checking your sign-in…</p></div>;
  if (!user) {
    return (
      <div className="pb-page pb-narrow">
        <section className="pb-panel" style={{ padding: 24 }}>
          <h1 className="pb-page-title">Profile settings</h1>
          <p className="pb-muted" style={{ lineHeight: 1.7, margin: '8px 0 16px' }}>Sign in to edit the details shown on your public profile.</p>
          <button className="pb-btn pb-btn-primary" type="button" onClick={() => openSignIn('Sign in to edit your profile.')}>Sign in</button>
        </section>
      </div>
    );
  }

  return (
    <div className="pb-page pb-narrow">
      <header className="pb-page-head">
        <span className="pb-eyebrow"><UserRound size={13} /> Account</span>
        <h1 className="pb-page-title">Your profile</h1>
        <p className="pb-page-sub">The details you choose to share beside your public work. Your email and sign-in credentials are not shown.</p>
      </header>
      <form className="pb-panel" onSubmit={submit} style={{ display: 'grid', gap: 14, padding: 'clamp(18px, 4vw, 26px)' }}>
        <div>
          <label className="pb-label" htmlFor="profile-display-name">Display name</label>
          <input id="profile-display-name" className="pb-input" maxLength={80} value={form.displayName} onChange={(event) => change('displayName', event.target.value)} placeholder="What the room should call you" />
        </div>
        <div>
          <label className="pb-label" htmlFor="profile-bio">Bio</label>
          <textarea id="profile-bio" className="pb-textarea" maxLength={500} rows={5} value={form.bio} onChange={(event) => change('bio', event.target.value)} placeholder="What you speak about, and why it matters to you…" />
          <span className="pb-muted" style={{ fontSize: '0.72rem' }}>{form.bio.length}/500</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12 }}>
          <div>
            <label className="pb-label" htmlFor="profile-location">Location</label>
            <input id="profile-location" className="pb-input" maxLength={100} value={form.location} onChange={(event) => change('location', event.target.value)} placeholder="City, country (optional)" />
          </div>
          <div>
            <label className="pb-label" htmlFor="profile-website">Website</label>
            <input id="profile-website" className="pb-input" maxLength={200} type="url" value={form.website} onChange={(event) => change('website', event.target.value)} placeholder="https://example.com" />
          </div>
        </div>
        <div>
          <label className="pb-label" htmlFor="profile-signature">Signature</label>
          <input id="profile-signature" className="pb-input" maxLength={120} value={form.signature} onChange={(event) => change('signature', event.target.value)} placeholder="A line you sign your speeches with" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="pb-btn pb-btn-primary" disabled={busy || loading}>
            <Save size={15} /> {busy ? 'Saving…' : loading ? 'Loading…' : 'Save profile'}
          </button>
          {profile.username && <Link className="pb-btn pb-btn-ghost" to={`/${encodeURIComponent(profile.username)}`}>View public profile</Link>}
        </div>
        <p className="pb-muted" style={{ fontSize: '0.76rem', lineHeight: 1.6, margin: 0 }}>
          Your username is permanent. Name, bio, location, website and signature can be changed here whenever you need.
        </p>
      </form>
    </div>
  );
}
