import React from 'react';

export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <strong>{title}</strong>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}

