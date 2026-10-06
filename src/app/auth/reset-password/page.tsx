'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { validatePassword, getPasswordStrengthDisplay, PasswordValidationResult } from '@/lib/passwordPolicy';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState<PasswordValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewPassword(val);
    if (val.length > 0) {
      setValidation(validatePassword(val));
    } else {
      setValidation(null);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Missing or invalid reset token. Please request a new link.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const check = validatePassword(newPassword);
    if (!check.valid) {
      setError(check.errors[0] || 'Password does not meet enterprise security requirements');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken: token, newPassword }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Password reset failed');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/sign-up-login');
      }, 2500);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          ⚠️ Missing or invalid password reset token. Please request a new reset link.
        </div>
        <Link href="/auth/forgot-password" className="btn-primary text-xs font-bold inline-block">
          Request New Reset Link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center space-y-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
        <Icon name="CheckCircleIcon" size={36} className="mx-auto text-emerald-500" />
        <div className="space-y-1">
          <h2 className="text-base font-bold">Password Reset Successful!</h2>
          <p className="text-xs text-muted-foreground">
            All previous sessions have been revoked. Redirecting to sign in...
          </p>
        </div>
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <form onSubmit={handleReset} className="space-y-4">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
          <Icon name="ExclamationTriangleIcon" size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">
          New Password (12+ characters, uppercase, lowercase, numbers, symbols) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Enter secure password"
            value={newPassword}
            onChange={handlePasswordChange}
            className={`w-full px-3.5 py-2.5 bg-background border rounded-xl text-xs pr-10 ${
              validation?.valid
                ? 'border-emerald-500 focus:ring-emerald-500/20'
                : validation && validation.errors.length > 0
                  ? 'border-red-500 focus:ring-red-500/20'
                  : 'border-input'
            }`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} size={15} />
          </button>
        </div>

        {validation && (
          <div className="mt-1.5 space-y-1">
            <div className="text-3xs font-mono font-bold text-muted-foreground">
              {getPasswordStrengthDisplay(validation.score)}
            </div>
            {validation.errors.length > 0 && (
              <ul className="text-3xs text-red-600 dark:text-red-400 space-y-0.5">
                {validation.errors.map((err, i) => (
                  <li key={i}>❌ {err}</li>
                ))}
              </ul>
            )}
            {validation.valid && (
              <p className="text-3xs text-emerald-600 dark:text-emerald-400 font-semibold">
                ✅ Password meets all requirements
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">
          Confirm New Password <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          required
          placeholder="Re-enter password to confirm"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-xs"
        />
      </div>

      <button
        type="submit"
        disabled={loading || (validation !== null && !validation.valid)}
        className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-all"
      >
        {loading ? (
          <>
            <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
            <span>Updating Password...</span>
          </>
        ) : (
          <span>Set New Password</span>
        )}
      </button>

      <div className="text-center pt-2 border-t border-border">
        <Link
          href="/sign-up-login"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
        >
          <Icon name="ArrowLeftIcon" size={12} />
          <span>Cancel & Return to Sign In</span>
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-primary/5 rounded-2xl border border-primary/10 mb-2">
            <AppLogo size={36} showText={true} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Create New Password
          </h1>
          <p className="text-xs text-muted-foreground">
            Please choose an enterprise-compliant password (minimum 12 characters).
          </p>
        </div>

        <Suspense fallback={<div className="text-center py-6 text-xs text-muted-foreground">Loading reset verification...</div>}>
          <ResetPasswordContent />
        </Suspense>
      </div>
    </div>
  );
}
