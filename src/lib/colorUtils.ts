/**
 * Brand Theme Color Engine & WCAG AA Contrast Utility
 */

export interface BrandThemePalette {
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentForeground: string;
  ring: string;
}

export const BRAND_THEME_PRESETS = [
  {
    id: 'rismos-blue',
    name: 'RISMOS Blue',
    description: 'Professional Enterprise Blue',
    primary: '#002E86',
    secondary: '#009ADF',
    accent: '#2563EB',
  },
  {
    id: 'enterprise-red',
    name: 'Enterprise Red',
    description: 'Professional Deep Ruby Red',
    primary: '#9F1239',
    secondary: '#BE123C',
    accent: '#E11D48',
  },
  {
    id: 'obsidian-black',
    name: 'Obsidian Black',
    description: 'Premium Obsidian Graphite',
    primary: '#18181B',
    secondary: '#27272A',
    accent: '#3F3F46',
  },
] as const;

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== 'string') return null;
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  return null;
}

/**
 * Calculates WCAG relative luminance and returns optimal foreground color
 */
export function getContrastForeground(hex: string): '#ffffff' | '#0f172a' {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // W3C WCAG 2.1 threshold: (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) -> L = 0.179
  return luminance > 0.179 ? '#0f172a' : '#ffffff';
}

/**
 * Adjusts color shade for hover states
 */
export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const r = Math.min(255, Math.max(0, Math.round(rgb.r * (1 + percent / 100))));
  const g = Math.min(255, Math.max(0, Math.round(rgb.g * (1 + percent / 100))));
  const b = Math.min(255, Math.max(0, Math.round(rgb.b * (1 + percent / 100))));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 46, 134, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Computes full semantic palette from brand color tokens
 */
export function computeBrandPalette(
  primaryHex: string = '#002E86',
  secondaryHex: string = '#009ADF',
  accentHex: string = '#2563EB'
): BrandThemePalette {
  const safePrimary = hexToRgb(primaryHex) ? primaryHex : '#002E86';
  const safeSecondary = hexToRgb(secondaryHex) ? secondaryHex : '#009ADF';
  const safeAccent = hexToRgb(accentHex) ? accentHex : '#2563EB';

  return {
    primary: safePrimary,
    primaryHover: adjustBrightness(safePrimary, -15),
    primarySoft: hexToRgba(safePrimary, 0.1),
    primaryForeground: getContrastForeground(safePrimary),
    secondary: safeSecondary,
    secondaryForeground: getContrastForeground(safeSecondary),
    accent: safeAccent,
    accentHover: adjustBrightness(safeAccent, -15),
    accentSoft: hexToRgba(safeAccent, 0.12),
    accentForeground: getContrastForeground(safeAccent),
    ring: safePrimary,
  };
}

/**
 * Injects CSS variables onto document root element
 */
export function applyBrandThemeCssVariables(
  primaryHex?: string,
  secondaryHex?: string,
  accentHex?: string
): void {
  if (typeof document === 'undefined') return;

  const palette = computeBrandPalette(primaryHex, secondaryHex, accentHex);
  const root = document.documentElement;

  root.style.setProperty('--primary', palette.primary);
  root.style.setProperty('--primary-hover', palette.primaryHover);
  root.style.setProperty('--primary-soft', palette.primarySoft);
  root.style.setProperty('--primary-foreground', palette.primaryForeground);

  root.style.setProperty('--secondary', palette.secondary);
  root.style.setProperty('--secondary-foreground', palette.secondaryForeground);

  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-hover', palette.accentHover);
  root.style.setProperty('--accent-soft', palette.accentSoft);
  root.style.setProperty('--accent-foreground', palette.accentForeground);

  root.style.setProperty('--ring', palette.ring);
}
