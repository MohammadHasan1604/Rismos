'use client';
import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import Modal from '@/components/ui/Modal';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { StorageService } from '@/lib/storageService';

export default function UserProfileModal() {
  const {
    userProfileOpen,
    setUserProfileOpen,
    currentUser,
    logoutUser,
    toggleCurrentUserShift,
    updateProfileAvatar,
    changeUserPassword,
    updateUserProfile,
    branding,
    selectedStore,
    addAuditLog,
    usersList,
  } = useApp();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

  // Edit Profile Details State
  const fullUser = usersList.find((u) => u.id === currentUser.id);
  const [editName, setEditName] = useState(currentUser.name);
  const [editPhone, setEditPhone] = useState(fullUser?.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const prevOpenRef = React.useRef(false);
  useEffect(() => {
    if (!prevOpenRef.current && userProfileOpen) {
      prevOpenRef.current = true;
      setEditName(currentUser.name);
      setEditPhone(fullUser?.phone || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPass(false);
      setShowNewPass(false);
    }
    if (!userProfileOpen) {
      prevOpenRef.current = false;
    }
  }, [userProfileOpen, currentUser.name, fullUser?.phone]);

  if (!userProfileOpen) return null;

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid format! Upload a PNG, JPG, WebP, or SVG profile picture.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB limit! Upload a smaller image.');
      return;
    }

    StorageService.uploadFile('branding', file, file.name)
      .then((res) => {
        if (res.url) {
          updateProfileAvatar(res.url);
          toast.success('Avatar updated successfully!');
        }
      })
      .catch((err) => toast.error('Failed to upload avatar: ' + err.message));
  };

  const handleRemoveAvatar = () => {
    updateProfileAvatar(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast.error('Display Name is required');
      return;
    }
    setIsSavingProfile(true);
    await updateUserProfile(editName.trim(), editPhone.trim(), currentUser.avatarUrl);
    setIsSavingProfile(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirm password do not match');
      return;
    }

    setIsChangingPassword(true);
    const result = await changeUserPassword(currentPassword, newPassword, confirmPassword);
    setIsChangingPassword(false);
    if (result.success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveTab('profile');
    }
  };

  const handleLogout = () => {
    addAuditLog('Authentication', 'User Logout', `${currentUser.name} logged out of session`);
    setUserProfileOpen(false);
    logoutUser();
    toast.success('Logged out successfully');
    router.push('/sign-up-login');
  };

  return (
    <Modal
      open={userProfileOpen}
      onClose={() => setUserProfileOpen(false)}
      title="User Account & Security Profile"
      subtitle={`${branding.appName} · Enterprise RBAC & Profile Management`}
      size="standard"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors"
          >
            <Icon name="ArrowRightOnRectangleIcon" size={14} />
            Sign Out
          </button>
          <button
            type="button"
            onClick={() => setUserProfileOpen(false)}
            className="btn-secondary text-xs"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'profile'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="UserIcon" size={13} />
            Profile & Shift
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'password'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="KeyIcon" size={13} />
            Change Password
          </button>
        </div>

        {activeTab === 'profile' ? (
          <>
            {/* User Profile Header Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div className="relative group">
                  <div className="w-14 h-14 rounded-2xl bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-primary font-extrabold text-lg shadow-sm overflow-hidden">
                    {currentUser.avatarUrl ? (
                      <img
                        src={currentUser.avatarUrl}
                        alt={currentUser.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      currentUser.avatar
                    )}
                  </div>
                  <label className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white text-3xs font-bold text-center p-1">
                    <Icon name="CameraIcon" size={16} />
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp, image/svg+xml"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <h3 className="text-base font-bold text-foreground">{currentUser.name}</h3>
                  <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="badge-info text-3xs font-bold">{currentUser.role}</span>
                    <span className="badge-neutral text-3xs">{currentUser.store} Store</span>
                  </div>
                </div>
              </div>

              {/* Profile Photo Actions */}
              <div className="space-y-1.5 text-right">
                <label className="btn-secondary text-3xs py-1 px-2.5 gap-1 inline-flex items-center cursor-pointer">
                  <Icon name="ArrowUpTrayIcon" size={12} />
                  Change Photo
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp, image/svg+xml"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
                {currentUser.avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="text-3xs text-danger hover:underline block ml-auto font-semibold"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
            </div>

            {/* Duty Shift Attendance Card */}
            <div className="p-4 rounded-2xl border border-border bg-card flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold text-foreground">
                  Duty Shift & Store Scope
                </p>
                <p className="text-3xs text-muted-foreground mt-0.5">
                  Server-authoritative store assignment & attendance
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-shrink-0">
                <span className="px-2.5 py-1 rounded-full text-3xs font-extrabold bg-primary/10 text-primary border border-primary/20">
                  {currentUser.role} · {currentUser.store}
                </span>
              </div>
            </div>

            {/* Editable Profile Information */}
            <form
              onSubmit={handleSaveProfile}
              className="p-3.5 rounded-xl border border-border bg-card space-y-3"
            >
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Profile Information
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-3xs font-bold text-muted-foreground block mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input-field text-xs py-1.5"
                  />
                </div>

                <div>
                  <label className="text-3xs font-bold text-muted-foreground block mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="input-field text-xs py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="btn-primary text-3xs py-1.5 px-3 font-bold"
                >
                  {isSavingProfile ? 'Saving...' : 'Save Profile Details'}
                </button>
              </div>
            </form>

            {/* Security Credentials Summary */}
            <div className="p-3.5 rounded-xl border border-border bg-card space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Assigned Role:</span>
                <span className="font-bold text-foreground">{currentUser.role}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Store Scope:</span>
                <span className="font-bold text-foreground">{currentUser.store}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Security Level:</span>
                <span className="font-bold text-primary">
                  {currentUser.role === 'Super Admin' ? 'Level 100 (Owner)' : 'Level 20'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Active Database:</span>
                <span className="text-success font-semibold flex items-center gap-1">
                  <Icon name="CheckCircleIcon" size={13} /> MySQL Production Cluster
                </span>
              </div>
            </div>
          </>
        ) : (
          /* Secure Change Password Flow */
          <form
            onSubmit={handleChangePassword}
            className="p-4 rounded-xl border border-border bg-card space-y-3.5"
          >
            <div>
              <p className="text-xs font-bold text-foreground">Secure Password Update</p>
              <p className="text-3xs text-muted-foreground">
                Passwords are authenticated against your MySQL credential hash. Minimum 8
                characters.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Current Password *
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input-field text-xs py-2 pr-9 font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Icon name={showCurrentPass ? 'EyeSlashIcon' : 'EyeIcon'} size={15} />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  New Password *
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    placeholder="Enter new strong password (min 8 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-field text-xs py-2 pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Icon name={showNewPass ? 'EyeSlashIcon' : 'EyeIcon'} size={15} />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Re-type new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field text-xs py-2 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isChangingPassword}
                className="btn-primary text-xs font-bold px-4"
              >
                {isChangingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
