import React from 'react';
import { useToast } from '../context/ToastContext';

const COLOR_MAP = {
  success: '#16A34A',
  warn: '#D97706',
  error: '#DC2626',
  info: '#2563EB',
} as const;

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();

  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 360,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismissToast(t.id)}
          style={{
            pointerEvents: 'auto',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '12px 16px',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.25)',
            borderLeft: `4px solid ${COLOR_MAP[t.type]}`,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13.5,
            lineHeight: 1.4,
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: COLOR_MAP[t.type],
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {t.type === 'success' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
            {t.type === 'warn' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008" />
              </svg>
            )}
            {t.type === 'error' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            )}
            {t.type === 'info' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0-8h.01" />
              </svg>
            )}
          </span>
          <div>
            {t.title && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{t.title}</div>}
            <div style={{ color: '#E2E8F0', fontWeight: 500 }}>{t.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
