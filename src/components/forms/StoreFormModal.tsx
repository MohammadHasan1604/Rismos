'use client';
import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { useApp, StoreHub } from '@/context/AppContext';
import { toast } from 'sonner';

interface StoreFormModalProps {
  open: boolean;
  onClose: () => void;
  store?: StoreHub | null;
  onSuccess?: (store: StoreHub) => void;
  zIndex?: number;
}

export default function StoreFormModal({
  open,
  onClose,
  store,
  onSuccess,
  zIndex = 100,
}: StoreFormModalProps) {
  const { storesList, addStoreHub, updateStoreHub, confirmAction, branding } = useApp();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [owner, setOwner] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = Boolean(store);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editStoreIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetStoreChanging =
      open && Boolean(store?.id) && store?.id !== editStoreIdRef.current;

    if (isOpening || isTargetStoreChanging) {
      prevOpenRef.current = open;
      editStoreIdRef.current = store?.id || null;

      if (store) {
        setCode(store.code || '');
        setName(store.name || '');
        setCity(store.city || '');
        setAddress(store.address || '');
        setOwner(store.owner || store.manager || '');
        setPhone(store.phone || '');
        setStatus((store.status as any) || 'Active');
      } else {
        setCode('');
        setName('');
        setCity(branding.city || '');
        setAddress('');
        setOwner('');
        setPhone('');
        setStatus('Active');
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editStoreIdRef.current = null;
    }
  }, [open, store?.id]);

  const isDirty = React.useMemo(() => {
    if (isEdit) {
      return (
        code !== (store?.code || '') ||
        name !== (store?.name || '') ||
        city !== (store?.city || '') ||
        address !== (store?.address || '') ||
        owner !== (store?.owner || store?.manager || '') ||
        phone !== (store?.phone || '')
      );
    }
    return Boolean(code || name || address || owner || phone);
  }, [isEdit, store, code, name, city, address, owner, phone]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this store form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    if (!cleanCode || !cleanName) {
      toast.error('Store Code and Store Name are required');
      return;
    }

    if (!isEdit) {
      const duplicate = storesList.find((s) => s.code.toUpperCase() === cleanCode);
      if (duplicate) {
        toast.error(
          `Store code "${cleanCode}" already exists. Please use a unique 3-4 character code.`
        );
        return;
      }
    }

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? `Confirm Store Hub Update: ${cleanName}` : 'Confirm New Store Hub Onboarding',
      subtitle: 'Please review store branch details and operational configuration.',
      confirmLabel: isEdit ? 'Confirm & Update Store' : 'Confirm & Register Store',
      summaryItems: [
        { label: 'Store Code', value: cleanCode, highlighted: true },
        { label: 'Store Name', value: cleanName },
        { label: 'City', value: city.trim() || branding.city || 'HQ City' },
        { label: 'Store Owner', value: owner.trim() || 'Store Owner' },
        { label: 'Initial Status', value: status },
      ],
      warningMessage: isEdit
        ? 'Changes to store configuration will update store selectors and multi-location reporting immediately.'
        : 'Once created, this store hub will be immediately selectable for inventory assignment, POS billing, and inter-store transfers.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (isEdit && store) {
        await updateStoreHub(store.id, {
          name: cleanName,
          city: city.trim() || branding.city || 'HQ City',
          address: address.trim() || undefined,
          owner: owner.trim() || undefined,
          manager: owner.trim() || undefined,
          phone: phone.trim() || undefined,
          status,
        });

        toast.success(`Store "${cleanName}" updated successfully!`);
        if (onSuccess) {
          onSuccess({
            ...store,
            code: cleanCode,
            name: cleanName,
            city,
            address,
            owner,
            manager: owner,
            phone,
            status,
          });
        }
        onClose();
      } else {
        const created = await addStoreHub({
          code: cleanCode,
          name: cleanName,
          city: city.trim() || branding.city || 'HQ City',
          address: address.trim() || '',
          owner: owner.trim() || '',
          manager: owner.trim() || '',
          phone: phone.trim() || '',
          status,
        });

        toast.success(`Store "${cleanName}" (${cleanCode}) registered!`);
        if (onSuccess && created) onSuccess(created);
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save store');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      zIndex={zIndex}
      title={isEdit ? `Edit Store Hub: ${store?.name}` : 'Provision New Store Hub'}
      subtitle={
        isEdit
          ? `Code: ${store?.code}`
          : 'Multi-store retail network & regional warehouse configuration'
      }
      size="standard"
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
            form="store-form"
            className="btn-primary text-xs gap-1.5 flex-1 sm:flex-initial font-bold"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Icon name="CheckIcon" size={14} />
                {isEdit ? 'Update Store' : 'Create Store Hub'}
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="store-form" onSubmit={handleSubmit} className="space-y-4 py-2">
        {/* Code & Name */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Store Code <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={8}
              autoFocus
              disabled={isEdit}
              placeholder="e.g. DXB, NYC, LON"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="input-field text-xs font-mono font-bold uppercase"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-bold text-foreground block mb-1">
              Store Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Flagship Experience Store"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-xs"
            />
          </div>
        </div>

        {/* City & Address */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              City / Metro Region <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. London, Dubai, New York, Singapore"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input-field text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Commercial Address
            </label>
            <input
              type="text"
              placeholder="e.g. 100ft Road, Indiranagar"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input-field text-xs"
            />
          </div>
        </div>

        {/* Owner & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">Store Owner Name</label>
            <input
              type="text"
              placeholder="e.g. Ananya Rao"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="input-field text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">Contact Phone</label>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field text-xs font-mono"
            />
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
          <div>
            <label className="text-xs font-bold text-foreground block">
              Store Operational Status
            </label>
            <p className="text-3xs text-muted-foreground">
              Inactive stores are excluded from inventory transfers and POS checkout.
            </p>
          </div>
          <ToggleSwitch
            checked={status === 'Active'}
            onChange={(checked) => setStatus(checked ? 'Active' : 'Inactive')}
            size="sm"
            onText="ON"
            offText="OFF"
            title="Toggle store operational status"
          />
        </div>
      </form>
    </Modal>
  );
}
