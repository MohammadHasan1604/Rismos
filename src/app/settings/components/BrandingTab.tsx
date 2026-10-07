'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';

interface BrandingTabProps {
  appName: string;
  setAppName: (name: string) => void;
  tagline: string;
  setTagline: (tagline: string) => void;
  supportEmailBranding: string;
  setSupportEmailBranding: (email: string) => void;
  supportPhone: string;
  setSupportPhone: (phone: string) => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  secondaryColor: string;
  setSecondaryColor: (color: string) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
  logoDarkUrl: string | null;
  setLogoDarkUrl: (url: string | null) => void;
  appIconUrl: string | null;
  setAppIconUrl: (url: string | null) => void;
  faviconUrl: string | null;
  setFaviconUrl: (url: string | null) => void;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleLogoDarkUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAppIconUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFaviconUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetBrandingTab: () => void;
  isSuperAdmin: boolean;
}

const COLOR_PRESETS = [
  { name: 'RISMOS Blue', primary: '#002E86', secondary: '#009ADF', accent: '#2563EB' },
  { name: 'Emerald Retail', primary: '#064E3B', secondary: '#10B981', accent: '#059669' },
  { name: 'Midnight Indigo', primary: '#1E1B4B', secondary: '#6366F1', accent: '#4F46E5' },
  { name: 'Ruby Enterprise', primary: '#881337', secondary: '#F43F5E', accent: '#E11D48' },
  { name: 'Slate Modern', primary: '#0F172A', secondary: '#38BDF8', accent: '#0284C7' },
];

