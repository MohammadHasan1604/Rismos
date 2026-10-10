'use client';

import React, { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/ui/AppIcon';

export type ModalSize =
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'full'
  | 'compact'
  | 'standard'
  | 'large-form'
  | 'full-workflow';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  variant?: 'compact' | 'standard' | 'large-form' | 'full-workflow';
  zIndex?: number;
  /** Legacy flag preserved for compatibility; adaptive sizing is applied automatically */
  mobileFullScreen?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

const desktopWidthClasses: Record<string, string> = {
  sm: 'w-full md:max-w-md',
  compact: 'w-full md:max-w-md',
  md: 'w-full md:max-w-xl',
  standard: 'w-full md:max-w-xl',
  lg: 'w-full md:max-w-3xl',
  'large-form': 'w-full md:max-w-3xl',
  xl: 'w-full md:max-w-5xl',
  'full-workflow': 'w-full md:max-w-5xl',
  full: 'w-full md:max-w-7xl md:w-[96vw]',
};

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  variant,
  zIndex = 100,
  mobileFullScreen,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  // Client-side hydration mount check for React Portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Stable reference to onClose callback to avoid breaking effect dependencies
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const prevOpenRef = useRef(false);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Normalize size mode
  const resolvedSize = variant || size;
  const isCompact = resolvedSize === 'sm' || resolvedSize === 'compact';
  const isStandard = resolvedSize === 'md' || resolvedSize === 'standard';
  const isLarge = resolvedSize === 'lg' || resolvedSize === 'large-form';
  const isWorkflow =
    resolvedSize === 'xl' || resolvedSize === 'full-workflow' || resolvedSize === 'full';

  // 1. DYNAMIC VISUAL VIEWPORT TRACKING (ANDROID KEYBOARD & DYNAMIC BROWSER CHROMES)
  // When keyboard opens on Android Chrome or iOS Safari, visualViewport.height shrinks.
  // We keep the modal overlay and dialog tightly inside the visible window.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const updateViewportMetrics = () => {
      if (!overlayRef.current) return;
      const vv = window.visualViewport;
      if (vv) {
        const height = Math.round(vv.height);
        const top = Math.round(vv.offsetTop);
        overlayRef.current.style.setProperty('--vv-height', `${height}px`);
        overlayRef.current.style.setProperty('--vv-top', `${top}px`);
      } else {
        overlayRef.current.style.setProperty('--vv-height', '100dvh');
        overlayRef.current.style.setProperty('--vv-top', '0px');
      }
    };

    updateViewportMetrics();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewportMetrics, { passive: true });
      vv.addEventListener('scroll', updateViewportMetrics, { passive: true });
    }
    window.addEventListener('resize', updateViewportMetrics, { passive: true });

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateViewportMetrics);
        vv.removeEventListener('scroll', updateViewportMetrics);
      }
      window.removeEventListener('resize', updateViewportMetrics);
    };
  }, [open]);

  // 2. OPEN / CLOSE LIFECYCLE, ACCESSIBLE FOCUS TRAP INITIALIZATION & BODY SCROLL LOCK
  // Runs ONLY when `open` actually transitions false -> true or true -> false.
  // NEVER runs on form keystrokes, parent re-renders, or realtime events.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!wasOpen && open) {
      // Remember previously focused element to restore on close
      previouslyFocusedElementRef.current =
        typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null;

      // Lock body scroll and mark document body as modal-open
      if (typeof document !== 'undefined') {
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
      }

      // Initial focus management
      const timer = requestAnimationFrame(() => {
        if (!dialogRef.current) return;

        // If an element inside the dialog is already focused (e.g. via autoFocus), DO NOT override it!
        if (
          document.activeElement &&
          dialogRef.current.contains(document.activeElement) &&
          document.activeElement !== dialogRef.current
        ) {
          return;
        }

        // If initialFocusRef is explicitly provided, focus that element
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus({ preventScroll: true });
          return;
        }

        // Otherwise focus the first interactive input / button
        const focusable = dialogRef.current.querySelector<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([aria-label="Close dialog"]), [tabindex]:not([tabindex="-1"]), a[href]'
        );

        if (focusable) {
          focusable.focus({ preventScroll: true });
        } else {
          dialogRef.current.focus({ preventScroll: true });
        }
      });

      return () => cancelAnimationFrame(timer);
    } else if (wasOpen && !open) {
      // Modal closed: unlock body scroll & restore previous focus
      if (typeof document !== 'undefined') {
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      }
      if (
        previouslyFocusedElementRef.current &&
        typeof previouslyFocusedElementRef.current.focus === 'function'
      ) {
        try {
          previouslyFocusedElementRef.current.focus({ preventScroll: true });
        } catch {
          // Element may have unmounted
        }
      }
    }
  }, [open, initialFocusRef]);

  // Cleanup scroll lock on unmount
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      }
    };
  }, []);

  // 3. KEYBOARD LISTENERS: ESCAPE KEY & TAB FOCUS TRAP
  // Stable listener: NEVER re-focuses the dialog container during typing
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key to close
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      // Tab navigation trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]'
          )
        ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, closeOnEscape]);

  // 4. SMOOTH SCROLL FOR INPUT FOCUS (KEYBOARD AWARE)
  // Ensures that whenever an input is tapped, it smoothly stays visible inside the scroll area
  const handleFocusCapture = (e: React.FocusEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      setTimeout(() => {
        try {
          e.target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } catch {
          // Ignore unsupported scroll options
        }
      }, 80);
    }
  };

  if (!mounted || !open) return null;

  // Responsive mobile container styling:
  // - Compact: Content-sized bottom card (up to 85dvh / vv-height), no empty wasted screen space
  // - Standard: Adaptive height bottom sheet (up to 92dvh / vv-height)
  // - Large: Near full viewport sheet (up to 95dvh / vv-height)
  // - Workflow: Near-full / full-screen workflow
  let mobileClasses =
    'rounded-t-2xl md:rounded-2xl max-h-[min(85dvh,calc(var(--vv-height,100dvh)-24px))]';
  if (isStandard) {
    mobileClasses =
      'rounded-t-2xl md:rounded-2xl max-h-[min(92dvh,calc(var(--vv-height,100dvh)-16px))]';
  } else if (isLarge) {
    mobileClasses =
      'rounded-t-2xl md:rounded-2xl max-h-[min(calc(100dvh-12px),calc(var(--vv-height,100dvh)-12px))]';
  } else if (isWorkflow || mobileFullScreen === true) {
    mobileClasses =
      'rounded-t-2xl md:rounded-2xl h-full md:h-auto max-h-[min(calc(100dvh-8px),calc(var(--vv-height,100dvh)-8px))] md:max-h-[92vh]';
  }

  const widthClass = desktopWidthClasses[resolvedSize] || 'md:max-w-xl';

  const modalContent = (
    <div
      ref={overlayRef}
      style={{
        zIndex,
        top: 'var(--vv-top, 0px)',
        height: 'var(--vv-height, 100dvh)',
      }}
      className="fixed inset-x-0 bottom-0 flex items-end md:items-center justify-center overflow-hidden p-0 md:p-4 touch-none"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === overlayRef.current) {
          onCloseRef.current?.();
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] animate-backdrop-in pointer-events-auto" />

      {/* Dialog Container */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        onFocusCapture={handleFocusCapture}
        className={`relative bg-card flex flex-col overflow-hidden focus:outline-none shadow-modal border-t md:border border-border/80 w-full ${widthClass} ${mobileClasses} md:my-auto md:max-h-[90vh] animate-slide-up md:animate-scale-in pointer-events-auto`}
        style={{
          // Dynamic visual viewport safe sizing
          maxHeight: isCompact
            ? 'min(85dvh, calc(var(--vv-height, 100dvh) - 24px), 85vh)'
            : isStandard
              ? 'min(92dvh, calc(var(--vv-height, 100dvh) - 16px), 88vh)'
              : isLarge
                ? 'min(calc(100dvh - 12px), calc(var(--vv-height, 100dvh) - 12px), 92vh)'
                : 'min(calc(100dvh - 8px), calc(var(--vv-height, 100dvh) - 8px), 94vh)',
        }}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5 md:py-3.5 border-b border-border/70 bg-card sticky top-0 z-10 flex-shrink-0">
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="text-sm md:text-base font-bold text-foreground tracking-tight truncate"
              >
                {title}
              </h2>
              {subtitle && (
                <p
                  id={subtitleId}
                  className="text-xs text-muted-foreground mt-0.5 leading-normal truncate"
                >
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onCloseRef.current?.()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all cursor-pointer flex-shrink-0"
              aria-label="Close dialog"
            >
              <Icon name="XMarkIcon" size={16} />
            </button>
          </div>
        )}

        {/* Scrollable Body: Single internal scroll container */}
        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-4 md:px-5 md:py-5 min-h-0">
          {children}
        </div>

        {/* Sticky Actions / Footer */}
        {footer && (
          <div
            className="border-t border-border/70 px-4 py-3 md:px-5 md:py-3.5 bg-card/95 backdrop-blur-sm sticky bottom-0 z-10 flex-shrink-0"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
