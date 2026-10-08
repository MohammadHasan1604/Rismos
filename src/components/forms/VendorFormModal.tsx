'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import NumericInput from '@/components/ui/NumericInput';
import CategoryFormModal from './CategoryFormModal';
import { useApp, Vendor } from '@/context/AppContext';
import { toast } from 'sonner';
import { COUNTRY_DIAL_CODES } from '@/lib/phoneUtils';
import { getJurisdictionProfile } from '@/lib/localization/jurisdictions';
import { validateTaxRegistrationId } from '@/lib/taxValidation';
import TaxRegistrationField from '@/components/ui/TaxRegistrationField';

interface VendorFormModalProps {
  open: boolean;
  onClose: () => void;
  vendor?: Vendor | null;
  onSuccess?: (vendorName: string, vendor?: Vendor) => void;
  quickMode?: boolean;
  zIndex?: number;
}

export default function VendorFormModal({
  open,
  onClose,
  vendor,
  onSuccess,
  quickMode = false,
  zIndex = 100,
}: VendorFormModalProps) {
  const { addVendor, updateVendor, categoriesList, confirmAction, systemSettings, branding } = useApp();

  const countryCode = systemSettings?.countryCode || branding?.countryCode || 'IN';
  const jurProfile = getJurisdictionProfile(countryCode);
  const dialCode = COUNTRY_DIAL_CODES[countryCode] || '+91';

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [category, setCategory] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [leadTimeDays, setLeadTimeDays] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Category Child Modal State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const isEdit = Boolean(vendor);

  // Dynamic Categories from database
  const categoryOptions: SelectOption[] = useMemo(() => {
    return categoriesList
      .filter((c) => c.status !== 'Archived')
      .map((c) => ({
        value: c.name,
        label: c.name,
        sublabel: c.categoryType,
        badge: c.status === 'Active' ? undefined : c.status,
      }));
  }, [categoriesList]);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editVendorIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetVendorChanging =
      open && Boolean(vendor?.id) && vendor?.id !== editVendorIdRef.current;

    if (isOpening || isTargetVendorChanging) {
      prevOpenRef.current = open;
      editVendorIdRef.current = vendor?.id || null;

      if (vendor) {
        setName(vendor.name || '');
        setContactPerson(vendor.contactPerson || '');
        setPhone(vendor.phone || '');
        setEmail(vendor.email || '');
        setGstin(vendor.gstin || '');
        setCategory(vendor.category || '');
        setAddress(vendor.address || '');
        setPaymentTerms(vendor.paymentTerms || 'Net 30');
        setLeadTimeDays(
          vendor.leadTimeDays !== undefined && vendor.leadTimeDays !== null
            ? vendor.leadTimeDays
            : ''
        );
      } else {
        setName('');
        setContactPerson('');
        setPhone('');
        setEmail('');
        setGstin('');
        setCategory(categoryOptions[0]?.value || 'General Hardware');
        setAddress('');
        setPaymentTerms('Net 30');
        setLeadTimeDays('');
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editVendorIdRef.current = null;
    }
  }, [open, vendor?.id]);

  const isDirty = useMemo(() => {
    if (isEdit) {
      return (
        name !== (vendor?.name || '') ||
        phone !== (vendor?.phone || '') ||
        email !== (vendor?.email || '') ||
        contactPerson !== (vendor?.contactPerson || '')
      );
    }
    return Boolean(name || contactPerson || phone || email || gstin || address);
  }, [isEdit, vendor, name, phone, email, contactPerson, gstin, address]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this vendor form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Vendor / Supplier Company Name is required');
      return;
    }

    if (gstin.trim()) {
      const taxCheck = validateTaxRegistrationId(gstin, countryCode);
      if (!taxCheck.valid) {
        toast.error(taxCheck.error || `Invalid ${jurProfile.taxIdLabel || 'Tax ID'} format`);
        return;
      }
    }

    const cleanGstin = gstin.trim().toUpperCase();

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? `Confirm Vendor Update: ${cleanName}` : 'Confirm Vendor Onboarding',
      subtitle: 'Please review supplier information and payment terms before proceeding.',
      confirmLabel: isEdit ? 'Confirm & Update Vendor' : 'Confirm & Register Vendor',
      summaryItems: [
        { label: 'Vendor Name', value: cleanName, highlighted: true },
        { label: 'Contact Person', value: contactPerson.trim() || 'Account Manager' },
        { label: 'Phone', value: phone.trim() || 'N/A' },
        { label: 'Category', value: category.trim() || 'General Hardware' },
        { label: 'Payment Terms', value: paymentTerms.trim() || 'Net 30' },
        ...(cleanGstin ? [{ label: jurProfile.taxIdLabel || 'Tax ID', value: cleanGstin }] : []),
      ],
      warningMessage: isEdit
        ? 'Supplier profile modifications will immediately update across all purchase order pipelines and payable ledgers.'
        : 'Once registered, this vendor will immediately be available for purchase order procurement.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (isEdit && vendor) {
        const updateRes = await updateVendor(vendor.id, {
          name: cleanName,
          contactPerson: contactPerson.trim() || 'Account Manager',
          email: email.trim() || undefined,
          phone: phone.trim() || '',
          gstin: cleanGstin || undefined,
          category: category.trim() || 'General Hardware',
          address: address.trim() || undefined,
          paymentTerms: paymentTerms.trim() || 'Net 30',
          leadTimeDays:
            leadTimeDays !== '' && leadTimeDays !== undefined && leadTimeDays !== null
              ? Number(leadTimeDays)
              : undefined,
        });

        if (!updateRes?.success) {
          // Failure: keep modal open with typed values intact
          return;
        }

        toast.success(`Vendor "${cleanName}" updated successfully`);
        if (onSuccess) onSuccess(cleanName, { ...vendor, name: cleanName });
        onClose();
      } else {
        const created = await addVendor({
          name: cleanName,
          contactPerson: contactPerson.trim() || 'Account Manager',
          email: email.trim() || '',
          phone: phone.trim() || '',
          gstin: cleanGstin || undefined,
          category: category.trim() || 'General Hardware',
          address: address.trim() || undefined,
          paymentTerms: paymentTerms.trim() || 'Net 30',
          leadTimeDays:
            leadTimeDays !== '' && leadTimeDays !== undefined && leadTimeDays !== null
              ? Number(leadTimeDays)
              : undefined,
          outstandingPayable: 0,
          rating: 4.8,
        });

        if (!created) {
          // Failure: keep modal open with typed values intact
          return;
        }

        toast.success(`Vendor "${cleanName}" registered successfully!`);
        if (onSuccess) onSuccess(cleanName, created);
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save vendor');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleSafeClose}
        title={
          isEdit
            ? `Edit Supplier: ${vendor?.name}`
            : quickMode
              ? 'Quick Vendor Onboarding'
              : 'Onboard Supplier Vendor'
        }
        subtitle={
          isEdit
            ? `Code: ${vendor?.code || vendor?.id}`
            : 'Unified vendor directory across Purchase Orders, Accounts, and Inventory'
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
              form="vendor-form"
              className="btn-primary text-xs gap-1.5 flex-1 sm:flex-initial"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={14} />
                  <span>
                    {isEdit
                      ? 'Update Vendor'
                      : quickMode
                        ? 'Save & Select Supplier'
                        : 'Onboard Supplier'}
                  </span>
                </>
              )}
            </button>
          </div>
        }
      >
        <form id="vendor-form" onSubmit={handleSubmit} className="space-y-3.5 py-1">
          {/* Company Name */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Company / Vendor Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Apex Global Supplies, Foxconn Electronics"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-xs"
            />
          </div>

          {/* Contact Person & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">Contact Person</label>
              <input
                type="text"
                placeholder="e.g. Alex Morgan"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="input-field text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">Phone Number</label>
              <input
                type="tel"
                placeholder={`e.g. ${dialCode} 501234567`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field text-xs"
              />
            </div>
          </div>

          {/* Email & Tax Registration Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Email <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <input
                type="email"
                placeholder="orders@vendor.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field text-xs"
              />
            </div>
            <div>
              <TaxRegistrationField
                value={gstin}
                onChange={setGstin}
                countryCode={countryCode}
                entityType="Vendor"
                required={false}
                size="sm"
              />
            </div>
          </div>

          {/* Category (Dynamic Dropdown with + Add New Category) & Lead Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <CustomSelect
                label="Category / Trade"
                required
                placeholder="Select or add trade category..."
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                searchable={true}
                addNewLabel="+ Add New Category"
                onAddNew={() => setCategoryModalOpen(true)}
                size="sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Lead Time (Days)
              </label>
              <NumericInput
                min={0}
                allowDecimals={false}
                placeholder="e.g. 3"
                value={leadTimeDays}
                onChange={(val) => setLeadTimeDays(val)}
                className="text-xs font-tabular h-8"
              />
            </div>
          </div>

          {/* Address & Payment Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">Payment Terms</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="input-field text-xs font-medium"
              >
                <option value="Net 30">Net 30 Days</option>
                <option value="Net 15">Net 15 Days</option>
                <option value="Net 7">Net 7 Days</option>
                <option value="Immediate">Immediate / COD</option>
                <option value="Advance">100% Advance</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Office / Warehouse Address
              </label>
              <input
                type="text"
                placeholder="e.g. Industrial Area Phase 2, Peenya"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="input-field text-xs"
              />
            </div>
          </div>

        </form>
      </Modal>

      {/* Embedded Dynamic Category Creation Modal */}
      <CategoryFormModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onSuccess={(catName) => {
          setCategory(catName);
          toast.success(`Category "${catName}" created & selected for vendor!`);
        }}
        quickMode={true}
      />
    </>
  );
}
