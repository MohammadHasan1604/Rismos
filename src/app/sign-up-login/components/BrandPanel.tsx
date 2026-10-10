'use client';

import React from 'react';
import AppLogo from '@/components/ui/AppLogo';
import { useApp } from '@/context/AppContext';

export default function BrandPanel() {
  const { branding } = useApp();
  const appName = branding?.appName || 'RISMOS';
  const tagline = branding?.tagline || 'Run Retail. Smarter.';
  const primaryColor = branding?.primaryColor || '#002E86';
  const secondaryColor = branding?.secondaryColor || '#009ADF';

  return (
    <div
      className="hidden lg:flex lg:w-[48%] xl:w-[52%] relative overflow-hidden flex-col justify-between p-10 xl:p-14 text-white"
      style={{
        background: `linear-gradient(145deg, ${primaryColor} 0%, #071739 60%, #020B1E 100%)`,
      }}
    >
      {/* Ambient background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -right-32 w-[32rem] h-[32rem] rounded-full blur-3xl opacity-20"
          style={{ background: secondaryColor }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-15"
          style={{ background: '#3B82F6' }}
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
          <AppLogo size={38} variant="blue-bg" showText={true} />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-medium text-blue-100 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Enterprise Cloud</span>
        </div>
      </div>

      {/* Hero Core Content */}
      <div className="relative z-10 my-auto py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-500/20 text-blue-200 text-xs font-semibold tracking-wide uppercase mb-4 border border-blue-400/20">
          Next-Gen Retail Infrastructure
        </div>

        <h1 className="text-3xl xl:text-4xl 2xl:text-5xl font-extrabold tracking-tight leading-[1.15] text-white mb-4">
          The modern platform to{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-sky-300 to-white">
            {tagline}
          </span>
        </h1>

        <p className="text-blue-100/80 text-sm xl:text-base leading-relaxed mb-8 max-w-lg">
          Synchronize point-of-sale, multi-store inventory, purchasing, international taxes, and
          financial reporting across all your locations in real time.
        </p>

        {/* Retail Capabilities Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-xl">
          {[
            {
              title: 'Sub-Second Cloud POS',
              desc: 'High-speed checkout with store-isolated transactions',
              tag: 'Realtime',
            },
            {
              title: 'Multi-Store Inventory',
              desc: 'FIFO lot tracking, stock transfers & automated reorders',
              tag: 'Warehouse',
            },
            {
              title: 'Global Tax Engine',
              desc: 'Jurisdiction-aware GST/VAT & field-mapped invoices',
              tag: 'Multi-Country',
            },
            {
              title: 'Enterprise RBAC Security',
              desc: 'Granular permissions, DB sessions & immutable audit trails',
              tag: 'Zero-Trust',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.09] border border-white/10 transition-colors backdrop-blur-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-white text-xs font-bold">{item.title}</p>
                <span className="text-[10px] font-semibold text-sky-300 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-400/20">
                  {item.tag}
                </span>
              </div>
              <p className="text-blue-200/70 text-[11px] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer System Status */}
      <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-blue-200/70">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-medium text-white/90">99.99% Uptime SLA</span>
          <span className="text-white/40">·</span>
          <span>End-to-End Encrypted</span>
        </div>
        <span className="text-[11px] text-blue-200/50">{appName} v2.4 Enterprise</span>
      </div>
    </div>
  );
}
