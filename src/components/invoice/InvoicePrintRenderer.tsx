'use client';

import React from 'react';
import AppLogo from '@/components/ui/AppLogo';
import { formatMoney, formatTaxLabel } from '@/lib/localization';
import {
  InvoiceTemplateConfig,
  parseInvoiceTemplateConfig,
} from '@/lib/invoice/invoiceTemplateSchema';

export interface InvoicePrintOrder {
  id: string;
  orderNo: string;
  createdAt: string;
  store: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerTaxId?: string;
  items: Array<{
    name: string;
    sku?: string;
    hsn?: string;
    qty: number;
    unitPrice: number;
    taxRate?: number;
    warrantyMonths?: number;
    lineTotal?: number;
  }>;
  subtotal: number;
  taxTotal: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  referenceNo?: string;
  cashierName?: string;
  warrantyExpiryDate?: string;
}

interface InvoicePrintRendererProps {
  order: InvoicePrintOrder;
  branding: any;
  systemSettings: any;
  templateConfig?: InvoiceTemplateConfig;
  className?: string;
}

export const InvoicePrintRenderer: React.FC<InvoicePrintRendererProps> = ({
  order,
  branding,
  systemSettings,
  templateConfig,
  className = '',
}) => {
  const config = templateConfig || parseInvoiceTemplateConfig(systemSettings?.invoiceFieldMapping);

  const currencyCode = systemSettings?.currencyCode || branding?.baseCurrency?.slice(0, 3) || 'INR';
  const locale = systemSettings?.locale || branding?.locale || 'en-IN';
  const taxLabel = formatTaxLabel(systemSettings);
  const appName = branding?.appName || 'RISMOS';
  const primaryColor = branding?.primaryColor || '#002E86';

  const taxRegistrationNumber =
    systemSettings?.taxRegistrationNumber ||
    systemSettings?.gstin ||
    branding?.taxNumber ||
    '';

  const watermarkOpacity =
    (systemSettings?.watermarkOpacity !== undefined
      ? systemSettings.watermarkOpacity
      : config.watermarkOpacity) / 100;

  return (
    <div
      className={`invoice-print-container bg-white text-slate-900 font-sans p-6 sm:p-8 rounded-xl shadow-xs relative overflow-hidden text-xs max-w-3xl mx-auto border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none ${className}`}
      style={{
        minHeight: '297mm', // A4 printable page guideline
      }}
    >
      {/* Print Stylesheet injection */}
      <style jsx global>{`
        @media print {
          @page {
            size: auto;
            margin: 10mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .invoice-print-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Uploaded Background Template (if configured by client) */}
      {systemSettings?.invoiceTemplateUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
          style={{
            backgroundImage: `url(${systemSettings.invoiceTemplateUrl})`,
            opacity: config.backgroundOpacity / 100,
          }}
        />
      )}

      {/* Watermark Overlay */}
      {watermarkOpacity > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
          style={{ opacity: watermarkOpacity }}
        >
          <div className="transform -rotate-12 select-none text-center">
            <p className="text-6xl sm:text-7xl font-extrabold uppercase tracking-widest text-slate-300">
              {appName}
            </p>
            <p className="text-sm font-semibold tracking-wide text-slate-400 mt-2">
              AUTHENTIC FISCAL RECORD
            </p>
          </div>
        </div>
      )}

      {/* Invoice Content */}
      <div className="relative z-10 flex flex-col justify-between space-y-6">
        {/* Top Header Block */}
        <div className="border-b border-slate-200 pb-5">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            {/* Business Brand Details */}
            <div className="space-y-1 max-w-sm">
              <div className="flex items-center gap-2.5 mb-2">
                <AppLogo size={36} showText={true} />
              </div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                {systemSettings?.legalBusinessName || branding?.businessName || appName}
              </h2>
              {systemSettings?.showStoreAddress && (
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  {branding?.businessAddress || '100 Feet Ring Road, Indiranagar'},{' '}
                  {branding?.city || 'Bengaluru'}, {branding?.state || 'Karnataka'}{' '}
                  {branding?.pincode ? `· ${branding.pincode}` : ''}
                </p>
              )}
              {branding?.supportPhone && (
                <p className="text-slate-600 text-[11px]">
                  Phone: <span className="font-medium text-slate-800">{branding.supportPhone}</span>
                </p>
              )}
              {taxRegistrationNumber && (
                <p className="text-slate-700 text-[11px] font-mono font-bold mt-1">
                  {taxLabel} ID: <span className="text-blue-900">{taxRegistrationNumber}</span>
                </p>
              )}
            </div>

            {/* Document Header & Metadata */}
            <div className="text-left sm:text-right space-y-1">
              <h1
                className="text-2xl font-black uppercase tracking-wider text-slate-900"
                style={{ color: primaryColor }}
              >
                TAX INVOICE
              </h1>
              <div className="space-y-0.5 text-[11px] text-slate-600 pt-1 font-mono">
                <p>
                  Invoice #: <span className="font-bold text-slate-900">{order.orderNo}</span>
                </p>
                <p>
                  Date: <span className="font-medium text-slate-900">{order.createdAt}</span>
                </p>
                <p>
                  Store Terminal: <span className="font-bold text-slate-900">{order.store}</span>
                </p>
                {order.cashierName && (
                  <p>
                    Cashier: <span className="text-slate-800">{order.cashierName}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Customer & Billing Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-[11px]">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Billed To:
            </span>
            <p className="font-bold text-slate-900 text-xs">{order.customerName}</p>
            {order.customerPhone && (
              <p className="text-slate-600 mt-0.5">Phone: {order.customerPhone}</p>
            )}
            {order.customerAddress && (
              <p className="text-slate-600 mt-0.5 leading-relaxed">{order.customerAddress}</p>
            )}
            {order.customerTaxId && (
              <p className="font-mono font-bold text-slate-800 mt-1">
                Customer {taxLabel}: {order.customerTaxId}
              </p>
            )}
          </div>

          <div className="text-left sm:text-right flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Payment Status:
              </span>
              <p className="font-bold text-emerald-700 text-xs">
                PAID VIA {order.paymentMethod?.toUpperCase()}
              </p>
              {order.referenceNo && (
                <p className="font-mono text-slate-600 mt-0.5">Ref/Txn: {order.referenceNo}</p>
              )}
            </div>
            {order.warrantyExpiryDate && (
              <div className="pt-2">
                <span className="text-[10px] font-semibold text-slate-500">Warranty Coverage:</span>
                <p className="font-bold text-slate-800">Until {order.warrantyExpiryDate}</p>
              </div>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b-2 border-slate-900 text-slate-700 uppercase font-bold text-[10px] tracking-wider">
                <th className="py-2.5 px-2">#</th>
                <th className="py-2.5 px-2">Item Description</th>
                {config.tableConfig.showSku && <th className="py-2.5 px-2 font-mono">SKU / Code</th>}
                <th className="py-2.5 px-2 text-right">Qty</th>
                <th className="py-2.5 px-2 text-right">Unit Price</th>
                {config.tableConfig.showTaxBreakdown && (
                  <th className="py-2.5 px-2 text-right">{taxLabel} %</th>
                )}
                <th className="py-2.5 px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order.items.map((item, idx) => {
                const itemTotal = item.lineTotal ?? item.unitPrice * item.qty;
                return (
                  <tr key={`inv-row-${idx}`} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-2 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-2">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      {item.warrantyMonths && config.tableConfig.showWarranty && (
                        <span className="text-[10px] text-slate-500 block">
                          {item.warrantyMonths} Months Warranty Protection
                        </span>
                      )}
                    </td>
                    {config.tableConfig.showSku && (
                      <td className="py-2.5 px-2 text-slate-600 font-mono text-[10px]">
                        {item.sku || '—'}
                      </td>
                    )}
                    <td className="py-2.5 px-2 text-right font-medium text-slate-900">{item.qty}</td>
                    <td className="py-2.5 px-2 text-right font-mono text-slate-700">
                      {formatMoney(item.unitPrice, currencyCode, locale)}
                    </td>
                    {config.tableConfig.showTaxBreakdown && (
                      <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                        {item.taxRate ?? systemSettings?.defaultTaxRate ?? 0}%
                      </td>
                    )}
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">
                      {formatMoney(itemTotal, currencyCode, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Financial Summary & Settlement */}
        <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-start justify-between gap-6">
          {/* Payment QR / Bank Details (Optional) */}
          <div className="space-y-2 text-[11px] text-slate-600 max-w-xs">
            {systemSettings?.showPaymentQr && systemSettings?.paymentUpiId && (
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                <div className="w-14 h-14 bg-white border border-slate-300 rounded p-1 flex items-center justify-center font-mono text-[9px] text-center font-bold text-slate-700">
                  QR CODE
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-xs">Instant Digital Pay</p>
                  <p className="text-[10px] font-mono text-slate-600">{systemSettings.paymentUpiId}</p>
                </div>
              </div>
            )}
            {systemSettings?.paymentBankDetails && (
              <p className="text-[10px] text-slate-500 leading-relaxed font-mono">
                {systemSettings.paymentBankDetails}
              </p>
            )}
          </div>

          {/* Totals Table */}
          <div className="w-full sm:w-72 space-y-1.5 font-mono text-right text-slate-700 text-[11px]">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">Taxable Subtotal:</span>
              <span className="font-semibold text-slate-900">
                {formatMoney(order.subtotal, currencyCode, locale)}
              </span>
            </div>

            {order.discount ? (
              <div className="flex justify-between py-0.5 text-rose-600">
                <span>Discount Applied:</span>
                <span>-{formatMoney(order.discount, currencyCode, locale)}</span>
              </div>
            ) : null}

            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">Total {taxLabel}:</span>
              <span className="font-semibold text-slate-900">
                {formatMoney(order.taxTotal, currencyCode, locale)}
              </span>
            </div>

            <div className="flex justify-between py-2 border-t-2 border-slate-900 text-sm font-extrabold text-slate-900">
              <span className="uppercase">Grand Total:</span>
              <span>{formatMoney(order.total, currencyCode, locale)}</span>
            </div>
          </div>
        </div>

        {/* Footer & Legal Terms */}
        <div className="border-t border-slate-200 pt-4 space-y-2 text-[10px] text-slate-500">
          {systemSettings?.invoiceTerms && (
            <div className="space-y-0.5">
              <p className="font-bold text-slate-700 uppercase tracking-wide">
                Terms & Warranty Conditions:
              </p>
              <p className="whitespace-pre-line leading-relaxed text-slate-600">
                {systemSettings.invoiceTerms}
              </p>
            </div>
          )}
          <p className="text-center font-bold text-slate-800 text-[11px] pt-3">
            {systemSettings?.invoiceFooter ||
              `Thank you for shopping with ${appName}! Run Retail. Smarter.`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default InvoicePrintRenderer;
