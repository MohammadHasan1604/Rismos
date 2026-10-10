'use client';

import React from 'react';
import AppLogo from '@/components/ui/AppLogo';
import { useApp } from '@/context/AppContext';

export default function BrandPanel() {
  const { branding } = useApp();
  const appName = branding?.appName || 'RISMOS';
  const tagline = branding?.tagline || 'Run Retail. Smarter.';

  return (
    <div
      className="hidden lg:flex lg:w-[46%] xl:w-[50%] relative overflow-hidden flex-col justify-between p-6 lg:p-8 xl:p-10 text-white"
      style={{
        background: 'linear-gradient(145deg, #0B1F3A 0%, #0F2A4A 60%, #07172E 100%)',
      }}
    >
      {/* Ambient background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -right-32 w-[32rem] h-[32rem] rounded-full blur-3xl opacity-20"
          style={{ background: '#123A63' }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full blur-3xl opacity-15"
          style={{ background: '#1D4ED8' }}
        />
        {/* Subtle geometric dot grid pattern */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.04]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="dot-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.5" fill="#FFFFFF" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-grid)" />
        </svg>
      </div>

      {/* Brand Header */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AppLogo size={36} variant="blue-bg" showText={true} />
        </div>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-2xs font-medium text-slate-100 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Enterprise Retail</span>
        </div>
      </div>

      {/* Hero Core Content */}
      <div className="relative z-10 my-auto py-2 xl:py-4">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-lg bg-blue-500/15 text-blue-200 text-3xs font-bold tracking-wider uppercase mb-2.5 border border-blue-400/20">
          Multi-Store Retail Terminal
        </div>

        <h1 className="text-2xl xl:text-3xl 2xl:text-4xl font-extrabold tracking-tight leading-tight text-white mb-2">
          The modern platform to{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-100 via-sky-200 to-white">
            {tagline}
          </span>
        </h1>

        <p className="text-slate-200/80 text-xs xl:text-sm leading-relaxed mb-4 max-w-lg">
          Synchronize point-of-sale, inventory control, purchases, international taxes, and
          financial analytics across all your stores.
        </p>

        {/* Retail Capabilities Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl">
          {[
            {
              title: 'Cloud Point-of-Sale',
              desc: 'High-speed checkout with store-isolated transactions',
              tag: 'POS',
            },
            {
              title: 'Multi-Store Inventory',
              desc: 'FIFO lot tracking, stock transfers & low-stock alerts',
              tag: 'Inventory',
            },
            {
              title: 'Fiscal Tax Engine',
              desc: 'Jurisdiction-aware GST/VAT & field-mapped invoices',
              tag: 'Compliance',
            },
            {
              title: 'Role-Based Access Control',
              desc: 'Granular permissions, secure sessions & audit activity logs',
              tag: 'Security',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-2.5 xl:p-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.09] border border-white/10 transition-colors backdrop-blur-xs"
            >
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-white text-xs font-bold">{item.title}</p>
                <span className="text-3xs font-semibold text-sky-200 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-400/20">
                  {item.tag}
                </span>
              </div>
              <p className="text-slate-300/75 text-3xs leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer System Status */}
      <div className="relative z-10 pt-3 xl:pt-4 border-t border-white/10 flex items-center justify-between text-2xs text-slate-300/70">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="font-medium text-white/90">Role-Based Security</span>
          <span className="text-white/40">·</span>
          <span>Store-Isolated Operations</span>
        </div>
        <span className="text-3xs text-slate-300/50">{appName} Enterprise Edition</span>
      </div>
    </div>
  );
}
