'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import {
  validatePassword,
  getPasswordStrengthDisplay,
  PasswordValidationResult,
} from '@/lib/passwordPolicy';

interface TokenVerificationState {
  isChecking: boolean;
  isValid: boolean;
  reason?: 'EXPIRED' | 'USED' | 'INVALID' | 'RATE_LIMITED' | 'ERROR';
  errorMessage?: string;
  emailMasked?: string;
  userName?: string;
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [verification, setVerification] = useState<TokenVerificationState>({
    isChecking: true,
    isValid: false,
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState<PasswordValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Pre-flight token verification on mount
  useEffect(() => {
    if (!token) {
      setVerification({
        isChecking: false,
        isValid: false,
        reason: 'INVALID',
        errorMessage: 'No password recovery token was provided. Please request a new reset link.',
      });
      return;
    }

    let isMounted = true;
    fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.valid) {
          setVerification({
            isChecking: false,
            isValid: true,
            emailMasked: data.emailMasked,
            userName: data.userName,
          });
        } else {
          setVerification({
            isChecking: false,
            isValid: false,
            reason: data.reason,
            errorMessage:
              data.error ||
              'This reset link is either invalid, has expired (15-minute window), or was already used.',
          });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setVerification({
          isChecking: false,
          isValid: false,
          reason: 'ERROR',
          errorMessage: 'Unable to verify reset token at this time. Please try again later.',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

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
      setError('Missing reset token. Please request a new link.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
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

  // State 1: Pre-flight check in progress
  if (verification.isChecking) {
    return (
      <div className="text-center py-10 space-y-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-muted-foreground font-medium">
          Verifying security token validity...
        </p>
      </div>
    );
  }

  // State 2: Invalid or expired token
  if (!verification.isValid) {
    const isExpired = verification.reason === 'EXPIRED';
    const isUsed = verification.reason === 'USED';

    return (
      <div className="text-center space-y-4 py-2">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-600 dark:text-red-400">
          <Icon name="ExclamationTriangleIcon" size={24} />
        </div>

        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">
            {isExpired
              ? 'Reset Link Expired'
              : isUsed
                ? 'Reset Link Already Used'
                : 'Invalid Reset Link'}
          </h2>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {verification.errorMessage ||
              'For your security, password reset links expire after 15 minutes and can only be used once.'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-2xs text-left space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <Icon name="ShieldCheckIcon" size={13} />
            <span>Why did this happen?</span>
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground dark:text-amber-300/80">
            <li>Reset links are strictly limited to a 15-minute lifespan.</li>
            <li>Each link can be redeemed exactly once.</li>
            <li>Requesting a newer link invalidates any earlier links.</li>
          </ul>
        </div>

        <div className="pt-2 space-y-2">
          <Link
            href="/auth/forgot-password"
            className="btn-primary w-full py-2.5 text-xs font-bold inline-flex items-center justify-center gap-1.5"
          >
            <span>Request a New Reset Link</span>
            <Icon name="ArrowRightIcon" size={14} />
          </Link>

          <Link
            href="/sign-up-login"
            className="w-full py-2 text-2xs text-muted-foreground hover:text-foreground font-medium block text-center"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // State 3: Reset successful
  if (success) {
    return (
      <div className="text-center space-y-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
        <Icon name="CheckCircleIcon" size={38} className="mx-auto text-emerald-500" />
        <div className="space-y-1">
          <h2 className="text-base font-bold">Password Reset Successful!</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your new credentials are now active. All active sessions have been revoked for your
            security.
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-2 text-2xs text-muted-foreground">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span>Redirecting to sign in...</span>
        </div>
      </div>
    );
  }

  // State 4: Valid token — password entry form
  return (
    <form onSubmit={handleReset} className="space-y-4">
      {verification.emailMasked && (
        <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/10 text-xs text-foreground flex items-center justify-between">
          <span className="text-muted-foreground text-2xs">Account:</span>
          <span className="font-mono font-semibold text-2xs">{verification.emailMasked}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
          <Icon name="ExclamationTriangleIcon" size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">
          New Password (12+ characters, uppercase, lowercase, numbers, symbols){' '}
          <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Enter secure password"
            autoComplete="new-password"
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
            aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                ✅ Password meets enterprise security standards
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
          autoComplete="new-password"
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
          <span>Update Password & Revoke Old Sessions</span>
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-primary/5 rounded-2xl border border-primary/10 mb-2">
            <AppLogo size={36} showText={true} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Create New Password</h1>
          <p className="text-xs text-muted-foreground">
            Please choose an enterprise-compliant password (minimum 12 characters).
          </p>
        </div>

        <Suspense
          fallback={
            <div className="text-center py-6 text-xs text-muted-foreground">
              Loading reset verification...
            </div>
          }
        >
          <ResetPasswordContent />
        </Suspense>
      </div>
    </div>
  );
}
