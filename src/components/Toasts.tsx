import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useUi, type ToastTone } from '../store/ui';

const ICONS: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

const COLORS: Record<ToastTone, string> = {
  info: 'var(--c-info)',
  success: 'var(--c-ok)',
  warn: 'var(--c-warn)',
  error: 'var(--c-bad)',
};

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);

  if (!toasts.length) return null;

  return (
    <div className="pb-toast-wrap" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <div key={toast.id} className="pb-toast">
            <Icon size={17} color={COLORS[toast.tone]} style={{ flex: '0 0 auto' }} />
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{ color: 'var(--c-ink-muted)', display: 'flex' }}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
