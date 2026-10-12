'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';

/**
 * Client-side guard that redirects non-Super Admin users away from restricted pages.
 * Wraps children — renders nothing and redirects if the current user is not Super Admin.
 */
export default function SuperAdminGuard({
  children,
  moduleName,
}: {
  children: React.ReactNode;
  moduleName?: string;
}) {
  const { currentUser, authStatus } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (authStatus === 'AUTHENTICATED' && currentUser.role !== 'Super Admin') {
      router.replace('/sales');
    }
  }, [authStatus, currentUser.role, router]);

  if (authStatus === 'AUTH_LOADING') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (currentUser.role !== 'Super Admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto">
            <span className="text-danger text-xl">🔒</span>
          </div>
          <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {moduleName || 'This module'} is restricted to Super Admin only. You are being
            redirected to the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
