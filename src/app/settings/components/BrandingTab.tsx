'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';

export type BrandingUploadStatus =
  | 'idle'
  | 'uploading'
  | 'uploaded'
  | 'saving'
  | 'saved'
  | 'upload_failed'
  | 'save_failed';

interface BrandingTabProps {
  appName: string;
  setAppName: (name: string) => void;
  tagline: string;
  setTagline: (tagline: string) => void;
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
  faviconUrl: string | null;
  setFaviconUrl: (url: string | null) => void;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFaviconUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveLogo?: () => void;
  handleRemoveFavicon?: () => void;
  logoStatus?: BrandingUploadStatus;
  faviconStatus?: BrandingUploadStatus;
  handleResetBrandingTab: () => void;
  isSuperAdmin: boolean;
  // Optional legacy props maintained for interface compatibility
  supportEmailBranding?: string;
  setSupportEmailBranding?: (email: string) => void;
  supportPhone?: string;
  setSupportPhone?: (phone: string) => void;
  primaryColor?: string;
  setPrimaryColor?: (color: string) => void;
  secondaryColor?: string;
  setSecondaryColor?: (color: string) => void;
  accentColor?: string;
  setAccentColor?: (color: string) => void;
  logoDarkUrl?: string | null;
  setLogoDarkUrl?: (url: string | null) => void;
  appIconUrl?: string | null;
  setAppIconUrl?: (url: string | null) => void;
  handleLogoDarkUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAppIconUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function renderStatusBadge(status?: BrandingUploadStatus) {
  if (!status || status === 'idle') return null;

  switch (status) {
    case 'uploading':
      return (
        <span className="badge-warning text-3xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-full">
          <Icon name="ArrowPathIcon" size={11} className="animate-spin text-amber-500" />
          Uploading...
        </span>
      );
    case 'uploaded':
      return (
        <span className="badge-info text-3xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-full">
          <Icon name="CheckIcon" size={11} />
          Uploaded
        </span>
      );
    case 'saving':
      return (
        <span className="badge-warning text-3xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-full">
          <Icon name="ArrowPathIcon" size={11} className="animate-spin text-amber-500" />
          Saving to Database...
        </span>
      );
    case 'saved':
      return (
        <span className="badge-success text-3xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-full">
          <Icon name="CheckCircleIcon" size={11} />
          Saved & Synced
        </span>
      );
    case 'upload_failed':
      return (
        <span className="badge-danger text-3xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-full">
          <Icon name="ExclamationCircleIcon" size={11} />
          Upload Failed
        </span>
      );
    case 'save_failed':
      return (
        <span className="badge-danger text-3xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-full">
          <Icon name="ExclamationCircleIcon" size={11} />
          Save Failed
        </span>
      );
    default:
      return null;
  }
}

export const BrandingTab: React.FC<BrandingTabProps> = ({
  appName,
  setAppName,
  tagline,
  setTagline,
  logoUrl,
  setLogoUrl,
  faviconUrl,
  setFaviconUrl,
  handleLogoUpload,
  handleFaviconUpload,
  handleRemoveLogo,
  handleRemoveFavicon,
  logoStatus = 'idle',
  faviconStatus = 'idle',
  handleResetBrandingTab,
  isSuperAdmin,
}) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-3">
        <h3 className="text-base font-bold text-foreground">
          Brand Identity & Visual Appearance
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure your canonical retail brand identity. The brand name, tagline, universal logo,
          and favicon propagate in real-time across all sales terminals, receipts, invoices, and reports.
        </p>
      </div>

      {/* Live Brand Preview Card */}
      <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Live Brand & Terminal Preview
          </span>
          <span className="text-3xs text-emerald-500 font-mono font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            Real-time Database Sync Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Light Surface Preview */}
          <div className="p-4 bg-card rounded-xl border border-border shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <div className="w-10 h-10 rounded-lg border border-border bg-white flex items-center justify-center p-1 flex-shrink-0 shadow-2xs">
                  <img
                    src={logoUrl}
                    alt={appName || 'Brand Logo'}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <AppLogo size={32} showText={false} />
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-foreground truncate">{appName || 'RISMOS'}</h4>
                <p className="text-2xs text-muted-foreground truncate">
                  {tagline || 'Run Retail. Smarter.'}
                </p>
              </div>
            </div>
            <span className="text-2xs font-bold px-2.5 py-1 rounded-lg bg-primary text-white shadow-xs flex-shrink-0">
              Light Surface
            </span>
          </div>