export const BrandingTab: React.FC<BrandingTabProps> = ({
  appName,
  setAppName,
  tagline,
  setTagline,
  supportEmailBranding,
  setSupportEmailBranding,
  supportPhone,
  setSupportPhone,
  primaryColor,
  setPrimaryColor,
  secondaryColor,
  setSecondaryColor,
  accentColor,
  setAccentColor,
  logoUrl,
  setLogoUrl,
  logoDarkUrl,
  setLogoDarkUrl,
  appIconUrl,
  setAppIconUrl,
  faviconUrl,
  setFaviconUrl,
  handleLogoUpload,
  handleLogoDarkUpload,
  handleAppIconUpload,
  handleFaviconUpload,
  handleResetBrandingTab,
  isSuperAdmin,
}) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-3">
        <h3 className="text-base font-bold text-foreground">White-Label Branding & Global Visual Identity</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Fully white-label your retail terminal. Changes to brand name, logos, and custom color palette propagate instantaneously across all stores and terminals.
        </p>
      </div>

      {/* Live Preview Card */}
      <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Live Brand & Terminal Preview
          </span>
          <span className="text-3xs text-emerald-500 font-mono font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            Real-time MySQL sync active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Light Surface Preview */}
          <div className="p-4 bg-card rounded-xl border border-border shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Custom Brand Logo"
                  className="w-10 h-10 object-contain rounded-lg border border-border bg-white"
                />
              ) : (
                <AppLogo size={32} showText={false} />
              )}
              <div>
                <h4 className="text-sm font-bold text-foreground">{appName || 'RISMOS'}</h4>
                <p className="text-2xs text-muted-foreground">{tagline || 'Run Retail. Smarter.'}</p>
              </div>
            </div>
            <span
              className="text-2xs font-bold px-2 py-1 rounded text-white shadow-xs"
              style={{ backgroundColor: primaryColor || '#002E86' }}
            >
              Light Surface
            </span>
          </div>

          {/* Dark Surface Preview */}
          <div
            className="p-4 rounded-xl shadow-xs flex items-center justify-between text-white"
            style={{ backgroundColor: primaryColor || '#002E86' }}
          >
            <div className="flex items-center gap-3">
              {logoDarkUrl ? (
                <img
                  src={logoDarkUrl}
                  alt="Dark Brand Logo"
                  className="w-10 h-10 object-contain rounded-lg"
                />
              ) : (
                <AppLogo size={32} variant="blue-bg" showText={false} />
              )}
              <div>
                <h4 className="text-sm font-bold text-white">{appName || 'RISMOS'}</h4>
                <p className="text-2xs text-blue-200">{tagline || 'Run Retail. Smarter.'}</p>
              </div>
            </div>
            <span className="text-2xs font-bold px-2 py-1 rounded bg-white/20 text-white">
              Dark / Header
            </span>
          </div>
        </div>
      </div>

      {/* Brand Identity Fields */}
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
              className="input-field text-xs font-bold"
            />
          </div>

          <div>
            <label className="font-bold text-foreground block mb-1">Brand Tagline</label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Run Retail. Smarter."
              className="input-field text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-bold text-foreground block mb-1">Brand Support Email</label>
            <input
              type="email"
              disabled={!isSuperAdmin}
              value={supportEmailBranding}
              onChange={(e) => setSupportEmailBranding(e.target.value)}
              placeholder="support@yourbrand.com"
              className="input-field text-xs"
            />
          </div>

          <div>
            <label className="font-bold text-foreground block mb-1">Support Contact Phone</label>
            <input
              type="text"
              disabled={!isSuperAdmin}
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="+1 800 555 0199"
              className="input-field text-xs"
            />
          </div>
        </div>

        {/* Brand Color Tokens Palette */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-bold text-foreground block">
              Brand Color Tokens (Primary, Secondary & Accent)
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-2xs text-muted-foreground mr-1">Presets:</span>
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  disabled={!isSuperAdmin}
                  onClick={() => {
                    setPrimaryColor(p.primary);
                    setSecondaryColor(p.secondary);
                    setAccentColor(p.accent);
                  }}
                  className="w-5 h-5 rounded-full border border-border shadow-xs cursor-pointer hover:scale-110 transition-transform"
                  style={{ backgroundColor: p.primary }}
                  title={p.name}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-2xs font-semibold text-muted-foreground block mb-1">
                Primary Brand Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  disabled={!isSuperAdmin}
                  value={primaryColor || '#002E86'}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-card"
                />
                <input
                  type="text"
                  maxLength={7}
                  disabled={!isSuperAdmin}
                  value={primaryColor || '#002E86'}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="input-field text-xs font-mono font-bold flex-1"
                />
              </div>
            </div>

            <div>
              <label className="text-2xs font-semibold text-muted-foreground block mb-1">
                Secondary Brand Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  disabled={!isSuperAdmin}
                  value={secondaryColor || '#009ADF'}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-card"
                />
                <input
                  type="text"
                  maxLength={7}
                  disabled={!isSuperAdmin}
                  value={secondaryColor || '#009ADF'}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="input-field text-xs font-mono font-bold flex-1"
                />
              </div>
            </div>

            <div>
              <label className="text-2xs font-semibold text-muted-foreground block mb-1">
                Accent / Action Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  disabled={!isSuperAdmin}
                  value={accentColor || '#2563EB'}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-9 h-9 p-0.5 rounded-lg border border-border cursor-pointer bg-card"
                />
                <input
                  type="text"
                  maxLength={7}
                  disabled={!isSuperAdmin}
                  value={accentColor || '#2563EB'}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="input-field text-xs font-mono font-bold flex-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Upload Assets Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Main Logo (Light Backgrounds) */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground">Main Logo (Light Backgrounds)</span>
              {logoUrl && (
                <button
                  type="button"
                  disabled={!isSuperAdmin}
                  onClick={() => setLogoUrl(null)}
                  className="text-2xs text-danger hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Main Logo"
                className="h-12 object-contain rounded-lg border border-border p-1 bg-white"
              />
            ) : (
              <p className="text-2xs text-muted-foreground">Using default dynamic AppLogo vector mark.</p>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              disabled={!isSuperAdmin}
              onChange={handleLogoUpload}
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:opacity-90"
            />
          </div>

          {/* Dark / Inverted Logo */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground">Dark Logo (For Dark Backgrounds)</span>
              {logoDarkUrl && (
                <button
                  type="button"
                  disabled={!isSuperAdmin}
                  onClick={() => setLogoDarkUrl(null)}
                  className="text-2xs text-danger hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            {logoDarkUrl ? (
              <img
                src={logoDarkUrl}
                alt="Dark Logo"
                className="h-12 object-contain rounded-lg border border-border p-1 bg-slate-900"
              />
            ) : (
              <p className="text-2xs text-muted-foreground">Optional inverted logo for dark topbars and auth screens.</p>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              disabled={!isSuperAdmin}
              onChange={handleLogoDarkUpload}
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:opacity-90"
            />
          </div>

          {/* Compact App Icon */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground">Compact App Icon (Mobile / Favicon)</span>
              {appIconUrl && (
                <button
                  type="button"
                  disabled={!isSuperAdmin}
                  onClick={() => setAppIconUrl(null)}
                  className="text-2xs text-danger hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            {appIconUrl ? (
              <img
                src={appIconUrl}
                alt="App Icon"
                className="h-10 w-10 object-contain rounded-lg border border-border p-1 bg-white"
              />
            ) : (
              <p className="text-2xs text-muted-foreground">Icon square used on collapsed sidebars and mobile badges.</p>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              disabled={!isSuperAdmin}
              onChange={handleAppIconUpload}
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:opacity-90"
            />
          </div>

          {/* Browser Favicon */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground">Browser Tab Favicon</span>
              {faviconUrl && (
                <button
                  type="button"
                  disabled={!isSuperAdmin}
                  onClick={() => setFaviconUrl(null)}
                  className="text-2xs text-danger hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            {faviconUrl ? (
              <img
                src={faviconUrl}
                alt="Favicon"
                className="h-8 w-8 object-contain rounded border border-border p-0.5 bg-white"
              />
            ) : (
              <p className="text-2xs text-muted-foreground">32x32px or 64x64px browser tab icon (.ico, .png, .svg).</p>
            )}
            <input
              type="file"
              accept="image/png,image/x-icon,image/svg+xml"
              disabled={!isSuperAdmin}
              onChange={handleFaviconUpload}
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:opacity-90"
            />
          </div>
        </div>

        {/* Reset Button */}
        {isSuperAdmin && (
          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={handleResetBrandingTab}
              className="px-3.5 py-2 text-2xs font-semibold rounded-xl text-muted-foreground hover:text-danger hover:bg-danger/10 border border-border hover:border-danger/20 transition-all cursor-pointer"
            >
              Reset to RISMOS Default Brand Identity
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
