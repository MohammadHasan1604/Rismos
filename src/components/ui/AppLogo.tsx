'use client';

import React, { memo, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import CoskoLogo from './CoskoLogo';

interface AppLogoProps {
  src?: string;
  iconName?: string;
  size?: number;
  variant?: 'default' | 'dark-bg' | 'blue-bg' | 'mono-white';
  showText?: boolean;
  className?: string;
  onClick?: () => void;
}

export const AppLogo = memo(function AppLogo({
  src,
  size = 32,
  variant = 'default',
  showText = false,
  className = '',
  onClick,
}: AppLogoProps) {
  const { branding } = useApp();

  const isDarkVariant = variant === 'dark-bg' || variant === 'blue-bg' || variant === 'mono-white';

  // Prefer dark logo variant when rendering on dark/blue surfaces if available
  const activeSrc =
    src || (isDarkVariant && branding.logoDarkUrl ? branding.logoDarkUrl : branding.logoUrl);
  const appName = branding?.appName || 'RISMOS';
  const primaryColor = branding?.primaryColor || '#002E86';
  const secondaryColor = branding?.secondaryColor || '#009ADF';

  const containerClassName = useMemo(() => {
    const classes = ['inline-flex items-center select-none flex-shrink-0'];
    if (onClick) classes.push('cursor-pointer hover:opacity-90 transition-opacity');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [onClick, className]);

  let textColor = isDarkVariant ? '#FFFFFF' : '#0F172A';
  if (variant === 'default') {
    textColor = primaryColor || '#0F172A';
  }

  const fontSize = Math.round(size * 0.72);
  const iconSize = Math.round(size * 0.92);

  return (
    <div className={containerClassName} onClick={onClick} style={{ height: size }}>
      {activeSrc ? (
        <div className="flex items-center gap-2.5">
          <img
            src={activeSrc}
            alt={appName}
            style={{ height: size, maxHeight: size, objectFit: 'contain' }}
            className="rounded flex-shrink-0"
          />
          {showText && (
            <span
              className="font-bold tracking-tight font-sans"
              style={{
                color: textColor,
                fontSize: `${fontSize}px`,
                letterSpacing: '-0.025em',
                lineHeight: 1,
              }}
            >
              {appName}
            </span>
          )}
        </div>
      ) : appName.toUpperCase() === 'COSKO' ? (
        <CoskoLogo size={size} variant={variant} showText={showText} />
      ) : (
        /* Dynamic Modern White-Label / RISMOS Retail Mark */
        <div className="inline-flex items-center gap-2.5 leading-none">
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label={`${appName} Logo`}
            className="flex-shrink-0"
          >
            <defs>
              <linearGradient id={`rismos-grad-1-${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isDarkVariant ? '#FFFFFF' : primaryColor} />
                <stop offset="100%" stopColor={isDarkVariant ? '#93C5FD' : secondaryColor} />
              </linearGradient>
              <linearGradient id={`rismos-grad-2-${variant}`} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={isDarkVariant ? '#60A5FA' : secondaryColor} />
                <stop offset="100%" stopColor={isDarkVariant ? '#FFFFFF' : '#38BDF8'} />
              </linearGradient>
            </defs>
            {/* Dynamic Hex-Prism Smart Retail Command Mark */}
            <rect
              x="2"
              y="2"
              width="32"
              height="32"
              rx="8"
              fill={isDarkVariant ? 'rgba(255, 255, 255, 0.12)' : `${primaryColor}15`}
              stroke={isDarkVariant ? 'rgba(255, 255, 255, 0.25)' : `${primaryColor}30`}
              strokeWidth="1.5"
            />
            {/* Modern R / Vector Arrow Core */}
            <path
              d="M 10 26 L 10 10 L 19 10 C 22.5 10 25 12.2 25 15.5 C 25 18.5 22.8 20.5 19.5 20.8 L 26 26"
              stroke={`url(#rismos-grad-1-${variant})`}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M 10 17 L 18.5 17"
              stroke={`url(#rismos-grad-2-${variant})`}
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Command Dot */}
            <circle cx="26" cy="10" r="2.5" fill={isDarkVariant ? '#38BDF8' : secondaryColor} />
          </svg>

          {showText && (
            <span
              className="font-bold tracking-tight font-sans"
              style={{
                color: textColor,
                fontSize: `${fontSize}px`,
                letterSpacing: '-0.025em',
                lineHeight: 1,
              }}
            >
              {appName}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default AppLogo;
