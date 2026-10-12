'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { useApp, UnitItem } from '@/context/AppContext';
import { toast } from 'sonner';

export interface UnitModalProps {
  open: boolean;
  onClose: () => void;
  unit?: UnitItem | null;
  onSuccess?: (unitName: string, unit?: UnitItem) => void;
  initialName?: string;
  quickMode?: boolean;
  zIndex?: number;
}

export default function UnitModal({
  open,
  onClose,
  unit,
  onSuccess,
  initialName = '',
  quickMode = false,
  zIndex = 110,
}: UnitModalProps) {
  const { units, addUnit, updateUnit, confirmAction } = useApp();

  const isEdit = Boolean(unit);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editUnitIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetUnitChanging = open && Boolean(unit?.id) && unit?.id !== editUnitIdRef.current;

    if (isOpening || isTargetUnitChanging) {
      prevOpenRef.current = open;
      editUnitIdRef.current = unit?.id || null;

      if (unit) {
        setName(unit.name || '');
        setCode(unit.code || '');
        setSymbol(unit.symbol || '');
        setDescription(unit.description || '');
        setIsActive(unit.status === 'Active');
      } else {
        setName(initialName);
        setCode(
          initialName
            ? initialName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .slice(0, 16)
            : ''
        );
        setSymbol(initialName ? initialName.toLowerCase().slice(0, 6) : '');
        setDescription('');
        setIsActive(true);
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editUnitIdRef.current = null;
    }
  }, [open, unit, initialName]);

  const isDirty = React.useMemo(() => {
    if (unit) {
      return (
        name !== (unit.name || '') ||
        code !== (unit.code || '') ||
        symbol !== (unit.symbol || '') ||
        description !== (unit.description || '')
      );
    }
    return Boolean(name || code || symbol || description);
  }, [unit, name, code, symbol, description]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this unit form. Discard them?')
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
        .slice(0, 16);
      setCode(generated);
      if (!symbol) setSymbol(generated.slice(0, 4));
    }
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Unit Name is required');
      return;
    }

    if (!isEdit) {
      const duplicate = units.find((u) => u.name.toLowerCase() === cleanName.toLowerCase());
      if (duplicate) {
        toast.info(`Unit "${cleanName}" already exists. Selecting it.`);
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
        .slice(0, 16);
    const cleanSymbol = symbol.trim() || cleanCode;

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? `Update Unit: ${cleanName}` : 'Create Unit of Measurement',
      subtitle: 'Please review unit name and symbol.',
      confirmLabel: isEdit ? 'Confirm & Update Unit' : 'Confirm & Create Unit',
      summaryItems: [
        { label: 'Unit Name', value: cleanName, highlighted: true },
        { label: 'Symbol', value: cleanSymbol },
        { label: 'Code', value: cleanCode },
        { label: 'Status', value: isActive ? 'Active' : 'Inactive' },
      ],
      warningMessage: isEdit
        ? 'Updating this unit of measurement will reflect across inventory quantities.'
        : 'Once created, this unit will immediately be available for catalog products.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (isEdit && unit) {
        const res = await updateUnit(unit.id, {
          name: cleanName,
          code: cleanCode,
          symbol: cleanSymbol,
          description: description.trim() || undefined,
          status: isActive ? 'Active' : 'Inactive',
        });

        if (res?.success) {
          if (onSuccess) onSuccess(cleanName, res.unit);
          onClose();
        }
      } else {
        const res = await addUnit({
          name: cleanName,
          code: cleanCode,
          symbol: cleanSymbol,
          description: description.trim() || undefined,
          status: isActive ? 'Active' : 'Inactive',
        });

        if (res?.success) {
          if (onSuccess) onSuccess(cleanName, res.unit);
          onClose();
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving unit');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      title={
        isEdit ? `Edit Unit: ${unit?.name}` : quickMode ? '+ Add New Unit' : 'Create Unit Record'
      }
      subtitle={
        isEdit ? `Symbol: ${unit?.symbol}` : 'Define inventory quantity units of measurement'
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
            form="unit-form"
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
                {isEdit ? 'Update Unit' : 'Create Unit'}
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="unit-form" onSubmit={handleSubmit} className="space-y-4 py-2">
        {/* Unit Name */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Unit Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="e.g. Piece, Box, Set, Kilogram, Meter"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="input-field text-xs"
          />
        </div>

        {/* Code & Symbol */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Unit Code{' '}
              <span className="text-3xs text-muted-foreground font-normal">(Auto-generated)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. pcs, box, kg"
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase())}
              className="input-field text-xs font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Symbol <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. pcs, bx, set, kg"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="input-field text-xs font-bold font-mono"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Description{' '}
            <span className="text-3xs text-muted-foreground font-normal">(Optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Standard piece count packaging"
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
