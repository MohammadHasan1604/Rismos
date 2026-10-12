'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { useApp, BrandItem } from '@/context/AppContext';
import { toast } from 'sonner';

export interface BrandModalProps {
  open: boolean;
  onClose: () => void;
  brand?: BrandItem | null;
  onSuccess?: (brandName: string, brand?: BrandItem) => void;
  initialName?: string;
  quickMode?: boolean;
  zIndex?: number;
}

export default function BrandModal({
  open,
  onClose,
  brand,
  onSuccess,
  initialName = '',
  quickMode = false,
  zIndex = 110,
}: BrandModalProps) {
  const { brands, addBrand, updateBrand, confirmAction } = useApp();

  const isEdit = Boolean(brand);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editBrandIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetBrandChanging =
      open && Boolean(brand?.id) && brand?.id !== editBrandIdRef.current;

    if (isOpening || isTargetBrandChanging) {
      prevOpenRef.current = open;
      editBrandIdRef.current = brand?.id || null;

      if (brand) {
        setName(brand.name || '');
        setCode(brand.code || '');
        setDescription(brand.description || '');
        setIsActive(brand.status === 'Active');
      } else {
        setName(initialName);
        setCode(
          initialName
            ? initialName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .slice(0, 32)
            : ''
        );
        setDescription('');
        setIsActive(true);
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editBrandIdRef.current = null;
    }
  }, [open, brand, initialName]);

  const isDirty = React.useMemo(() => {
    if (brand) {
      return (
        name !== (brand.name || '') ||
        code !== (brand.code || '') ||
        description !== (brand.description || '')
      );
    }
    return Boolean(name || code || description);
  }, [brand, name, code, description]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this brand form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEdit) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 32);
      setCode(generated);
    }
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Brand Name is required');
      return;
    }

    if (!isEdit) {
      const duplicate = brands.find((b) => b.name.toLowerCase() === cleanName.toLowerCase());
      if (duplicate) {
        toast.info(`Brand "${cleanName}" already exists. Selecting it.`);
        if (onSuccess) onSuccess(duplicate.name, duplicate);
        onClose();
        return;
      }
    }

    const cleanCode =
      code.trim().toLowerCase() ||
      cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 32);

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? `Update Brand: ${cleanName}` : 'Create Brand Master',
      subtitle: 'Please review brand name and identification code.',
      confirmLabel: isEdit ? 'Confirm & Update Brand' : 'Confirm & Create Brand',
      summaryItems: [
        { label: 'Brand Name', value: cleanName, highlighted: true },
        { label: 'Brand Code', value: cleanCode },
        { label: 'Status', value: isActive ? 'Active' : 'Inactive' },
      ],
      warningMessage: isEdit
        ? 'Updating this brand will reflect across all product catalog items.'
        : 'Once created, this brand will immediately be available for catalog products.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (isEdit && brand) {
        const res = await updateBrand(brand.id, {
          name: cleanName,
          code: cleanCode,
          description: description.trim() || undefined,
          status: isActive ? 'Active' : 'Inactive',
        });

        if (res?.success) {
          if (onSuccess) onSuccess(cleanName, res.brand);
          onClose();
        }
      } else {
        const res = await addBrand({
          name: cleanName,
          code: cleanCode,
          description: description.trim() || undefined,
          status: isActive ? 'Active' : 'Inactive',
        });

        if (res?.success) {
          if (onSuccess) onSuccess(cleanName, res.brand);
          onClose();
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving brand');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      title={
        isEdit
          ? `Edit Brand: ${brand?.name}`
          : quickMode
            ? '+ Add New Brand'
            : 'Create Brand Record'
      }
      subtitle={
        isEdit
          ? `Code: ${brand?.code}`
          : 'Centralized brand registry for product inventory & catalog'
      }
      size={quickMode ? 'compact' : 'standard'}
      zIndex={zIndex}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button
            type="button"
            onClick={handleSafeClose}
            className="btn-secondary text-xs flex-1 sm:flex-initial"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="brand-form"
            className="btn-primary text-xs font-bold gap-1.5 px-4 flex-1 sm:flex-initial"
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Icon name="CheckCircleIcon" size={14} />
                {isEdit ? 'Update Brand' : 'Create Brand'}
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="brand-form" onSubmit={handleSubmit} className="space-y-4 py-2">
        {/* Brand Name */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Brand Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="e.g. Apple, Samsung, OnePlus, Bosch"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="input-field text-xs"
          />
        </div>

        {/* Code */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Brand Slug / Code{' '}
            <span className="text-3xs text-muted-foreground font-normal">(Auto-generated)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. apple, samsung"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase())}
            className="input-field text-xs font-mono"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Description{' '}
            <span className="text-3xs text-muted-foreground font-normal">(Optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. OEM manufacturer for consumer mobile electronics"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field text-xs resize-none"
          />
        </div>

        {/* Status */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs font-semibold text-foreground">Status (Active):</span>
          <ToggleSwitch
            checked={isActive}
            onChange={setIsActive}
            size="sm"
            onText="ON"
            offText="OFF"
          />
        </div>
      </form>
    </Modal>
  );
}
