/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    screens: {
      'xs': '360px',
      'sm': '412px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1440px',
      '3xl': '1920px',
    },
    extend: {
      colors: {
        background: '#F8FAFC',
        foreground: '#0F172A',
        primary: {
          DEFAULT: '#0B1F3A',
          foreground: '#ffffff',
          dark: '#123A63',
          soft: 'rgba(11, 31, 58, 0.08)',
        },
        accent: {
          DEFAULT: '#123A63',
          foreground: '#ffffff',
          dark: '#0B1F3A',
          soft: 'rgba(18, 58, 99, 0.1)',
        },
        action: {
          DEFAULT: '#123A63',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#123A63',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#F1F5F9',
          foreground: '#64748B',
        },
        card: {
          DEFAULT: '#ffffff',
          foreground: '#0F172A',
        },
        border: '#E2E8F0',
        input: '#E2E8F0',
        ring: '#123A63',
        positive: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#123A63',
        // Fixed Brand Semantic Tokens
        'brand-navy': '#0B1F3A',
        'navy-action': '#123A63',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      fontFamily: {
        sans: ['"General Sans"', 'var(--font-plus-jakarta-sans)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        '3xs': ['0.5625rem', { lineHeight: '0.75rem' }],
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
        'bottomnav': 'var(--bottomnav-height, 56px)',
        'topbar': 'var(--topbar-height, 54px)',
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        xs: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        card: '0 1px 3px 0 rgba(0,0,0,0.05), 0 1px 2px -1px rgba(0,0,0,0.03)',
        'card-hover': '0 6px 16px -2px rgba(0,0,0,0.08), 0 2px 6px -1px rgba(0,0,0,0.04)',
        modal: '0 24px 64px -12px rgba(15, 23, 42, 0.22), 0 8px 24px -4px rgba(15, 23, 42, 0.1)',
        dropdown: '0 12px 32px -4px rgba(15, 23, 42, 0.12), 0 4px 12px -2px rgba(15, 23, 42, 0.06)',
        sidebar: '2px 0 8px 0 rgba(0,0,0,0.03)',
        'sheet': '0 -4px 24px -4px rgba(15, 23, 42, 0.12), 0 -2px 8px -2px rgba(15, 23, 42, 0.06)',
        'bottomnav': '0 -1px 3px 0 rgba(0,0,0,0.06), 0 -1px 2px -1px rgba(0,0,0,0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease forwards',
        'slide-up': 'slideUp 200ms ease forwards',
        'slide-down': 'slideDown 200ms ease forwards',
        'slide-up-sheet': 'slideUpSheet 220ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'slide-down-sheet': 'slideDownSheet 180ms cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'pulse-highlight': 'pulseHighlight 600ms ease forwards',
        'skeleton-wave': 'skeletonWave 1.5s infinite',
        'scale-in': 'scaleIn 180ms ease forwards',
        'backdrop-in': 'backdropIn 200ms ease forwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUpSheet: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        slideDownSheet: {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(100%)' },
        },
        pulseHighlight: {
          '0%': { backgroundColor: 'transparent' },
          '30%': { backgroundColor: '#fef9c3' },
          '100%': { backgroundColor: 'transparent' },
        },
        skeletonWave: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        backdropIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        rowExit: {
          from: { opacity: '1', maxHeight: '56px' },
          to: { opacity: '0', maxHeight: '0', paddingTop: '0', paddingBottom: '0' },
        },
      },
      transitionTimingFunction: {
        'sheet': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      maxWidth: {
        'page': '1400px',
      },
      minHeight: {
        'touch': '44px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};