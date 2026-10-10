'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import { useApp } from '@/context/AppContext';

interface LoginFormValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

export default function LoginForm() {
  const router = useRouter();
  const { setCurrentUser, addAuditLog, branding, updateBranding } = useApp();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  const appName = branding?.appName || 'RISMOS';
  const tagline = branding?.tagline || 'Run Retail. Smarter.';
  const supportEmail = branding?.supportEmail || 'support@rismos.com';
  const primaryColor = branding?.primaryColor || '#002E86';

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  // Fetch safe public branding on mount to ensure fresh white-label identity on public screen
  useEffect(() => {
    let isMounted = true;
    fetch('/api/settings/branding')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.success && data?.branding) {
          updateBranding(data.branding);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [updateBranding]);

  // Restore active lockout from localStorage (prevents bypass via page refresh)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkLockout = () => {
      const storedLockout =
        localStorage.getItem('rismos_login_lockout_until') ||
        localStorage.getItem('cosko_login_lockout_until');

      if (storedLockout) {
        const lockoutUntil = parseInt(storedLockout, 10);
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        if (remaining > 0) {
          setLockoutSeconds(remaining);
          setError('root', {
            message: `Account is temporarily locked due to consecutive failed login attempts. Please try again in ${remaining}s.`,
          });
        } else {
          localStorage.removeItem('rismos_login_lockout_until');
          localStorage.removeItem('cosko_login_lockout_until');
          setLockoutSeconds(0);
          clearErrors('root');
        }
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, [clearErrors, setError]);

  const onSubmit = async (data: LoginFormValues) => {
    if (lockoutSeconds > 0) {
      toast.error(`Account is locked. Please wait ${lockoutSeconds} seconds before trying again.`);
      return;
    }

    setIsLoading(true);
    clearErrors();

    try {
      // Production MySQL API Authentication Endpoint
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email.trim(), password: data.password }),
      });

      const result = await res.json().catch(() => null);

      if (res.ok && result?.success && result?.user) {
        // Clear any stored lockout
        if (typeof window !== 'undefined') {
          localStorage.removeItem('rismos_login_lockout_until');
          localStorage.removeItem('cosko_login_lockout_until');
        }
        setLockoutSeconds(0);

        setCurrentUser(result.user);
        addAuditLog(
          'Authentication',
          'User Login',
          `Signed in as ${result.user.role} (${result.user.email})`
        );
        toast.success(`Welcome back, ${result.user.name}!`);

        // Phase 1 Requirement: Successful login continues directly to /sales
        router.push('/sales');
        return;
      } else {
        if (res.status === 429 || result?.locked) {
          const retryAfter = result?.retryAfter || 900;
          if (typeof window !== 'undefined') {
            const expireTime = String(Date.now() + retryAfter * 1000);
            localStorage.setItem('rismos_login_lockout_until', expireTime);
            localStorage.setItem('cosko_login_lockout_until', expireTime);
          }
          setLockoutSeconds(retryAfter);
          setError('root', {
            message:
              result?.error ||
              `Account is temporarily locked due to consecutive failed login attempts. Please try again in ${retryAfter}s.`,
          });
          toast.error('Account temporarily locked due to consecutive failed login attempts');
        } else {
          setError('root', {
            message:
              result?.error ||
              result?.message ||
              'Invalid email or password. Please verify your login credentials.',
          });
        }
      }
    } catch {
      setError('root', {
        message: 'Network authentication error. Please verify your connection and database status.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isLocked = lockoutSeconds > 0;

  return (
    <div className="w-full flex flex-col justify-between max-w-md mx-auto my-auto">
      {/* Mobile Branding Header - Exclusively optimized for mobile / tablet screens */}
      <div className="lg:hidden text-center mb-6 pt-2">
        <div className="inline-flex items-center justify-center p-3 bg-card border border-border/70 rounded-2xl shadow-sm mb-3">
          <AppLogo size={36} showText={true} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{appName}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{tagline}</p>
      </div>

      {/* Main Authentication Card */}
      <div className="bg-card border border-border/80 rounded-2xl shadow-xl shadow-black/5 p-6 sm:p-8 space-y-6">
        {/* Desktop Card Header */}
        <div className="hidden lg:block text-left space-y-1.5 border-b border-border/50 pb-5">
          <div className="flex items-center justify-between mb-2">
            <AppLogo size={32} showText={false} />
            <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/15">
              Secure Sign In
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
          <p className="text-xs text-muted-foreground">
            Sign in with your enterprise credentials to access your store terminal.
          </p>
        </div>

        {/* Security Lockout Banner */}
        {isLocked && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-3 shadow-sm">
            <Icon
              name="LockClosedIcon"
              size={18}
              className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div className="space-y-1 flex-1">
              <p className="font-bold text-xs">Security Lockout Active</p>
              <p className="text-2xs opacity-90 leading-relaxed">
                Multiple consecutive failed login attempts detected. For security, sign in is
                temporarily suspended.
              </p>
              <p className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 pt-1">
                Unlock in: {Math.floor(lockoutSeconds / 60)}m {lockoutSeconds % 60}s
              </p>
            </div>
          </div>
        )}

        {/* Root Error Message */}
        {errors.root && !isLocked && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
            <Icon name="ExclamationTriangleIcon" size={17} className="mt-0.5 flex-shrink-0" />
            <span className="leading-relaxed">{errors.root.message}</span>
          </div>
        )}

        {/* Form Fields */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                disabled={isLocked || isLoading}
                {...register('email', { required: 'Email address is required' })}
                placeholder="name@company.com"
                autoComplete="email"
                className="w-full h-11 px-3.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all pl-10 disabled:opacity-60"
              />
              <Icon
                name="EnvelopeIcon"
                size={17}
                className="absolute left-3.5 top-3 text-muted-foreground pointer-events-none"
              />
            </div>
            {errors.email && (
              <p className="text-2xs text-danger font-medium mt-1.5">{errors.email.message}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground block">Password</label>
              <Link
                href="/auth/forgot-password"
                className="text-2xs text-primary hover:text-primary-hover font-medium hover:underline min-h-[32px] flex items-center"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                disabled={isLocked || isLoading}
                {...register('password', { required: 'Password is required' })}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full h-11 px-3.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all pl-10 pr-11 disabled:opacity-60"
              />
              <Icon
                name="LockClosedIcon"
                size={17}
                className="absolute left-3.5 top-3 text-muted-foreground pointer-events-none"
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={isLocked || isLoading}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1.5 h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg disabled:opacity-50"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={17} />
              </button>
            </div>
            {errors.password && (
              <p className="text-2xs text-danger font-medium mt-1.5">{errors.password.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground select-none py-1">
              <input
                type="checkbox"
                disabled={isLocked || isLoading}
                {...register('rememberMe')}
                className="w-4 h-4 rounded border-input text-primary focus:ring-primary/20 cursor-pointer"
              />
              <span className="text-xs">Keep me signed in</span>
            </label>
          </div>

          {/* Submit Button (44px min height touch target) */}
          <button
            type="submit"
            disabled={isLoading || isLocked}
            style={{
              backgroundColor: primaryColor,
            }}
            className="w-full min-h-[44px] h-11 px-4 text-white font-semibold rounded-xl text-sm shadow-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Icon name="ArrowPathIcon" size={17} className="animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : isLocked ? (
              <>
                <Icon name="LockClosedIcon" size={17} />
                <span>
                  Account Locked ({Math.floor(lockoutSeconds / 60)}m {lockoutSeconds % 60}s)
                </span>
              </>
            ) : (
              <>
                <span>Sign In to Terminal</span>
                <Icon name="ArrowRightIcon" size={17} />
              </>
            )}
          </button>
        </form>

        {/* Security & Support Info Footer */}
        <div className="pt-4 border-t border-border/60 text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon name="ShieldCheckIcon" size={14} className="text-emerald-500" />
            <span>256-bit TLS · Role-Based Access Control</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Having trouble signing in?{' '}
            <a
              href={`mailto:${supportEmail}`}
              className="text-primary hover:underline font-semibold"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>

      {/* Public bottom legal / copyright notice */}
      <div className="text-center pt-4 pb-2 lg:pb-0">
        <p className="text-[11px] text-muted-foreground/80">
          © {new Date().getFullYear()} {appName}. {tagline}
        </p>
      </div>
    </div>
  );
}
