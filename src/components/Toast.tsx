import React, { createContext, useCallback, useContext, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info' | 'meta';

export interface ToastItem {
  id:       string;
  variant:  ToastVariant;
  title:    string;
  body?:    string;
}

type AddToast = (toast: Omit<ToastItem, 'id'>) => void;

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<AddToast>(() => {});

export function useToast(): AddToast {
  return useContext(ToastContext);
}

// ─── Single Toast Card ────────────────────────────────────────────────────────

const VARIANT_STYLE: Record<ToastVariant, { border: string; icon: string; titleColor: string; iconBg: string }> = {
  success: { border: 'border-profit-emerald/40', icon: '✓',  titleColor: 'text-profit-emerald', iconBg: 'bg-profit-emerald/15' },
  error:   { border: 'border-danger-red/40',     icon: '✕',  titleColor: 'text-danger-red',     iconBg: 'bg-danger-red/15'     },
  info:    { border: 'border-neon-cyan/40',       icon: 'ℹ',  titleColor: 'text-neon-cyan',      iconBg: 'bg-neon-cyan/15'      },
  meta:    { border: 'border-[#1877F2]/50',       icon: '⚡', titleColor: 'text-[#4493F8]',      iconBg: 'bg-[#1877F2]/15'      },
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const s = VARIANT_STYLE[toast.variant];
  return (
    <div
      className={`flex items-start gap-3 min-w-[300px] max-w-[420px] rounded-2xl border px-4 py-3 shadow-glass animate-fade-in-up`}
      style={{
        background: 'rgba(10,13,20,0.97)',
        backdropFilter: 'blur(12px)',
        borderColor: s.border.replace('border-', '').replace('/40', ''),
      }}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5 ${s.iconBg} ${s.titleColor}`}>
        {s.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${s.titleColor}`}>{toast.title}</p>
        {toast.body && <p className="text-text-secondary text-xs mt-0.5 leading-relaxed">{toast.body}</p>}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-muted-gray hover:text-white transition-colors text-xs shrink-0 mt-0.5 ml-1"
      >
        ✕
      </button>
    </div>
  );
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback<AddToast>((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}

      {/* Toast overlay — fixed bottom-right */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastCard toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
