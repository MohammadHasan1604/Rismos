'use client';

import React, { useMemo, useState, useEffect } from 'react';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import { useApp } from '@/context/AppContext';

export interface PaymentMethodSelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  layout?: 'dropdown' | 'pills';
  allowAddNew?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  modalZIndex?: number;
}

interface PaymentMethodItem {
  id?: string;
  name: string;
  type?: string;
  status?: string;
  label?: string;
  sublabel?: string;
  badge?: string;
}

const BASELINE_FALLBACK: PaymentMethodItem[] = [
  { name: 'Cash', label: 'Cash', sublabel: 'Cash Currency Payment', badge: 'Cash' },
  { name: 'Card', label: 'Card', sublabel: 'Card POS Payment', badge: 'Card' },
  { name: 'Other', label: 'Other', sublabel: 'Other Payment Method', badge: 'Other' },
];

export default function PaymentMethodSelect({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  placeholder = 'Select Payment Method',
  searchPlaceholder = 'Search payment methods...',
  layout = 'dropdown',
  size = 'md',
  className = '',
}: PaymentMethodSelectProps) {
  let contextPaymentMethods: PaymentMethodItem[] | null = null;
  try {
    const appCtx = useApp();
    if (appCtx && Array.isArray(appCtx.paymentMethods)) {
      contextPaymentMethods = appCtx.paymentMethods;
    }
  } catch {
    // Component mounted outside AppProvider
  }

  const [fetchedMethods, setFetchedMethods] = useState<PaymentMethodItem[]>([]);

  useEffect(() => {
    if (!contextPaymentMethods || contextPaymentMethods.length === 0) {
      let isMounted = true;
      fetch('/api/payment-methods')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isMounted && data?.paymentMethods && Array.isArray(data.paymentMethods)) {
            setFetchedMethods(data.paymentMethods);
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [contextPaymentMethods]);

  // Authoritative source: DB PaymentMethod table (active only)
  const activeMethods: PaymentMethodItem[] = useMemo(() => {
    const source =
      contextPaymentMethods && contextPaymentMethods.length > 0
        ? contextPaymentMethods
        : fetchedMethods.length > 0
          ? fetchedMethods
          : BASELINE_FALLBACK;

    return source
      .filter((m) => !m.status || m.status === 'Active')
      .map((m) => ({
        name: m.name,
        label: m.label || m.name,
        sublabel: m.sublabel || `${m.type || m.name} payment instrument`,
        badge: m.badge || m.type || m.name,
      }));
  }, [contextPaymentMethods, fetchedMethods]);

  // Generate options for CustomSelect dropdown
  const selectOptions: SelectOption[] = useMemo(() => {
    const list: SelectOption[] = activeMethods.map((pm) => ({
      value: pm.name,
      label: pm.label || pm.name,
      sublabel: pm.sublabel,
      badge: pm.badge,
    }));

    // Data Integrity: If current value is historical/inactive, preserve and display it!
    if (value && !list.some((pm) => pm.value.toLowerCase() === value.toLowerCase())) {
      list.unshift({
        value,
        label: value,
        sublabel: 'Historical Instrument',
        badge: 'Historical',
      });
    }

    return list;
  }, [activeMethods, value]);

  if (layout === 'pills') {
    return (
      <div className={`space-y-1.5 ${className}`}>
        {label && (
          <label className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block">
            {label} {required && <span className="text-danger">*</span>}
          </label>
        )}

        <div className="grid grid-cols-3 gap-2">
          {activeMethods.map((m) => {
            const isSelected = value?.toLowerCase() === m.name.toLowerCase();
            return (
              <button
                key={`pm-pill-${m.name}`}
                type="button"
                disabled={disabled}
                onClick={() => onChange(m.name)}
                className={`h-11 px-3 rounded-xl text-xs font-bold border transition-all duration-150 flex items-center justify-center cursor-pointer min-h-[44px] ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs ring-2 ring-primary/20'
                    : 'bg-muted/30 text-foreground border-border/80 hover:border-border hover:bg-muted/60'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {m.name}
              </button>
            );
          })}

          {/* Historical fallback pill if currently selected */}
          {value && !activeMethods.some((m) => m.name.toLowerCase() === value.toLowerCase()) && (
            <button
              type="button"
              disabled={disabled}
              className="h-11 px-3 rounded-xl text-xs font-bold border border-warning/50 bg-warning/10 text-warning flex items-center justify-center gap-1.5 col-span-3 min-h-[44px]"
            >
              <span>{value}</span>
              <span className="text-4xs px-1.5 py-0.5 rounded bg-warning/20 font-mono">
                Historical
              </span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Default: Dropdown layout
  return (
    <CustomSelect
      options={selectOptions}
      value={value}
      onChange={onChange}
      label={label}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      size={size}
      className={className}
    />
  );
}
