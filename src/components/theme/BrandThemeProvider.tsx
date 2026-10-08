'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import {
  computeBrandPalette,
  applyBrandThemeCssVariables,
  BrandThemePalette,
  BRAND_THEME_PRESETS,
} from '@/lib/colorUtils';

interface BrandThemeContextType {
  palette: BrandThemePalette;
  presets: typeof BRAND_THEME_PRESETS;
  applyPreset: (presetId: string) => void;
}

const BrandThemeContext = createContext<BrandThemeContextType | null>(null);

export function BrandThemeProvider({ children }: { children: React.ReactNode }) {
  const { branding, updateBranding } = useApp();

  const palette = useMemo(() => {
    return computeBrandPalette(
      branding?.primaryColor || '#002E86',
      branding?.secondaryColor || '#009ADF',
      branding?.accentColor || '#2563EB'
    );
  }, [branding?.primaryColor, branding?.secondaryColor, branding?.accentColor]);

  useEffect(() => {
    // 1. Synchronize CSS variables on :root
    applyBrandThemeCssVariables(
      branding?.primaryColor || '#002E86',
      branding?.secondaryColor || '#009ADF',
      branding?.accentColor || '#2563EB'
    );

    // 2. Synchronize Favicon dynamically
    if (typeof document !== 'undefined') {
      if (branding?.faviconUrl) {
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (link) {
          link.href = branding.faviconUrl;
        }
      }
    }
  }, [branding?.primaryColor, branding?.secondaryColor, branding?.accentColor, branding?.faviconUrl]);

  const applyPreset = (presetId: string) => {
    const preset = BRAND_THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    applyBrandThemeCssVariables(preset.primary, preset.secondary, preset.accent);
    if (updateBranding) {
      updateBranding({
        primaryColor: preset.primary,
        secondaryColor: preset.secondary,
        accentColor: preset.accent,
      });
    }
  };

  return (
    <BrandThemeContext.Provider
      value={{
        palette,
        presets: BRAND_THEME_PRESETS,
        applyPreset,
      }}
    >
      {children}
    </BrandThemeContext.Provider>
  );
}

export function useBrandTheme() {
  const ctx = useContext(BrandThemeContext);
  if (!ctx) {
    return {
      palette: computeBrandPalette('#002E86', '#009ADF', '#2563EB'),
      presets: BRAND_THEME_PRESETS,
      applyPreset: () => {},
    };
  }
  return ctx;
}
