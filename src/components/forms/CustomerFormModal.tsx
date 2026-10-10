'use client';
import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import NumericInput from '@/components/ui/NumericInput';
import { useApp, Customer } from '@/context/AppContext';
import { toast } from 'sonner';
import { COUNTRY_DIAL_CODES, normalizeMobileNumber } from '@/lib/phoneUtils';
import { getJurisdictionProfile } from '@/lib/localization/jurisdictions';
import { validateTaxRegistrationId } from '@/lib/taxValidation';
import TaxRegistrationField from '@/components/ui/TaxRegistrationField';

interface CustomerFormModalProps {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSuccess?: (customer: Customer) => void;
  initialPhone?: string;
  initialName?: string;
  quickMode?: boolean;
  zIndex?: number;
}

export function clean10DigitPhone(input: string, countryCode = 'IN'): string {
  return normalizeMobileNumber(input, countryCode);
}

export default function CustomerFormModal({
  open,
  onClose,
  customer,
  onSuccess,
  initialPhone = '',
  initialName = '',
  quickMode = false,
  zIndex = 100,
}: CustomerFormModalProps) {
  const {
    addCustomer,
    updateCustomer,
    confirmAction,
    currentUser,
    selectedStore,
    storesList,
    systemSettings,
    branding,
    formatCurrency,
  } = useApp();

  const countryCode = systemSettings?.countryCode || branding?.countryCode || 'IN';
  const currencySymbol = systemSettings?.currencySymbol || '₹';
  const jurProfile = getJurisdictionProfile(countryCode);
  const dialCode = COUNTRY_DIAL_CODES[countryCode] || '+91';

  const cleanPhone = (val: string): string => normalizeMobileNumber(val, countryCode);

  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const userStoreCode = (
    currentUser?.store && currentUser?.store !== 'All Stores' && currentUser?.store !== 'HQ'
      ? currentUser.store
      : 'CENTRAL'
  ).toUpperCase();

  const activePhysicalStores = React.useMemo(() => {
    return (storesList || []).filter(
      (s: any) =>
        s.status === 'Active' &&
        s.code.toUpperCase() !== 'ALL' &&
        s.code.toUpperCase() !== 'ALL STORES' &&
        s.code.toUpperCase() !== 'HQ' &&
        s.code.toUpperCase() !== 'CENTRAL'
    );
  }, [storesList]);

  const assignedStoreObj = React.useMemo(() => {
    return (storesList || []).find((s: any) => s.code.toUpperCase() === userStoreCode);
  }, [storesList, userStoreCode]);

  const assignedStoreLabel = assignedStoreObj
    ? `${userStoreCode} · ${assignedStoreObj.name}`
    : `${userStoreCode} · Retail Store`;

  const defaultSuperAdminStore = React.useMemo(() => {
    if (
      selectedStore &&
      selectedStore !== 'All Stores' &&
      selectedStore !== 'ALL' &&
      selectedStore !== 'HQ' &&
      selectedStore !== 'CENTRAL'
    ) {
      return selectedStore.toUpperCase();
    }
    return activePhysicalStores[0]?.code?.toUpperCase() || 'CENTRAL';
  }, [selectedStore, activePhysicalStores]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [serviceStore, setServiceStore] = useState<string>(
    !isSuperAdmin ? userStoreCode : defaultSuperAdminStore
  );
  const [gstin, setGstin] = useState('');
  const [tier, setTier] = useState<'VIP' | 'Regular' | 'New'>('Regular');
  const [creditBalance, setCreditBalance] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = Boolean(customer);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editCustomerIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetCustomerChanging =
      open && Boolean(customer?.id) && customer?.id !== editCustomerIdRef.current;

    if (isOpening || isTargetCustomerChanging) {
      prevOpenRef.current = open;
      editCustomerIdRef.current = customer?.id || null;

      if (customer) {
        setName(customer.name || '');
        setPhone(cleanPhone(customer.phone || ''));
        setEmail(customer.email || '');
        setCity(customer.city || '');
        setAddress(customer.address || '');
        setGstin(customer.gstin || '');
        setTier(customer.tier || 'Regular');
        setCreditBalance(
          customer.creditBalance !== undefined && customer.creditBalance !== null
            ? customer.creditBalance
            : ''
        );
        const custStore =
          customer.storeCode ||
          (customer.serviceStores && customer.serviceStores[0]) ||
          (!isSuperAdmin ? userStoreCode : defaultSuperAdminStore);
        setServiceStore(custStore);
      } else {
        setName(initialName || '');
        setPhone(cleanPhone(initialPhone || ''));
        setEmail('');
        setCity('');
        setAddress('');
        setGstin('');
        setTier('Regular');
        setCreditBalance('');
        setServiceStore(!isSuperAdmin ? userStoreCode : defaultSuperAdminStore);
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editCustomerIdRef.current = null;
    }
  }, [
    open,
    customer?.id,
    initialPhone,
    initialName,
    isSuperAdmin,
    userStoreCode,
    defaultSuperAdminStore,
  ]);

  const isDirty = React.useMemo(() => {
    if (isEdit) {
      return (
        name !== (customer?.name || '') ||
        cleanPhone(phone) !== cleanPhone(customer?.phone || '') ||
        email !== (customer?.email || '') ||
        address !== (customer?.address || '')
      );
    }
    return Boolean(name || phone || email || address || gstin || city);
  }, [isEdit, customer, name, phone, email, address, gstin, city]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this customer form. Discard them?')
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
      toast.error('Customer Name is required');
      return;
    }

    const cleanDigits = cleanPhone(phone);
    const minDigits = countryCode === 'IN' ? 10 : 7;
    if (cleanDigits.length < minDigits) {
      toast.error(`Please enter a valid mobile number (minimum ${minDigits} digits)`);
      return;
    }

    if (gstin.trim()) {
      const taxCheck = validateTaxRegistrationId(gstin, countryCode);
      if (!taxCheck.valid) {
        toast.error(taxCheck.error || `Invalid ${jurProfile.taxIdLabel || 'Tax ID'} format`);
        return;
      }
    }

    const effectiveStoreCode = !isSuperAdmin
      ? userStoreCode
      : serviceStore || defaultSuperAdminStore;
    const formattedPhone = cleanDigits.startsWith('+')
      ? cleanDigits
      : countryCode === 'IN' && cleanDigits.length === 10
        ? `${dialCode} ${cleanDigits.slice(0, 5)} ${cleanDigits.slice(5)}`
        : `${dialCode} ${cleanDigits}`;
    const cleanGstin = gstin.trim().toUpperCase();

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? `Confirm Customer Update: ${cleanName}` : 'Confirm New Customer Registration',
      subtitle: 'Please review customer profile information before saving.',
      confirmLabel: isEdit ? 'Confirm & Update Customer' : 'Confirm & Register Customer',
      summaryItems: [
        { label: 'Customer Name', value: cleanName, highlighted: true },
        { label: 'Mobile Phone', value: formattedPhone },
        {
          label: 'Customer Store / Service Location',
          value: !isSuperAdmin ? assignedStoreLabel : effectiveStoreCode,
          highlighted: true,
        },
        { label: 'Email Address', value: email.trim() || 'N/A' },
        { label: 'City / Region', value: city.trim() || 'Not specified' },
        { label: 'Customer Tier', value: tier },
        ...(creditBalance !== ''
          ? [
              {
                label: 'Credit Balance',
                value: formatCurrency(creditBalance),
              },
            ]
          : []),
        ...(cleanGstin ? [{ label: jurProfile.taxIdLabel || 'Tax ID', value: cleanGstin }] : []),
      ],
      warningMessage: isEdit
        ? 'Customer updates will reflect immediately across all POS customer lookups and CRM history.'
        : 'Once registered, this customer profile can immediately be selected for sales billing and CRM history.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (isEdit && customer) {
        const res = await updateCustomer(customer.id, {
          name: cleanName,
          phone: formattedPhone,
          email: email.trim() || undefined,
          city: city.trim() || undefined,
          address: address.trim() || undefined,
          storeCode: effectiveStoreCode,
          tier,
          creditBalance:
            creditBalance !== '' && creditBalance !== undefined && creditBalance !== null
              ? Number(creditBalance)
              : 0,
        });

        const updatedCust: Customer = {
          ...customer,
          name: cleanName,
          phone: formattedPhone,
          email: email.trim(),
          city: city.trim(),
          address: address.trim(),
          storeCode: effectiveStoreCode,
          tier,
          creditBalance:
            creditBalance !== '' && creditBalance !== undefined && creditBalance !== null
              ? Number(creditBalance)
              : 0,
        };

        toast.success(`Customer "${cleanName}" updated successfully`);
        if (onSuccess) onSuccess(updatedCust);
        onClose();
      } else {
        const res = await addCustomer({
          name: cleanName,
          phone: formattedPhone,
          email:
            email.trim() || `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}@customer.com`,
          city: city.trim(),
          address: address.trim() || undefined,
          storeCode: effectiveStoreCode,
          tier,
          creditBalance:
            creditBalance !== '' && creditBalance !== undefined && creditBalance !== null
              ? Number(creditBalance)
              : 0,
          status: 'Active',
        });

        if (res) {
          toast.success(`Customer "${cleanName}" registered successfully!`);
          if (onSuccess) onSuccess(res);
          onClose();
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleSafeClose}
      zIndex={zIndex}
      title={
        isEdit
          ? `Edit Customer: ${customer?.name}`
          : quickMode
            ? 'Quick Customer Registration'
            : 'Register New Customer'
      }
      subtitle={
        isEdit
          ? `Account: ${customer?.phone}`
          : 'Unified customer profile across POS, Orders, and Billing'
      }
      size={quickMode ? 'compact' : 'standard'}
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
            form="customer-form"
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
                    ? 'Update Customer'
                    : quickMode
                      ? 'Save & Auto-Select'
                      : 'Register Customer'}
                </span>
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-4 py-1">
        {/* Customer Store / Service Location */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Customer Store / Service Location <span className="text-danger">*</span>
          </label>
          {!isSuperAdmin ? (
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/40 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-semibold text-foreground">{assignedStoreLabel}</span>
              </div>
              <span className="badge-neutral text-3xs font-semibold px-2 py-0.5">
                Assigned Store
              </span>
            </div>
          ) : (
            <select
              value={serviceStore}
              onChange={(e) => setServiceStore(e.target.value)}
              className="input-field text-xs font-medium"
              required
            >
              {activePhysicalStores.map((st: any) => (
                <option key={st.code} value={st.code}>
                  {st.code} · {st.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Full Name */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Customer Full Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="e.g. Alex Morgan, Sarah Connor"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field text-xs"
          />
        </div>

        {/* Phone & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Mobile / Phone Number <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono font-semibold">
                {dialCode}
              </span>
              <input
                type="tel"
                required
                maxLength={16}
                placeholder={countryCode === 'IN' ? '9876543210' : '501234567'}
                value={phone}
                onChange={(e) => setPhone(cleanPhone(e.target.value))}
                className="input-field pl-14 text-xs font-mono font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Email Address <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <input
              type="email"
              placeholder="customer@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field text-xs"
            />
          </div>
        </div>

        {/* Tax Registration & City */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <TaxRegistrationField
              value={gstin}
              onChange={setGstin}
              countryCode={countryCode}
              entityType="Customer"
              required={false}
              size="sm"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              City / Region <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Downtown, City Center"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input-field text-xs"
            />
          </div>
        </div>

        {/* Billing Address */}
        <div>
          <label className="text-xs font-bold text-foreground block mb-1">
            Billing / Delivery Address{' '}
            <span className="text-muted-foreground font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. 100ft Main Road, Commercial District"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="input-field text-xs"
          />
        </div>

        {/* Tier & Credit Balance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-border bg-muted/20">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">Customer Segment</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as any)}
              className="input-field text-xs font-medium"
            >
              <option value="Regular">Regular Customer</option>
              <option value="VIP">VIP / Priority</option>
              <option value="New">New Customer</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Opening Credit Balance ({currencySymbol})
            </label>
            <NumericInput
              min={0}
              step="0.01"
              allowDecimals={true}
              placeholder="e.g. 500.00"
              value={creditBalance}
              onChange={(val) => setCreditBalance(val)}
              className="text-xs font-tabular"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
