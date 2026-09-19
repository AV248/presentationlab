/**
 * Firebase bootstrap.
 *
 * The SDK is loaded lazily — only when someone signs in or the library asks
 * for cloud speeches — so the first paint of the app never pays for it.
 * If the environment variables are missing, every function here resolves to
 * "not configured" and the app stays fully local.
 */

const env = import.meta.env ?? ({} as ImportMetaEnv);

const API_KEY = (env.VITE_FIREBASE_API_KEY as string | undefined)?.trim();
const PROJECT_ID = (env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim();

export const FIREBASE_ENABLED = Boolean(API_KEY && PROJECT_ID);
export const FIREBASE_PROJECT = PROJECT_ID ?? null;

/* Minimal structural types so we don't pull Firebase types into every file. */
export interface AuthProviderLike {
  setCustomParameters?: (params: Record<string, string>) => void;
}

export interface FirebaseAuthLike {
  currentUser: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null } | null;
}

export interface FirebaseBundle {
  auth: unknown;
  db: unknown;
  signInWithPopup: (auth: unknown, provider: unknown) => Promise<{ user: Record<string, unknown> }>;
  signInWithRedirect: (auth: unknown, provider: unknown) => Promise<void>;
  getRedirectResult: (auth: unknown) => Promise<{ user?: Record<string, unknown> } | null>;
  signOut: (auth: unknown) => Promise<void>;
  onAuthStateChanged: (auth: unknown, next: (user: Record<string, unknown> | null) => void) => () => void;
  GoogleAuthProvider: new () => AuthProviderLike;
  OAuthProvider: new (id: string) => AuthProviderLike;
  fs: {
    doc: (db: unknown, path: string, ...rest: string[]) => unknown;
    collection: (db: unknown, path: string) => unknown;
    getDoc: (ref: unknown) => Promise<{ exists: () => boolean; id: string; data: () => Record<string, unknown> | undefined }>;
    getDocs: (query: unknown) => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }>;
    setDoc: (ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
    updateDoc: (ref: unknown, data: Record<string, unknown>) => Promise<void>;
    deleteDoc: (ref: unknown) => Promise<void>;
    addDoc: (col: unknown, data: Record<string, unknown>) => Promise<{ id: string }>;
    increment: (n: number) => unknown;
    serverTimestamp: () => unknown;
    query: (col: unknown, ...constraints: unknown[]) => unknown;
    where: (field: string, op: string, value: unknown) => unknown;
    orderBy: (field: string, dir?: 'asc' | 'desc') => unknown;
    limit: (n: number) => unknown;
    runTransaction: <T>(db: unknown, fn: (tx: TransactionLike) => Promise<T>) => Promise<T>;
    Timestamp: { fromDate: (d: Date) => unknown };
  };
}

export interface TransactionLike {
  get: (
    ref: unknown,
  ) => Promise<{ exists: () => boolean; data: () => Record<string, unknown> | undefined }>;
  set: (ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
  update: (ref: unknown, data: Record<string, unknown>) => void;
  delete: (ref: unknown) => void;
}

let bundlePromise: Promise<FirebaseBundle | null> | null = null;

export function loadFirebase(): Promise<FirebaseBundle | null> {
  if (!FIREBASE_ENABLED) return Promise.resolve(null);
  if (bundlePromise) return bundlePromise;

  bundlePromise = (async () => {
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]);

    const app = initializeApp({
      apiKey: API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
      projectId: PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
      appId: env.VITE_FIREBASE_APP_ID as string,
      measurementId: env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
    });

    return {
      auth: authMod.getAuth(app),
      db: fsMod.getFirestore(app),
      signInWithPopup: authMod.signInWithPopup as unknown as FirebaseBundle['signInWithPopup'],
      signInWithRedirect: authMod.signInWithRedirect as unknown as FirebaseBundle['signInWithRedirect'],
      getRedirectResult: authMod.getRedirectResult as unknown as FirebaseBundle['getRedirectResult'],
      signOut: authMod.signOut as unknown as FirebaseBundle['signOut'],
      onAuthStateChanged: authMod.onAuthStateChanged as FirebaseBundle['onAuthStateChanged'],
      GoogleAuthProvider: authMod.GoogleAuthProvider as unknown as FirebaseBundle['GoogleAuthProvider'],
      OAuthProvider: authMod.OAuthProvider as unknown as FirebaseBundle['OAuthProvider'],
      fs: {
        doc: fsMod.doc as FirebaseBundle['fs']['doc'],
        collection: fsMod.collection as FirebaseBundle['fs']['collection'],
        getDoc: fsMod.getDoc as FirebaseBundle['fs']['getDoc'],
        getDocs: fsMod.getDocs as unknown as FirebaseBundle['fs']['getDocs'],
        setDoc: fsMod.setDoc as FirebaseBundle['fs']['setDoc'],
        updateDoc: fsMod.updateDoc as FirebaseBundle['fs']['updateDoc'],
        deleteDoc: fsMod.deleteDoc as FirebaseBundle['fs']['deleteDoc'],
        addDoc: fsMod.addDoc as unknown as FirebaseBundle['fs']['addDoc'],
        increment: fsMod.increment as FirebaseBundle['fs']['increment'],
        serverTimestamp: fsMod.serverTimestamp as FirebaseBundle['fs']['serverTimestamp'],
        query: fsMod.query as FirebaseBundle['fs']['query'],
        where: fsMod.where as FirebaseBundle['fs']['where'],
        orderBy: fsMod.orderBy as FirebaseBundle['fs']['orderBy'],
        limit: fsMod.limit as FirebaseBundle['fs']['limit'],
        runTransaction: fsMod.runTransaction as FirebaseBundle['fs']['runTransaction'],
        Timestamp: fsMod.Timestamp as unknown as FirebaseBundle['fs']['Timestamp'],
      },
    } satisfies FirebaseBundle;
  })();

  return bundlePromise;
}

export class NotConfiguredError extends Error {
  constructor() {
    super('Firebase is not configured on this installation.');
    this.name = 'NotConfiguredError';
  }
}
