'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/ui/AppIcon';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  zIndex?: number;
}

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  zIndex = 140,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Track visual viewport so keyboard inside sheet doesn't push sheet outside viewport
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const updateViewport = () => {
      if (!sheetRef.current) return;
      const vv = window.visualViewport;
      if (vv) {
        const height = Math.round(vv.height);
        sheetRef.current.style.setProperty(
          '--vv-sheet-max-h',
          `${Math.min(height - 16, height * 0.9)}px`
        );
      } else {
        sheetRef.current.style.setProperty('--vv-sheet-max-h', '88dvh');
      }
    };

    updateViewport();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewport, { passive: true });
    }
    window.addEventListener('resize', updateViewport, { passive: true });

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateViewport);
      }
      window.removeEventListener('resize', updateViewport);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };

    document.addEventListener('keydown', handleEscape);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, [open]);

  if (!mounted || !open) return null;

  const content = (
    <div
      ref={overlayRef}
      style={{ zIndex }}
      className="fixed inset-0 flex items-end justify-center overflow-hidden touch-none"
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onCloseRef.current?.();
        }
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] animate-backdrop-in pointer-events-auto"
        onClick={() => onCloseRef.current?.()}
        aria-hidden="true"
      />

      {/* Sheet Container */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Bottom sheet'}
        className="relative w-full max-w-lg bg-card rounded-t-2xl shadow-modal border-t border-border/80 flex flex-col overflow-hidden animate-slide-up pointer-events-auto"
        style={{
          maxHeight: 'min(88dvh, var(--vv-sheet-max-h, 88dvh), 88vh)',
          paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        }}
      >
        {/* Handle */}
        <div className="sheet-handle cursor-grab active:cursor-grabbing flex-shrink-0" />

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/80 flex-shrink-0 bg-card">
            <h3 className="text-sm font-bold text-foreground truncate">{title}</h3>
            <button
              type="button"
              onClick={() => onCloseRef.current?.()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer flex-shrink-0"
              aria-label="Close"
            >
              <Icon name="XMarkIcon" size={16} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3 min-h-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border/80 bg-muted/20 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
