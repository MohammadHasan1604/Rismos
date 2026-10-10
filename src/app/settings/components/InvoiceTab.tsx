'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import {
  InvoiceTemplateConfig,
  DEFAULT_INVOICE_CONFIG,
  parseInvoiceTemplateConfig,
  InvoiceFieldPlacement,
} from '@/lib/invoice/invoiceTemplateSchema';
import { InvoicePrintRenderer, InvoicePrintOrder } from '@/components/invoice/InvoicePrintRenderer';

interface InvoiceTabProps {
  invoiceHeader: string;
  setInvoiceHeader: (val: string) => void;
  invoiceFooter: string;
  setInvoiceFooter: (val: string) => void;
  invoiceTerms: string;
  setInvoiceTerms: (val: string) => void;
  invoiceAccentColor: string;
  setInvoiceAccentColor: (val: string) => void;
  watermarkOpacity: number;
  setWatermarkOpacity: (val: number) => void;
  showStoreAddress: boolean;
  setShowStoreAddress: (val: boolean) => void;
  invoiceTemplateUrl: string | null;
  setInvoiceTemplateUrl: (val: string | null) => void;
  showPaymentQr: boolean;
  setShowPaymentQr: (val: boolean) => void;
  paymentUpiId: string;
  paymentBankDetails: string;
  setPaymentBankDetails: (val: string) => void;
  setPaymentUpiId: (val: string) => void;
  handleInvoiceTemplateUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  logoUrl: string | null;
  businessAddress: string;
  city: string;
  supportPhone: string;
  gstin: string;
  defaultTaxRate: number;
  isSuperAdmin: boolean;
  invoiceFieldMapping?: string | null;
  setInvoiceFieldMapping?: (val: string) => void;
}

