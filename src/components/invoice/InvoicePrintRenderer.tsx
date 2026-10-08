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
  // Transaction-time historical snapshot fields
  countryCode?: string;
  currencyCode?: string;
  currencySymbol?: string;
  taxRegime?: string;
  taxRegistrationSnapshot?: string;
  invoiceTemplateVersion?: number;
  invoiceSnapshotJson?: string | null;
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
  const snapshot = React.useMemo(() => {
    if (!order?.invoiceSnapshotJson) return null;
    try {
      return typeof order.invoiceSnapshotJson === 'string'
        ? JSON.parse(order.invoiceSnapshotJson)
        : order.invoiceSnapshotJson;
    } catch {
      return null;
    }
  }, [order?.invoiceSnapshotJson]);

  const config = templateConfig || parseInvoiceTemplateConfig(snapshot?.invoiceFieldMapping || systemSettings?.invoiceFieldMapping);

  const countryCode =
    snapshot?.countryCode ||
    order?.countryCode ||
    systemSettings?.countryCode ||
    (branding?.baseCurrency ? branding.baseCurrency.slice(0, 3) : 'IN');

  const currencyCode =
    snapshot?.currencyCode ||
    order?.currencyCode ||
    systemSettings?.currencyCode ||
    branding?.baseCurrency?.slice(0, 3) ||
    'INR';

  const locale =
    snapshot?.locale ||
    systemSettings?.locale ||
    branding?.locale ||
    (countryCode === 'AE'
      ? 'en-AE'
      : countryCode === 'GB'
      ? 'en-GB'
      : countryCode === 'US'
      ? 'en-US'
      : countryCode === 'SA'
      ? 'en-SA'
      : countryCode === 'AU'
      ? 'en-AU'
      : countryCode === 'ZA'
      ? 'en-ZA'
      : 'en-IN');

  const legalHeader =
    snapshot?.legalHeader ||
    (countryCode === 'AE' || countryCode === 'SA' || countryCode === 'GB' || countryCode === 'ZA'
      ? 'TAX INVOICE'
      : 'TAX INVOICE');

  const taxLabel =
    snapshot?.taxIdLabel
      ? snapshot.taxIdLabel.split(' ')[0]
      : formatTaxLabel(countryCode, systemSettings?.defaultTaxRate);

  const appName = snapshot?.appName || branding?.appName || 'RISMOS';
  const primaryColor = snapshot?.invoiceAccentColor || branding?.primaryColor || '#002E86';
  const logoUrl = snapshot?.logoUrl || branding?.logoUrl || null;
  const legalBusinessName = snapshot?.businessLegalName || systemSettings?.legalBusinessName || branding?.businessName || appName;
  const supportPhone = snapshot?.supportPhone || branding?.supportPhone || '';
  const invoiceTerms = snapshot?.invoiceTerms !== undefined ? snapshot.invoiceTerms : systemSettings?.invoiceTerms;
  const invoiceFooter = snapshot?.invoiceFooter || systemSettings?.invoiceFooter;
  const invoiceTemplateUrl = snapshot?.invoiceTemplateUrl || systemSettings?.invoiceTemplateUrl || config.backgroundUrl;
  const paymentUpiId = snapshot?.paymentUpiId || systemSettings?.paymentUpiId;
  const paymentBankDetails = snapshot?.paymentBankDetails || systemSettings?.paymentBankDetails;

  const taxRegistrationNumber =
    snapshot?.taxRegistrationNumber ||
    order?.taxRegistrationSnapshot ||
    systemSettings?.taxRegistrationNumber ||
    systemSettings?.gstin ||
    branding?.taxNumber ||
    '';

  const watermarkOpacity =
    (snapshot?.watermarkOpacity !== undefined
      ? snapshot.watermarkOpacity
      : systemSettings?.watermarkOpacity !== undefined
      ? systemSettings.watermarkOpacity
      : config.watermarkOpacity) / 100;

  const businessAddress = snapshot?.businessAddress || branding?.businessAddress || '';
  const city = snapshot?.city || branding?.city || '';
  const state = snapshot?.state || branding?.state || '';
  const pincode = snapshot?.pincode || branding?.pincode || '';
  const addressParts = [businessAddress, city, state].filter(Boolean);
  const formattedAddress = addressParts.length > 0 ? addressParts.join(', ') + (pincode ? ` · ${pincode}` : '') : '';

  const isIndia = (countryCode || '').toUpperCase() === 'IN';
  const showPaymentQr = Boolean(
    (snapshot?.showPaymentQr !== undefined ? snapshot.showPaymentQr : systemSettings?.showPaymentQr) &&
      (isIndia
        ? paymentUpiId
        : paymentUpiId || paymentBankDetails)
  );

  const isCustomMapped = config.templateMode === 'custom_mapped';

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
      {invoiceTemplateUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
          style={{
            backgroundImage: `url(${invoiceTemplateUrl})`,
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

      {/* Render Mode: Custom Field-Mapped Canvas vs Standard Responsive Template */}
      {isCustomMapped ? (
        <div className="relative w-full text-slate-900 z-10" style={{ minHeight: '280mm' }}>
          {/* Mapped dynamic fields */}
          {config.fields
            .filter((f) => f.visible !== false)
            .map((field) => {
              let content: React.ReactNode = null;
              switch (field.key) {
                case 'logo':
                  content = logoUrl ? (
                    <img src={logoUrl} alt={appName} style={{ maxHeight: `${Math.round(field.fontSize * 2.5)}px` }} className="object-contain" />
                  ) : (
                    <AppLogo size={Math.round(field.fontSize * 2.5)} showText={true} />
                  );
                  break;
                case 'businessName':
                  content = (
                    <span>
                      {legalBusinessName}
                    </span>
                  );
                  break;
                case 'registeredAddress':
                case 'address':
                  content = formattedAddress ? <span>{formattedAddress}</span> : null;
                  break;
                case 'taxRegistrationNumber':
                case 'taxRegistration':
                  content = taxRegistrationNumber ? (
                    <span>
                      {taxLabel} ID: {taxRegistrationNumber}
                    </span>
                  ) : null;
                  break;
                case 'invoiceTitle':
                  content = (
                    <span style={{ color: field.color || primaryColor }}>{legalHeader}</span>
                  );
                  break;
                case 'invoiceMeta':
                case 'invoiceNumber':
                  content = (
                    <span>
                      Invoice #: {order.orderNo} · {order.createdAt}
                    </span>
                  );
                  break;
                case 'invoiceDate':
                  content = <span>Date: {order.createdAt}</span>;
                  break;
                case 'storeLocation':
                case 'store':
                  content = <span>Store: {order.store}</span>;
                  break;
                case 'customerDetails':
                case 'customerName':
                  content = (
                    <div>
                      <span className="font-bold">{order.customerName}</span>
                      {order.customerPhone && (
                        <div className="text-[10px]">{order.customerPhone}</div>
                      )}
                      {order.customerAddress && (
                        <div className="text-[10px]">{order.customerAddress}</div>
                      )}
                      {order.customerTaxId && (
                        <div className="text-[10px]">
                          {taxLabel}: {order.customerTaxId}
                        </div>
                      )}
                    </div>
                  );
                  break;
                case 'subtotal':
                  content = (
                    <span>Subtotal: {formatMoney(order.subtotal, currencyCode, locale)}</span>
                  );
                  break;
                case 'taxTotal':
                  content = (
                    <span>
                      {taxLabel}: {formatMoney(order.taxTotal, currencyCode, locale)}
                    </span>
                  );
                  break;
                case 'grandTotal':
                case 'total':
                  content = (
                    <span className="font-extrabold">
                      {formatMoney(order.total, currencyCode, locale)}
                    </span>
                  );
                  break;
                case 'paymentDetails':
                case 'paymentMethod':
                  content = (
                    <span>
                      PAID VIA {order.paymentMethod?.toUpperCase()}
                      {order.referenceNo ? ` · Ref: ${order.referenceNo}` : ''}
                    </span>
                  );
                  break;
                case 'paymentQr':
                  content = showPaymentQr && (
                    <div className="border border-slate-300 rounded p-1.5 bg-white inline-block text-center shadow-xs">
                      <div className="w-12 h-12 flex items-center justify-center font-mono text-[8px] bg-slate-50 border border-slate-200 text-slate-700 font-bold">
                        QR
                      </div>
                      <div className="text-[8px] font-mono mt-0.5 text-slate-600">
                        {isIndia ? (paymentUpiId || 'UPI') : 'DIGITAL PAY'}
                      </div>
                    </div>
                  );
                  break;
                case 'terms':
                  content = invoiceTerms ? (
                    <div className="leading-tight text-[9px] text-slate-600 whitespace-pre-line">
                      {invoiceTerms}
                    </div>
                  ) : null;
                  break;
                case 'footer':
                  content = (
                    <div>
                      {invoiceFooter ||
                        `Thank you for shopping with ${appName}! Run Retail. Smarter.`}
                    </div>
                  );
                  break;
                default:
                  content = null;
              }

              if (!content) return null;

              return (
                <div
                  key={field.id || field.key}
                  style={{
                    position: 'absolute',
                    left: `${field.xPercent}%`,
                    top: `${field.yPercent}%`,
                    width: field.widthPercent ? `${field.widthPercent}%` : undefined,
                    fontSize: `${field.fontSize}px`,
                    fontWeight:
                      field.fontWeight === 'extrabold'
                        ? 800
                        : field.fontWeight === 'bold'
                        ? 700
                        : field.fontWeight === 'medium'
                        ? 500
                        : 400,
                    textAlign: field.textAlign || 'left',
                    color: field.color || undefined,
                    transform:
                      field.textAlign === 'center'
                        ? 'translateX(-50%)'
                        : field.textAlign === 'right'
                        ? 'translateX(-100%)'
                        : undefined,
                    zIndex: 10,
                  }}
                >
                  {content}
                </div>
              );
            })}

          {/* Line items table placed at configured startYPercent */}
          {config.tableConfig?.visible !== false && (
            <div
              style={{
                position: 'absolute',
                left: '5%',
                width: '90%',
                top: `${config.tableConfig?.startYPercent || 32}%`,
                zIndex: 10,
              }}
            >
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b-2 border-slate-900 text-slate-700 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-2.5 px-2">#</th>
                    <th className="py-2.5 px-2">Item Description</th>
                    {config.tableConfig.showSku && (
                      <th className="py-2.5 px-2 font-mono">SKU / Code</th>
                    )}
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
                      <tr key={`mapped-inv-row-${idx}`} className="hover:bg-slate-50/50">
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
                        <td className="py-2.5 px-2 text-right font-medium text-slate-900">
                          {item.qty}
                        </td>
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
          )}
        </div>
      ) : (
        /* Standard Responsive Template */
        <div className="relative z-10 flex flex-col justify-between space-y-6">
          {/* Top Header Block */}
          <div className="border-b border-slate-200 pb-5">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
              {/* Business Brand Details */}
              <div className="space-y-1 max-w-sm">
                <div className="flex items-center gap-2.5 mb-2">
                  {logoUrl ? (
                    <img src={logoUrl} alt={appName} className="max-h-9 object-contain" />
                  ) : (
                    <AppLogo size={36} showText={true} />
                  )}
                </div>
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  {legalBusinessName}
                </h2>
                {systemSettings?.showStoreAddress && formattedAddress && (
                  <p className="text-slate-600 text-[11px] leading-relaxed">{formattedAddress}</p>
                )}
                {supportPhone && (
                  <p className="text-slate-600 text-[11px]">
                    Phone:{' '}
                    <span className="font-medium text-slate-800">{supportPhone}</span>
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
                  {legalHeader}
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
                  <span className="text-[10px] font-semibold text-slate-500">
                    Warranty Coverage:
                  </span>
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
                  {config.tableConfig.showSku && (
                    <th className="py-2.5 px-2 font-mono">SKU / Code</th>
                  )}
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
                      <td className="py-2.5 px-2 text-right font-medium text-slate-900">
                        {item.qty}
                      </td>
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
              {showPaymentQr && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="w-14 h-14 bg-white border border-slate-300 rounded p-1 flex items-center justify-center font-mono text-[9px] text-center font-bold text-slate-700">
                    QR CODE
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-xs">
                      {isIndia ? 'Instant Digital Pay (UPI)' : 'Instant Digital Settlement'}
                    </p>
                    {paymentUpiId && (
                      <p className="text-[10px] font-mono text-slate-600">
                        {paymentUpiId}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {paymentBankDetails && (
                <p className="text-[10px] text-slate-500 leading-relaxed font-mono">
                  {paymentBankDetails}
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

              {snapshot?.taxBreakdown && typeof snapshot.taxBreakdown === 'object' && Object.keys(snapshot.taxBreakdown).length > 0 ? (
                Object.entries(snapshot.taxBreakdown).map(([taxComponent, compAmount]) => (
                  <div key={taxComponent} className="flex justify-between py-0.5 text-slate-600">
                    <span className="text-slate-500">{taxComponent.toUpperCase()}:</span>
                    <span className="font-medium text-slate-800">
                      {formatMoney(Number(compAmount) || 0, currencyCode, locale)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Total {taxLabel}:</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(order.taxTotal, currencyCode, locale)}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-2 border-t-2 border-slate-900 text-sm font-extrabold text-slate-900">
                <span className="uppercase">Grand Total:</span>
                <span>{formatMoney(order.total, currencyCode, locale)}</span>
              </div>
            </div>
          </div>

          {/* Footer & Legal Terms */}
          <div className="border-t border-slate-200 pt-4 space-y-2 text-[10px] text-slate-500">
            {invoiceTerms && (
              <div className="space-y-0.5">
                <p className="font-bold text-slate-700 uppercase tracking-wide">
                  Terms & Warranty Conditions:
                </p>
                <p className="whitespace-pre-line leading-relaxed text-slate-600">
                  {invoiceTerms}
                </p>
              </div>
            )}
            <p className="text-center font-bold text-slate-800 text-[11px] pt-3">
              {invoiceFooter ||
                `Thank you for shopping with ${appName}! Run Retail. Smarter.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePrintRenderer;