          {/* Dark Surface Preview (Enterprise Navy Header) */}
          <div className="p-4 rounded-xl shadow-xs flex items-center justify-between text-white bg-primary">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center p-1 flex-shrink-0">
                  <img
                    src={logoUrl}
                    alt={appName || 'Brand Logo'}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <AppLogo size={32} variant="blue-bg" showText={false} />
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white truncate">{appName || 'RISMOS'}</h4>
                <p className="text-2xs text-slate-300 truncate">{tagline || 'Run Retail. Smarter.'}</p>
              </div>
            </div>
            <span className="text-2xs font-bold px-2.5 py-1 rounded-lg bg-white/15 text-white border border-white/20 flex-shrink-0">
              Fixed Navy Header
            </span>
          </div>
        </div>
      </div>

      {/* Brand Identity Fields (Strictly Visual Identity) */}
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-bold text-foreground block mb-1">
              Application / Brand Name *
            </label>
            <input
              type="text"
              required
              disabled={!isSuperAdmin}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g. RISMOS"
              aria-label="Application Brand Name"
              className="input-field text-xs font-bold min-h-[40px]"
            />
            <p className="text-3xs text-muted-foreground mt-1">
              Displayed in the navigation bar, login screen, invoices, and browser tab.
            </p>
          </div>

          <div>
            <label className="font-bold text-foreground block mb-1">Brand Tagline</label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Run Retail. Smarter."
              aria-label="Brand Tagline"
              className="input-field text-xs min-h-[40px]"
            />
            <p className="text-3xs text-muted-foreground mt-1">
              Appears on POS billing terminal headers, login banner, and public documents.
            </p>
          </div>
        </div>

        {/* Upload Assets Grid: ONLY Universal Logo + Browser Favicon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* 1. Universal Brand Logo */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-foreground">Universal Brand Logo</span>
              <div className="flex items-center gap-2">
                {renderStatusBadge(logoStatus)}
                {logoUrl && isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      if (handleRemoveLogo) {
                        handleRemoveLogo();
                      } else {
                        setLogoUrl(null);
                      }
                    }}
                    className="text-2xs text-danger hover:underline font-semibold"
                    aria-label="Remove brand logo"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {logoUrl ? (
                <div className="h-14 w-28 rounded-lg border border-border p-1 bg-white flex items-center justify-center shadow-2xs">
                  <img
                    src={logoUrl}
                    alt="Brand Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="h-14 w-28 rounded-lg border border-dashed border-border p-2 bg-muted/30 flex items-center justify-center text-center">
                  <span className="text-3xs text-muted-foreground font-semibold">
                    Default Vector Mark
                  </span>
                </div>
              )}
              <div className="text-3xs text-muted-foreground space-y-0.5">
                <p className="font-semibold text-foreground">One canonical logo for all screens</p>
                <p>Supports PNG, JPG, WebP, SVG (Max 5MB).</p>
                <p>Works in sidebar, header, receipt print, and invoices.</p>
              </div>
            </div>

            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={!isSuperAdmin}
              onChange={handleLogoUpload}
              aria-label="Upload universal brand logo"
              className="text-xs file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:opacity-90 w-full cursor-pointer"
            />
          </div>

          {/* 2. Browser Tab Favicon */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-foreground">Browser Tab Favicon</span>
              <div className="flex items-center gap-2">
                {renderStatusBadge(faviconStatus)}
                {faviconUrl && isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      if (handleRemoveFavicon) {
                        handleRemoveFavicon();
                      } else {
                        setFaviconUrl(null);
                      }
                    }}
                    className="text-2xs text-danger hover:underline font-semibold"
                    aria-label="Remove browser favicon"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {faviconUrl ? (
                <div className="h-12 w-12 rounded-lg border border-border p-1 bg-white flex items-center justify-center shadow-2xs">
                  <img
                    src={faviconUrl}
                    alt="Favicon"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="h-12 w-12 rounded-lg border border-dashed border-border p-1 bg-muted/30 flex items-center justify-center text-center">
                  <span className="text-3xs text-muted-foreground font-semibold">R</span>
                </div>
              )}
              <div className="text-3xs text-muted-foreground space-y-0.5">
                <p className="font-semibold text-foreground">Dedicated tab icon</p>
                <p>32x32px or 64x64px (.ico, .png, .svg).</p>
                <p>Displayed in the browser tab and bookmarks.</p>
              </div>
            </div>

            <input
              type="file"
              accept="image/png,image/x-icon,image/svg+xml,image/vnd.microsoft.icon"
              disabled={!isSuperAdmin}
              onChange={handleFaviconUpload}
              aria-label="Upload browser favicon"
              className="text-xs file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:opacity-90 w-full cursor-pointer"
            />
          </div>
        </div>

        {/* Reset Button */}
        {isSuperAdmin && (
          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={handleResetBrandingTab}
              className="px-3.5 py-2.5 text-2xs font-semibold rounded-xl text-muted-foreground hover:text-danger hover:bg-danger/10 border border-border hover:border-danger/20 transition-all cursor-pointer min-h-[44px]"
            >
              Reset to RISMOS Default Brand Identity
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