export const InvoiceTab: React.FC<InvoiceTabProps> = ({
  invoiceHeader,
  setInvoiceHeader,
  invoiceFooter,
  setInvoiceFooter,
  invoiceTerms,
  setInvoiceTerms,
  invoiceAccentColor,
  setInvoiceAccentColor,
  watermarkOpacity,
  setWatermarkOpacity,
  showStoreAddress,
  setShowStoreAddress,
  invoiceTemplateUrl,
  setInvoiceTemplateUrl,
  showPaymentQr,
  setShowPaymentQr,
  paymentUpiId,
  setPaymentUpiId,
  paymentBankDetails,
  setPaymentBankDetails,
  handleInvoiceTemplateUpload,
  logoUrl,
  businessAddress,
  city,
  supportPhone,
  gstin,
  defaultTaxRate,
  isSuperAdmin,
  invoiceFieldMapping,
  setInvoiceFieldMapping,
}) => {
  const [showMapper, setShowMapper] = useState(false);
  const [templateConfig, setTemplateConfig] = useState<InvoiceTemplateConfig>(() =>
    parseInvoiceTemplateConfig(invoiceFieldMapping)
  );
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('businessName');

  React.useEffect(() => {
    if (invoiceFieldMapping) {
      setTemplateConfig(parseInvoiceTemplateConfig(invoiceFieldMapping));
    }
  }, [invoiceFieldMapping]);

  const updateConfig = (newCfg: InvoiceTemplateConfig) => {
    setTemplateConfig(newCfg);
    if (setInvoiceFieldMapping) {
      setInvoiceFieldMapping(JSON.stringify(newCfg));
    }
  };

  const selectedField = templateConfig.fields.find((f) => f.key === selectedFieldKey);

  const updateField = (key: string, updates: Partial<InvoiceFieldPlacement>) => {
    const newCfg: InvoiceTemplateConfig = {
      ...templateConfig,
      fields: templateConfig.fields.map((f) => (f.key === key ? { ...f, ...updates } : f)),
    };
    updateConfig(newCfg);
  };

  // Sample order for deterministic live print preview
  const sampleOrder: InvoicePrintOrder = {
    id: 'DEMO-INV-001',
    orderNo: 'INV-2026-8910',
    createdAt: new Date().toLocaleDateString(),
    store: 'Terminal 01 · Flagship Store',
    customerName: 'Enterprise Client',
    customerPhone: '+1 555 019 2834',
    customerAddress: '450 Innovation Parkway, Suite 200',
    customerTaxId: gstin || 'TAX-ID-9921',
    items: [
      {
        name: 'Enterprise Smart POS Terminal Pro',
        sku: 'POS-TRM-800',
        hsn: '8471',
        qty: 2,
        unitPrice: 450,
        taxRate: defaultTaxRate || 18,
        warrantyMonths: 12,
        lineTotal: 900,
      },
      {
        name: 'Thermal Barcode Scanner & Dock',
        sku: 'SCN-BLU-400',
        hsn: '8471',
        qty: 1,
        unitPrice: 120,
        taxRate: defaultTaxRate || 18,
        warrantyMonths: 6,
        lineTotal: 120,
      },
    ],
    subtotal: 1020,
    taxTotal: Math.round(1020 * ((defaultTaxRate || 18) / 100)),
    total: Math.round(1020 * (1 + (defaultTaxRate || 18) / 100)),
    paymentMethod: 'UPI / Card',
    referenceNo: 'TXN-99882201',
    cashierName: 'Alexander M.',
    warrantyExpiryDate: '12 Months',
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-foreground">
            Print & Digital Invoice Template Engine
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure visual template overlay, upload Canva design exports, map custom field
            placements, and preview high-density tax invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowMapper(!showMapper)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            showMapper
              ? 'bg-primary text-white border-primary shadow-xs'
              : 'bg-card text-foreground border-border hover:bg-muted'
          }`}
        >
          {showMapper ? 'Hide Field Mapper' : 'Configure Field Placements'}
        </button>
      </div>

      {/* Visual Field Mapping Designer (Collapsible) */}
      {showMapper && (
        <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <div>
              <h4 className="text-xs font-bold text-foreground">Visual Field Position Mapper</h4>
              <p className="text-2xs text-muted-foreground">
                Tune normalized percentage coordinates and visibility for each printed field.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateConfig(DEFAULT_INVOICE_CONFIG)}
              className="text-2xs text-primary hover:underline font-semibold"
            >
              Reset Field Coordinates to Default
            </button>
          </div>

          {/* Template Style Mode Selector */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
            <div>
              <span className="font-bold text-foreground text-xs block">Invoice Template Mode</span>
              <span className="text-2xs text-muted-foreground block">
                Choose between standard responsive enterprise invoice or custom field-mapped overlay
                on uploaded artwork.
              </span>
            </div>
            <div className="flex items-center gap-1.5 p-1 bg-card rounded-lg border border-border">
              <button
                type="button"
                onClick={() => updateConfig({ ...templateConfig, templateMode: 'standard' })}
                className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${
                  (templateConfig.templateMode || 'standard') === 'standard'
                    ? 'bg-primary text-white shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Standard Responsive
              </button>
              <button
                type="button"
                onClick={() => updateConfig({ ...templateConfig, templateMode: 'custom_mapped' })}
                className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors ${
                  templateConfig.templateMode === 'custom_mapped'
                    ? 'bg-primary text-white shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Custom Mapped Overlay
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Field Picker List */}
            <div className="border border-border rounded-xl p-2 max-h-60 overflow-y-auto space-y-1">
              {templateConfig.fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSelectedFieldKey(f.key)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-2xs font-medium flex items-center justify-between transition-colors ${
                    selectedFieldKey === f.key
                      ? 'bg-primary text-white font-bold'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <span className="truncate">{f.label}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      f.visible ? 'bg-emerald-400' : 'bg-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Field Position & Styling Controls */}
            {selectedField ? (
              <div className="md:col-span-2 space-y-3 bg-muted/30 p-3.5 rounded-xl border border-border">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-foreground text-xs">{selectedField.label}</h5>
                  <label className="flex items-center gap-1.5 text-2xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedField.visible}
                      onChange={(e) =>
                        updateField(selectedField.key, { visible: e.target.checked })
                      }
                      className="rounded border-input text-primary"
                    />
                    <span>Visible on Invoice</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-2xs font-semibold text-muted-foreground block mb-1">
                      X Position: {selectedField.xPercent}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={selectedField.xPercent}
                      onChange={(e) =>
                        updateField(selectedField.key, { xPercent: Number(e.target.value) })
                      }
                      className="w-full accent-primary"
                    />
                  </div>

                  <div>
                    <label className="text-2xs font-semibold text-muted-foreground block mb-1">
                      Y Position: {selectedField.yPercent}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={selectedField.yPercent}
                      onChange={(e) =>
                        updateField(selectedField.key, { yPercent: Number(e.target.value) })
                      }
                      className="w-full accent-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-2xs font-semibold text-muted-foreground block mb-1">
                      Font Size (pt/px)
                    </label>
                    <input
                      type="number"
                      min="8"
                      max="32"
                      value={selectedField.fontSize}
                      onChange={(e) =>
                        updateField(selectedField.key, { fontSize: Number(e.target.value) || 11 })
                      }
                      className="input-field text-xs w-full"
                    />
                  </div>

                  <div>
                    <label className="text-2xs font-semibold text-muted-foreground block mb-1">
                      Alignment
                    </label>
                    <select
                      value={selectedField.textAlign}
                      onChange={(e) =>
                        updateField(selectedField.key, {
                          textAlign: e.target.value as 'left' | 'center' | 'right',
                        })
                      }
                      className="input-field text-xs w-full"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* LIVE INVOICE PRINT PREVIEW */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Print-Accurate Deterministic Output Preview
          </span>
          <div className="flex items-center gap-2">
            <span className="text-3xs font-mono text-muted-foreground">
              Watermark: {watermarkOpacity}% opacity
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="text-2xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <Icon name="PrinterIcon" size={13} />
              <span>Test Browser Print</span>
            </button>
          </div>
        </div>

        <div className="p-2 sm:p-4 bg-slate-100 rounded-xl overflow-hidden border border-slate-300 shadow-inner">
          <InvoicePrintRenderer
            order={sampleOrder}
            branding={{
              appName: invoiceHeader,
              businessName: invoiceHeader,
              businessAddress,
              city,
              supportPhone,
              logoUrl,
            }}
            systemSettings={{
              invoiceHeader,
              invoiceFooter,
              invoiceTerms,
              invoiceTemplateUrl,
              watermarkOpacity,
              showStoreAddress,
              showPaymentQr,
              paymentUpiId,
              paymentBankDetails,
              taxRegistrationNumber: gstin,
              defaultTaxRate,
            }}
            templateConfig={templateConfig}
          />
        </div>
      </div>

      {/* Template Configuration Controls */}
      <div className="space-y-4 text-xs">
        {/* Upload Custom Canva / Graphic Background */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
          <label className="font-bold text-foreground block">
            Custom Canva Background Template Upload
          </label>
          <p className="text-2xs text-muted-foreground leading-relaxed">
            Upload custom PDF/PNG/WebP designs exported from Canva or Adobe. All dynamic fiscal data
            and product tables will overlay accurately over your custom artwork.
          </p>
          <div className="flex items-center gap-3 pt-1">
            {isSuperAdmin && (
              <label className="btn-secondary text-xs cursor-pointer gap-2 inline-flex items-center">
                <Icon name="ArrowUpTrayIcon" size={14} />
                <span>Upload Design Image / PDF</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/svg+xml, application/pdf"
                  onChange={handleInvoiceTemplateUpload}
                  className="hidden"
                />
              </label>
            )}
            {invoiceTemplateUrl && isSuperAdmin && (
              <button
                type="button"
                onClick={() => setInvoiceTemplateUrl(null)}
                className="btn-ghost text-xs text-danger hover:bg-danger/10"
              >
                Remove Uploaded Background
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="font-bold text-foreground block mb-1">
            Invoice Header Business Title *
          </label>
          <input
            type="text"
            required
            disabled={!isSuperAdmin}
            value={invoiceHeader}
            onChange={(e) => setInvoiceHeader(e.target.value)}
            className="input-field text-xs font-bold"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-bold text-foreground block mb-1">
              Watermark Opacity ({watermarkOpacity}%)
            </label>
            <input
              type="range"
              min="0"
              max="25"
              disabled={!isSuperAdmin}
              value={watermarkOpacity}
              onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-2xs text-muted-foreground mt-0.5">
              Renders authentic brand emblem watermark across invoice body.
            </p>
          </div>

          <div>
            <label className="font-bold text-foreground block mb-1">Accent Styling</label>
            <select
              disabled={!isSuperAdmin}
              value={invoiceAccentColor}
              onChange={(e) => setInvoiceAccentColor(e.target.value)}
              className="input-field text-xs"
            >
              <option value="primary">Brand Primary Color (Default)</option>
              <option value="emerald">Emerald Retail</option>
              <option value="navy">Classic Navy</option>
              <option value="amber">Warm Amber</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
          <div>
            <span className="font-bold text-foreground block text-xs">
              Show Store Terminal Address on Invoices
            </span>
            <span className="text-2xs text-muted-foreground block">
              Include outlet physical address and store manager contact details.
            </span>
          </div>
          <ToggleSwitch
            id="showStore"
            disabled={!isSuperAdmin}
            checked={showStoreAddress}
            onChange={setShowStoreAddress}
            size="sm"
            onText="ON"
            offText="OFF"
          />
        </div>

        {/* Payment QR Settings */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-foreground block text-xs">
                Instant Digital Payment QR Code
              </span>
              <span className="text-2xs text-muted-foreground block">
                Print instant payment QR code on generated A4 invoices and checkout slips.
              </span>
            </div>
            <ToggleSwitch
              id="showQr"
              disabled={!isSuperAdmin}
              checked={showPaymentQr}
              onChange={setShowPaymentQr}
              size="sm"
              onText="ON"
              offText="OFF"
            />
          </div>

          {showPaymentQr && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="font-bold text-foreground block mb-1">Payment ID / VPA</label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={paymentUpiId}
                  onChange={(e) => setPaymentUpiId(e.target.value)}
                  placeholder="pay@bank"
                  className="input-field text-xs font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">
                  Bank Settlement Details
                </label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={paymentBankDetails}
                  onChange={(e) => setPaymentBankDetails(e.target.value)}
                  placeholder="Bank Name · A/C 00000 · Routing/IFSC"
                  className="input-field text-xs font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* Invoice Terms & Warranty Conditions */}
        <div>
          <label className="font-bold text-foreground block mb-1">
            Terms, Conditions & Warranty Policy
          </label>
          <textarea
            rows={3}
            disabled={!isSuperAdmin}
            value={invoiceTerms}
            onChange={(e) => setInvoiceTerms(e.target.value)}
            className="input-field text-xs font-mono"
          />
        </div>

        <div>
          <label className="font-bold text-foreground block mb-1">Invoice Footer Greeting</label>
          <input
            type="text"
            disabled={!isSuperAdmin}
            value={invoiceFooter}
            onChange={(e) => setInvoiceFooter(e.target.value)}
            className="input-field text-xs"
          />
        </div>
      </div>
    </div>
  );
};
