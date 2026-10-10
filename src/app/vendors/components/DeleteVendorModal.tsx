'use client';

import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { Vendor, useApp } from '@/context/AppContext';
import { toast } from 'sonner';

interface DeleteVendorModalProps {
  vendor: Vendor | null;
  onClose: () => void;
  onDelete: (id: string, hard: boolean, reason?: string) => Promise<any>;
  currentUser: any;
}

export const DeleteVendorModal: React.FC<DeleteVendorModalProps> = ({
  vendor,
  onClose,
  onDelete,
  currentUser,
}) => {
  const { systemSettings } = useApp();
  const currencySymbol = systemSettings?.currencySymbol || '₹';
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!vendor) return null;

  const poCount = (vendor as any).totalBillsCount || (vendor.outstandingPayable > 0 ? 1 : 0);
  const isSuperAdmin = currentUser?.role === 'Super Admin';

  const handleArchive = async () => {
    if (!isSuperAdmin && reason.trim().length < 3) {
      toast.error(
        'Please enter a deletion reason (at least 3 characters) to submit approval request'
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await onDelete(vendor.id, false, reason.trim());
      if (res === true || res?.success) {
        onClose();
      } else {
        toast.error(res?.message || res?.error || 'Failed to archive vendor');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to process request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePermanentDelete = async () => {
    setIsSubmitting(true);
    try {
      const res = await onDelete(vendor.id, true, reason.trim());
      if (res === true || res?.success) {
        onClose();
      } else {
        toast.error(res?.message || res?.error || 'Failed to permanently delete vendor');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to permanently delete vendor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!vendor}
      onClose={isSubmitting ? () => {} : onClose}
      title={
        isSuperAdmin ? `Archive / Delete "${vendor.name}"` : `Request Deletion for "${vendor.name}"`
      }
      subtitle="Relational validation against purchase orders and financial history"
      size="standard"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-secondary text-xs cursor-pointer flex-1 sm:flex-initial"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || (!isSuperAdmin && reason.trim().length < 3)}
            onClick={handleArchive}
            className="btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 cursor-pointer disabled:opacity-50 flex-1 sm:flex-initial"
          >
            {isSubmitting
              ? 'Processing...'
              : isSuperAdmin
                ? 'Safe Archive'
                : 'Submit Deletion Request'}
          </button>
          {poCount === 0 && isSuperAdmin && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handlePermanentDelete}
              className="btn-danger text-xs font-bold px-4 cursor-pointer disabled:opacity-50 flex-1 sm:flex-initial"
            >
              {isSubmitting ? 'Deleting...' : 'Permanent Delete'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4 py-2 text-xs">
        <div
          className={`p-4 rounded-xl border ${
            poCount > 0
              ? 'bg-warning/10 border-warning/30 text-foreground'
              : 'bg-muted/40 border-border text-foreground'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <Icon
              name={poCount > 0 ? 'ExclamationTriangleIcon' : 'InformationCircleIcon'}
              size={18}
              className={
                poCount > 0 ? 'text-warning shrink-0 mt-0.5' : 'text-primary shrink-0 mt-0.5'
              }
            />
            <div>
              <p className="font-bold text-sm">
                {poCount > 0
                  ? 'Linked Procurement & Financial Records Found'
                  : 'Unused Supplier Profile'}
              </p>
              <p className="text-muted-foreground mt-1">
                {poCount > 0
                  ? `This vendor has purchase bills or an outstanding balance of ${currencySymbol}${vendor.outstandingPayable.toLocaleString()}. To protect warehouse inventory ledgers, tax records, and accounting history, it will be safely Archived.`
                  : `This vendor has no linked purchase orders. ${
                      isSuperAdmin
                        ? 'You can safely archive it or permanently delete it.'
                        : 'Store Managers submit a deletion request for Super Admin review.'
                    }`}
              </p>
            </div>
          </div>
        </div>

        {!isSuperAdmin && (
          <div className="space-y-1.5">
            <label className="text-2xs font-bold text-foreground block">
              Reason for Deletion Request <span className="text-danger">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this vendor profile should be removed (required for Super Admin approval)..."
              className="input-field text-xs py-2 w-full min-h-[60px]"
              rows={2}
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
