'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Active cooldown interval counter
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const executeSend = async (targetEmail: string) => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/send-reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset link');
      }

      setSubmitted(true);
      setCooldown(60); // 60-second cooldown on resends
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSend(email);
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    await executeSend(email);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-primary/5 rounded-2xl border border-primary/10 mb-2">
            <AppLogo size={36} showText={true} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Reset Your Password</h1>
          <p className="text-xs text-muted-foreground">
            Enter your official staff email to receive a secure 15-minute reset link.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Icon name="CheckCircleIcon" size={18} />
                <span>Password Reset Link Dispatched</span>
              </div>
              <p className="leading-relaxed">
                If an active staff account is registered for <strong>{email}</strong>, a secure
                single-use recovery link has been sent to your inbox.
              </p>
              <div className="p-2.5 rounded-lg bg-emerald-500/15 text-2xs space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Icon name="ClockIcon" size={13} />
                  <span>Link expires in 15 minutes</span>
                </p>
                <p className="text-muted-foreground dark:text-emerald-300/80">
                  Please check your spam or junk folder if you don&apos;t see the email within 1 minute.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <Icon name="ExclamationTriangleIcon" size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Resend Action with Cooldown */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={loading || cooldown > 0}
                className="w-full py-2.5 px-4 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs border border-border shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <Icon name="ArrowPathIcon" size={15} className="animate-spin" />
                    <span>Resending Email...</span>
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <Icon name="ClockIcon" size={15} />
                    <span>Resend available in {cooldown}s</span>
                  </>
                ) : (
                  <>
                    <Icon name="ArrowPathIcon" size={15} />
                    <span>Resend Recovery Email</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setError('');
                }}
                className="w-full py-2 text-2xs text-muted-foreground hover:text-foreground font-medium text-center"
              >
                Use a different email address
              </button>
            </div>

            <div className="pt-2 border-t border-border text-center">
              <Link
                href="/sign-up-login"
                className="btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Icon name="ArrowLeftIcon" size={14} />
                <span>Return to Sign In</span>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <Icon name="ExclamationTriangleIcon" size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">
                Staff Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary pl-10"
                />
                <Icon
                  name="EnvelopeIcon"
                  size={16}
                  className="absolute left-3.5 top-3 text-muted-foreground"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                  <span>Sending Recovery Link...</span>
                </>
              ) : (
                <>
                  <span>Send Recovery Link</span>
                  <Icon name="PaperAirplaneIcon" size={14} />
                </>
              )}
            </button>

            <div className="text-center pt-2 border-t border-border">
              <Link
                href="/sign-up-login"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
              >
                <Icon name="ArrowLeftIcon" size={12} />
                <span>Back to Sign In</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
