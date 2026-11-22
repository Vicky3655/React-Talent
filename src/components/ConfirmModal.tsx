import React, { useEffect } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = true,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tf-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 3000,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid #E2E8F0',
          }}
        >
          <h2 id="tf-confirm-title" style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: 0 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: 'none',
              background: '#F1F5F9',
              color: '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '20px 22px' }}>
          <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>{message}</p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 22px',
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: '1.5px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: 'none',
              background: isDanger ? '#DC2626' : '#2563EB',
              color: '#FFFFFF',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
