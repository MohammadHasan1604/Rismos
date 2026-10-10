'use client';

import React, { useState } from 'react';
import {
  validatePassword,
  getPasswordStrengthDisplay,
  PasswordValidationResult,
} from '@/lib/passwordPolicy';
import { toast } from 'sonner';

interface ChangePasswordFormProps {
  onSuccess?: () => void;
  userId?: string;
}

export function ChangePasswordForm({ onSuccess, userId }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validation, setValidation] = useState<PasswordValidationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pwd = e.target.value;
    setNewPassword(pwd);

    if (pwd.length > 0) {
      const result = validatePassword(pwd);
      setValidation(result);
    } else {
      setValidation(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Current password is required');
      return;
    }

    if (!validation?.valid) {
      setError(validation?.errors[0] || 'Password does not meet enterprise security requirements');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Password update failed');
      }

      toast.success('Password updated successfully! All other sessions revoked.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setValidation(null);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to change password');
      toast.error(err?.message || 'Failed to change password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          ⚠️ {error}
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">Current Password</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full px-3.5 py-2 bg-background border border-input rounded-xl text-xs"
          placeholder="Enter current password"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground block">
          New Password (12+ chars, uppercase, lowercase, numbers, symbols)
        </label>
        <input
          type="password"
          required
          value={newPassword}
          onChange={handlePasswordChange}
          className={`w-full px-3.5 py-2 bg-background border rounded-xl text-xs transition-colors ${
            validation?.valid
              ? 'border-emerald-500 focus:ring-emerald-500/20'
              : validation && validation.errors.length > 0
                ? 'border-red-500 focus:ring-red-500/20'
                : 'border-input'
          }`}
          placeholder="Enter strong 12+ chars password"
        />

        {validation && (
          <div className="pt-1 space-y-1">
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
          Confirm New Password
        </label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-3.5 py-2 bg-background border border-input rounded-xl text-xs"
          placeholder="Confirm new password"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || (validation !== null && !validation.valid)}
        className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Updating Password...' : 'Update Password'}
      </button>
    </form>
  );
}
