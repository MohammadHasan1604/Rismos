'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { validatePassword, getPasswordStrengthDisplay } from '@/lib/passwordPolicy';

export default function ForcePasswordChangeModal() {
  const { currentUser, changeUserPassword, setCurrentUser, logoutUser, branding } = useApp();
  const appName = branding?.appName || 'RISMOS';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // If user does not need to change password or is unauthenticated, do not render
  if (!currentUser || !currentUser.id || !currentUser.mustChangePassword || !mounted) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Please enter your initial temporary password');
      return;
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      setError(
        passwordValidation.errors[0] || 'Password does not meet enterprise security requirements'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from the temporary password');
      return;
    }

    setIsLoading(true);
    try {
      const res = await changeUserPassword(currentPassword, newPassword, confirmPassword);
      if (res.success) {
        toast.success('Your new password has been set! You now have full access.');
        // Update current user state to clear mustChangePassword
        setCurrentUser({
          ...currentUser,
          mustChangePassword: false,
        });
      } else {
        setError(res.message || 'Failed to update password');
      }
    } catch {
      setError('Network error while updating password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-card border border-border/80 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[min(90dvh,calc(var(--vv-height,100dvh)-2rem))] overflow-y-auto">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 mb-1">
            <Icon name="KeyIcon" size={24} />
          </div>
          <h2 className="text-xl font-bold text-foreground">Password Update Required</h2>
          <p className="text-xs text-muted-foreground">
            Welcome to {appName}. As a security requirement for newly provisioned and
            bootstrapped accounts, you must replace your temporary password before accessing the
            system.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
            <Icon name="ExclamationTriangleIcon" size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">
              Temporary / Initial Password *
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                placeholder="Enter temporary password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input-field text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name={showCurrent ? 'EyeSlashIcon' : 'EyeIcon'} size={15} />
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">
              New Personal Password (12+ chars, uppercase, lowercase, numbers, symbols) *
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                placeholder="Enter 12+ chars strong password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name={showNew ? 'EyeSlashIcon' : 'EyeIcon'} size={15} />
              </button>
            </div>
            {newPassword.length > 0 &&
              (() => {
                const res = validatePassword(newPassword);
                return (
                  <div className="mt-1.5 space-y-1">
                    <div className="text-3xs font-mono font-semibold text-muted-foreground">
                      {getPasswordStrengthDisplay(res.score)}
                    </div>
                    {res.errors.length > 0 && (
                      <p className="text-3xs text-danger">⚠️ {res.errors[0]}</p>
                    )}
                    {res.valid && (
                      <p className="text-3xs text-emerald-500 font-semibold">
                        ✅ Password meets all requirements
                      </p>
                    )}
                  </div>
                );
              })()}
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              placeholder="Confirm new secure password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field text-xs"
            />
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-2.5 text-xs font-bold"
            >
              {isLoading ? 'Saving New Password...' : 'Set Password & Enter System'}
            </button>

            <button
              type="button"
              onClick={() => logoutUser()}
              className="btn-ghost text-xs text-muted-foreground hover:text-foreground w-full py-1.5"
            >
              Cancel & Log Out
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
