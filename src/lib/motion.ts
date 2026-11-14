import { RESERVED_HANDLES } from './identity';

export type MotionRoom =
  | 'library'
  | 'read'
  | 'write'
  | 'rehearse'
  | 'arrivals'
  | 'themes'
  | 'author'
  | 'admin'
  | 'other';

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => { finished?: Promise<unknown> };
};

/** Resolve the physical room represented by a URL without inspecting content. */
export function motionRoom(pathname: string): MotionRoom {
  const path = pathname.split(/[?#]/, 1)[0] || '/';
  if (path === '/') return 'library';
  if (path === '/read' || path.startsWith('/read/')) return 'read';
  if (path === '/write' || path.startsWith('/write/')) return 'write';
  if (path === '/rehearse' || path.startsWith('/rehearse/')) return 'rehearse';
  if (path === '/arrivals' || path.startsWith('/arrivals/')) return 'arrivals';
  if (path === '/themes' || path.startsWith('/themes/')) return 'themes';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';

  const first = path.split('/').filter(Boolean)[0]?.toLowerCase();
  if (first && !RESERVED_HANDLES.has(first)) return 'author';
  return 'other';
}

function motionIsReduced(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  return document.documentElement.dataset.reducedMotion === 'true'
    || (typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Run a DOM update inside the native View Transition API when available. The
 * caller owns the ordinary navigation/state update as the unsupported-browser
 * fallback. Reduced motion always takes that plain path.
 */
function pathOnly(value: string): string {
  try {
    return new URL(value, window.location.href).pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] || '/';
  }
}

function startNamedTransition(
  attribute: 'routeTransition' | 'localTransition',
  key: string,
  update: () => void,
): boolean {
  if (typeof document === 'undefined' || motionIsReduced()) return false;
  const root = document.documentElement;
  const start = (document as ViewTransitionDocument).startViewTransition;
  if (!start) return false;
  root.dataset[attribute] = key;
  try {
    const transition = start.call(document, update);
    const clear = () => {
      if (root.dataset[attribute] === key) delete root.dataset[attribute];
    };
    if (transition.finished) void transition.finished.then(clear, clear);
    return true;
  } catch {
    if (root.dataset[attribute] === key) delete root.dataset[attribute];
    return false;
  }
}

export function startSpatialTransition(
  fromPath: string,
  toPath: string,
  update: () => void,
): boolean {
  if (typeof window === 'undefined' || pathOnly(fromPath) === pathOnly(toPath)) return false;
  return startNamedTransition(
    'routeTransition',
    `${motionRoom(fromPath)}-to-${motionRoom(toPath)}`,
    update,
  );
}

/** Native, interruptible geometry transition for a single stateful room. */
export function startElementTransition(name: string, update: () => void): boolean {
  return startNamedTransition('localTransition', name, update);
}

/** Stable, valid custom-ident for matching a work card to its reading room. */
export function presentationViewName(id: string): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return `pb-work-${(hash >>> 0).toString(36)}`;
}
