'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import {
  applyBrandThemeCssVariables,
  BrandThemePalette,
  BRAND_THEME_PRESETS,
  FIXED_RISMOS_PALETTE,
} from '@/lib/colorUtils';

interface BrandThemeContextType {
  palette: BrandThemePalette;
  presets: typeof BRAND_THEME_PRESETS;
  applyPreset: (presetId: string) => void;
}

const BrandThemeContext = createContext<BrandThemeContextType | null>(null);

export function BrandThemeProvider({ children }: { children: React.ReactNode }) {
  const { branding } = useApp();

  const palette = FIXED_RISMOS_PALETTE;

  useEffect(() => {
    // 1. Authoritative Fixed Enterprise Theme on :root
    applyBrandThemeCssVariables();

    // 2. Synchronize Favicon dynamically
    if (typeof document !== 'undefined') {
      const activeFavicon = branding?.faviconUrl || branding?.logoUrl;
      if (activeFavicon) {
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'shortcut icon';
          document.head.appendChild(link);
        }
        link.href = activeFavicon;
      }
    }
  }, [branding?.faviconUrl, branding?.logoUrl]);

  const applyPreset = () => {
    // Colors are fixed to enterprise RISMOS theme
    applyBrandThemeCssVariables();
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
      palette: FIXED_RISMOS_PALETTE,
      presets: BRAND_THEME_PRESETS,
      applyPreset: () => {},
    };
  }
  return ctx;
}
