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
  const { setCurrentUser, addAuditLog, branding } = useApp();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '', rememberMe: true },
  });

  // Restore active lockout from localStorage (prevents bypass via page refresh)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkLockout = () => {
      const storedLockout = localStorage.getItem('cosko_login_lockout_until');
      if (storedLockout) {
        const lockoutUntil = parseInt(storedLockout, 10);
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        if (remaining > 0) {
          setLockoutSeconds(remaining);
          setError('root', {
            message: `Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in ${remaining}s.`,
          });
        } else {
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
          localStorage.removeItem('cosko_login_lockout_until');
        }
        setLockoutSeconds(0);

        setCurrentUser(result.user);
        addAuditLog(
          'Authentication',
          'User Login',
          `Signed in as ${result.user.role} (${result.user.email})`
        );
        toast.success(`Welcome back, ${result.user.name}! Signed in as ${result.user.role}`);
        router.push('/sales');
        return;
      } else {
        if (res.status === 429 || result?.locked) {
          const retryAfter = result?.retryAfter || 900;
          if (typeof window !== 'undefined') {
            localStorage.setItem(
              'cosko_login_lockout_until',
              String(Date.now() + retryAfter * 1000)
            );
          }
          setLockoutSeconds(retryAfter);
          setError('root', {
            message:
              result?.error ||
              `Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in ${retryAfter}s.`,
          });
          toast.error('Account temporarily locked due to 5 consecutive failed login attempts');
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
    <div className="bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 bg-primary/5 rounded-2xl border border-primary/10 mb-2">
          <AppLogo size={40} showText={true} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Sign In to {branding.appName || 'COSKO'}
        </h1>
        <p className="text-xs text-muted-foreground">
          {branding.tagline || 'Multi-Store Enterprise Retail & POS System'}
        </p>
      </div>

      {isLocked && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2.5 shadow-sm">
          <Icon name="LockClosedIcon" size={18} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div className="space-y-1">
            <p className="font-bold">Security Lockout Active</p>
            <p className="text-2xs text-muted-foreground">
              5 consecutive failed attempts detected. Login is temporarily disabled.
            </p>
            <p className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 mt-1">
              Time remaining: {Math.floor(lockoutSeconds / 60)}m {lockoutSeconds % 60}s
            </p>
          </div>
        </div>
      )}

      {errors.root && !isLocked && (
        <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
          <Icon name="ExclamationTriangleIcon" size={16} className="mt-0.5 flex-shrink-0" />
          <span>{errors.root.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <input
              type="email"
              disabled={isLocked}
              {...register('email', { required: 'Email address is required' })}
              placeholder="cosko@gmail.com"
              className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors pl-10 disabled:opacity-60"
            />
            <Icon
              name="EnvelopeIcon"
              size={16}
              className="absolute left-3.5 top-3 text-muted-foreground"
            />
          </div>
          {errors.email && <p className="text-2xs text-danger mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-foreground block">Password</label>
            <Link
              href="/auth/forgot-password"
              className="text-2xs text-primary hover:underline font-medium"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              disabled={isLocked}
              {...register('password', { required: 'Password is required' })}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors pl-10 pr-10 disabled:opacity-60"
            />
            <Icon
              name="LockClosedIcon"
              size={16}
              className="absolute left-3.5 top-3 text-muted-foreground"
            />
            <button
              type="button"
              disabled={isLocked}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-3 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={16} />
            </button>
          </div>
          {errors.password && (
            <p className="text-2xs text-danger mt-1">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center justify-between text-xs pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              disabled={isLocked}
              {...register('rememberMe')}
              className="rounded border-input text-primary focus:ring-primary/20"
            />
            <span>Keep me signed in</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading || isLocked}
          className="w-full py-3 px-4 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
              <span>Verifying Credentials...</span>
            </>
          ) : isLocked ? (
            <>
              <Icon name="LockClosedIcon" size={16} />
              <span>
                Account Locked ({Math.floor(lockoutSeconds / 60)}m {lockoutSeconds % 60}s)
              </span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <Icon name="ArrowRightIcon" size={16} />
            </>
          )}
        </button>
      </form>

      {/* Support Info Footer */}
      <div className="text-center pt-2 border-t border-border">
        <p className="text-2xs text-muted-foreground">
          Protected by COSKO Enterprise RBAC Security. Need help?{' '}
          <a
            href={`mailto:${branding.supportEmail || 'support@cosko.com'}`}
            className="text-primary hover:underline font-medium"
          >
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}
