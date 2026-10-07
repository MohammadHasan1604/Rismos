import React from 'react';
import LoginForm from './components/LoginForm';
import BrandPanel from './components/BrandPanel';

export default function SignUpLoginPage() {
  return (
    <main className="h-dvh max-h-dvh w-full overflow-hidden flex bg-background text-foreground antialiased selection:bg-primary/20">
      {/* Left visual brand panel (Desktop & Large Screens) */}
      <BrandPanel />

      {/* Right form panel (Desktop & Mobile Unified Viewport Container) */}
      <section
        aria-label="Authentication Panel"
        className="flex-1 h-full w-full flex flex-col justify-center items-center p-4 sm:p-6 lg:p-12 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      >
        <LoginForm />
      </section>
    </main>
  );
}
