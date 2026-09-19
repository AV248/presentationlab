/** Device, capability and platform helpers used across the app. */

export type Platform = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'unknown';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports as Macintosh but has touch.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

export const isTouch = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true);

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** ⌘K on Apple platforms, Ctrl+K everywhere else. */
export function modifierLabel(): string {
  return detectPlatform() === 'mac' || detectPlatform() === 'ios' ? '⌘' : 'Ctrl';
}

export function isApple(): boolean {
  const p = detectPlatform();
  return p === 'mac' || p === 'ios';
}

export function isMobileWidth(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 760;
}

/** Copy text with a fallback for insecure contexts / older browsers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function downloadFile(filename: string, contents: string, mime = 'text/plain') {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareOrCopy(title: string, text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  const target = url ?? (typeof window !== 'undefined' ? window.location.href : '');
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url: target });
      return 'shared';
    } catch {
      /* user dismissed or unsupported payload */
    }
  }
  const ok = await copyText(`${title}\n\n${text}\n\n${target}`);
  return ok ? 'copied' : 'failed';
}

export function supportsSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function supportsDictation(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function supportsWakeLock(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/** Keep the screen awake during a rehearsal (best effort, silently ignored). */
let wakeLock: { release: () => Promise<void> } | null = null;

export async function requestWakeLock(): Promise<void> {
  try {
    if (!supportsWakeLock()) return;
    const nav = navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    wakeLock = await nav.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

export async function toggleFullscreen(element?: HTMLElement): Promise<boolean> {
  try {
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const target = (element ?? document.documentElement) as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const active = document.fullscreenElement ?? doc.webkitFullscreenElement;
    if (active) {
      if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      else await document.exitFullscreen();
      return false;
    }
    if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen();
    else await target.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export const isFullscreen = (): boolean =>
  Boolean(
    document.fullscreenElement ??
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement,
  );

/** Platform-aware install guidance for the "add to home screen" prompt. */
export function installInstructions(): { title: string; steps: string } {
  switch (detectPlatform()) {
    case 'ios':
      return {
        title: 'Install on iPhone or iPad',
        steps: 'Tap the Share button, then choose “Add to Home Screen”. Presentation Buddy then runs full screen.',
      };
    case 'android':
      return {
        title: 'Install on Android',
        steps: 'Open the browser menu and choose “Install app” or “Add to Home screen”.',
      };
    case 'mac':
      return {
        title: 'Install on Mac',
        steps: 'In Safari or Chrome use Share → “Add to Dock”, or File → “Install Presentation Buddy…”.',
      };
    case 'windows':
      return {
        title: 'Install on Windows',
        steps: 'In Edge or Chrome click the install icon in the address bar, or choose “Install this site as an app”.',
      };
    default:
      return {
        title: 'Install Presentation Buddy',
        steps: 'Use your browser’s “Install app” / “Add to Home Screen” option to run it offline.',
      };
  }
}
