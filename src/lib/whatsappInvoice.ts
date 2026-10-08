/**
 * COSKO WhatsApp Invoice Message Builder
 *
 * Generates clean, professional WhatsApp text invoice summaries for customers.
 * Contains NO internal application URLs, NO authentication gates, NO login links.
 */

import { formatMoney } from '@/lib/localization/formatters';

export interface WhatsAppInvoiceItem {
  name: string;
  qty: number;
  unitPrice?: number;
  warrantyMonths?: number;
}

export interface WhatsAppInvoiceData {
  orderNo?: string;
  invoiceNo?: string;
  customerName?: string;
  customerPhone?: string;
  store?: string;
  storeCode?: string;
  total?: number;
  totalAmount?: number;
  subtotal?: number;
  paymentMethod?: string;
  items?: WhatsAppInvoiceItem[];
  warrantyExpiryDate?: string;
  brandName?: string;
  currencyCode?: string;
  locale?: string;
}

/**
 * Extracts a valid 10-digit Indian mobile number from raw phone input.
 * Strips +91, 0, spaces, dashes, parentheses.
 */
export function extract10DigitPhone(val: string | null | undefined): string {
  if (!val) return '';
  const raw = String(val).replace(/\D/g, '');
  if (raw.startsWith('91') && raw.length === 12) return raw.slice(2);
  if (raw.startsWith('0') && raw.length === 11) return raw.slice(1);
  if (raw.length === 10) return raw;
  if (raw.length > 10) return raw.slice(-10);
  return '';
}

/**
 * Builds a clean, professional, readable WhatsApp text invoice summary.
 * NEVER includes internal /sales URLs, login paths, or credential requirements.
 */
export function buildWhatsAppInvoiceMessage(receipt: WhatsAppInvoiceData): string {
  const brand = receipt.brandName || 'RISMOS';

  // 1. Customer greeting name
  const rawName = receipt.customerName?.trim() || '';
  const isWalkIn =
    !rawName || rawName.toLowerCase() === 'walk-in customer' || rawName.toLowerCase() === 'walkin';
  const firstName = isWalkIn ? '' : rawName.split(' ')[0];
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';

  // 2. Invoice number
  const invoiceNo = receipt.orderNo || receipt.invoiceNo || 'INV-RECORD';

  // 3. Store name / code
  const store = receipt.store || receipt.storeCode || `${brand} Store`;

  // 4. Formatted Total Paid
  const totalPaid = receipt.total ?? receipt.totalAmount ?? 0;
  const currencyCode = receipt.currencyCode || 'INR';
  const locale = receipt.locale || 'en-IN';
  const decimals = Number(totalPaid) % 1 === 0 ? 0 : 2;
  const formattedAmount = formatMoney(totalPaid, { currencyCode, locale, decimals });

  // 5. Payment method
  const paymentMethod = receipt.paymentMethod || 'UPI';

  // 6. Summarized Items
  let itemsSection = '';
  const items = receipt.items || [];
  if (items.length > 0) {
    const maxVisible = 2;
    const lines = items.slice(0, maxVisible).map((item) => {
      const qtyStr = item.qty ? ` ×${item.qty}` : '';
      return `• ${item.name}${qtyStr}`;
    });

    if (items.length > maxVisible) {
      lines.push(
        `+${items.length - maxVisible} more item${items.length - maxVisible > 1 ? 's' : ''}`
      );
    }
    itemsSection = `\n*Items:*\n${lines.join('\n')}\n`;
  }

  // 7. Optional warranty notice (ONLY if real warranty data exists)
  let warrantyNotice = '';
  if (receipt.warrantyExpiryDate && receipt.warrantyExpiryDate !== '12 Months') {
    warrantyNotice = `\n*Warranty Valid Until:* ${receipt.warrantyExpiryDate}`;
  } else {
    const hasItemWarranty = items.some((it) => it.warrantyMonths && it.warrantyMonths > 0);
    if (hasItemWarranty) {
      const maxWarranty = Math.max(...items.map((it) => it.warrantyMonths || 0));
      warrantyNotice = `\n*Warranty:* ${maxWarranty} Months Official`;
    }
  }

  // 8. Assemble clean message
  return (
    `*${brand} — Purchase Invoice*\n\n` +
    `${greeting}\n` +
    `Thank you for shopping with ${brand}.\n\n` +
    `*Invoice:* ${invoiceNo}\n` +
    `*Store:* ${store}\n` +
    `*Total Paid:* ${formattedAmount}\n` +
    `*Payment:* ${paymentMethod}` +
    warrantyNotice +
    `\n` +
    itemsSection +
    `\nYour purchase has been successfully billed.\n\n` +
    `Thank you for choosing ${brand}.`
  );
}

/**
 * Builds the official WhatsApp click-to-chat URL with the formatted invoice message.
 * Returns error if customer phone is missing or invalid.
 */
export function buildWhatsAppInvoiceUrl(
  receipt: WhatsAppInvoiceData,
  fallbackPhone?: string
): { success: boolean; url?: string; error?: string; cleanPhone?: string } {
  const targetPhone = receipt.customerPhone || fallbackPhone || '';
  const cleanPhone = extract10DigitPhone(targetPhone);

  if (!cleanPhone || cleanPhone.length !== 10) {
    return {
      success: false,
      error: 'Customer phone number is required to send invoice on WhatsApp.',
    };
  }

  const message = buildWhatsAppInvoiceMessage(receipt);
  const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;

  return {
    success: true,
    url,
    cleanPhone,
  };
}
