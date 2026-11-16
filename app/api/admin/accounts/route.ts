import { createClerkClient } from '@clerk/backend';
import { normalizeUsername, RESERVED_HANDLES, validateUsername } from '@/lib/identity';
import { isAdministrator, PresentationError, verifyClerkRequest } from '@/server/presentations';
import { serverEnv, serverEnvAny } from '@/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLERK_SECRET_KEY = serverEnv('CLERK_SECRET_KEY');
const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const recent = new Map<string, { count: number; resetsAt: number }>();

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Authorization' },
  });
}

function limited(uid: string): boolean {
  const now = Date.now();
  const entry = recent.get(uid);
  if (!entry || now >= entry.resetsAt) {
    recent.set(uid, { count: 1, resetsAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 6;
}

function safeHttps(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const raw = value.trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') throw new Error();
    return url.toString().slice(0, 1000);
  } catch {
    throw new Error(`${label} must be a full https:// URL.`);
  }
}

async function createSupabaseAccount(identityToken: string, values: {
  uid: string;
  handle: string;
  email: string;
  displayName: string;
  slug: string;
  logoURL: string;
  bio: string;
  canonicalURL: string;
}) {
  const url = new URL('/rest/v1/rpc/admin_create_official_account', SUPABASE_URL);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${identityToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      p_uid: values.uid,
      p_handle: values.handle,
      p_email: values.email,
      p_display_name: values.displayName,
      p_slug: values.slug,
      p_logo_url: values.logoURL,
      p_bio: values.bio,
      p_canonical_url: values.canonicalURL,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
    throw new Error(detail || `Supabase refused the official account (${response.status}).`);
  }
}

export async function POST(request: Request) {
  if (!CLERK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(503, { error: 'account_provisioning_unavailable', message: 'Clerk or Supabase account provisioning is not configured.' });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 12_000) return json(413, { error: 'request_too_large' });

  let identity;
  try {
    identity = await verifyClerkRequest(request);
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    return json(status, { error: 'unauthorized', message: status === 401 ? 'Sign in again to use the admin workspace.' : 'Account provisioning is unavailable.' });
  }
  if (!await isAdministrator(identity)) return json(403, { error: 'forbidden' });
  if (limited(identity.uid)) return json(429, { error: 'rate_limited', message: 'Wait a minute before creating more source accounts.' });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json(400, { error: 'invalid_json' }); }

  const rawHandle = typeof body.handle === 'string' ? body.handle : '';
  const checkedHandle = validateUsername(rawHandle);
  const handle = normalizeUsername(checkedHandle.username);
  if (!checkedHandle.ok || RESERVED_HANDLES.has(handle)) {
    return json(400, { error: 'invalid_handle', message: checkedHandle.error ?? 'That handle is reserved for a site page.' });
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return json(400, { error: 'invalid_slug', message: 'Use 2–60 lowercase letters, numbers or single hyphens for the official slug.' });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'invalid_email', message: 'Enter a contact email for the new Clerk identity.' });
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 80) : '';
  if (!displayName) return json(400, { error: 'invalid_name', message: 'A display name is required.' });
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 500) : '';
  let logoURL = '';
  let canonicalURL = '';
  try {
    logoURL = safeHttps(body.logoURL, 'Logo URL');
    canonicalURL = safeHttps(body.canonicalURL, 'Canonical URL');
  } catch (error) {
    return json(400, { error: 'invalid_url', message: (error as Error).message });
  }

  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
  let createdUid = '';
  try {
    const created = await clerk.users.createUser({
      emailAddress: [email],
      emailAddressIdentificationStatus: ['reserved'],
      username: handle,
      firstName: displayName,
      skipPasswordRequirement: true,
      publicMetadata: { presentationBuddy: { kind: 'official', slug } },
    });
    createdUid = created.id;
    await createSupabaseAccount(identity.token, {
      uid: createdUid,
      handle,
      email,
      displayName,
      slug,
      logoURL,
      bio,
      canonicalURL,
    });
    return json(201, { ok: true, uid: createdUid, handle, slug });
  } catch (error) {
    if (createdUid) {
      try { await clerk.users.deleteUser(createdUid); }
      catch { /* If Clerk is temporarily unreachable, report the orphan for cleanup. */ }
    }
    const detail = (error as Error).message ?? '';
    const conflict = /already exists|duplicate|unique|taken/i.test(detail);
    return json(conflict ? 409 : 502, {
      error: conflict ? 'account_conflict' : 'account_creation_failed',
      message: conflict ? 'That email, Clerk handle or source slug already exists.' : 'The official identity could not be provisioned. Check the workspace setup and try again.',
    });
  }
}

export async function GET() { return json(405, { error: 'method_not_allowed' }); }
export async function PUT() { return json(405, { error: 'method_not_allowed' }); }
export async function PATCH() { return json(405, { error: 'method_not_allowed' }); }
export async function DELETE() { return json(405, { error: 'method_not_allowed' }); }
