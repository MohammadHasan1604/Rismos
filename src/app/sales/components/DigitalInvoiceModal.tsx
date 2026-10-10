'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { InvoicePrintRenderer } from '@/components/invoice/InvoicePrintRenderer';

interface DigitalInvoiceModalProps {
  receiptModal: any | null;
  onClose: () => void;
  branding: any;
  systemSettings: any;
  onSendWhatsApp: (sale: any) => void;
  onViewProof: (proof: any) => void;
}

export const DigitalInvoiceModal: React.FC<DigitalInvoiceModalProps> = ({
  receiptModal,
  onClose,
  branding,
  systemSettings,
  onSendWhatsApp,
  onViewProof,
}) => {
  if (!receiptModal) return null;

  const appName = branding?.appName || 'RISMOS';

  const orderData = {
    id: receiptModal.id || receiptModal.orderNo,
    orderNo: receiptModal.orderNo,
    createdAt: receiptModal.createdAt || new Date().toLocaleDateString(),
    store: receiptModal.store || 'Main Store',
    customerName: receiptModal.customerName || 'Walk-in Customer',
    customerPhone: receiptModal.customerPhone,
    customerAddress: receiptModal.customerBillingAddress || receiptModal.customerAddress,
    customerTaxId: receiptModal.customerGstin || receiptModal.customerTaxId,
    items: receiptModal.items || [],
    subtotal: Number(receiptModal.subtotal) || 0,
    taxTotal: Number(receiptModal.taxTotal) || 0,
    discount: Number(receiptModal.discount) || 0,
    total: Number(receiptModal.total) || 0,
    paymentMethod: receiptModal.paymentMethod || 'Cash',
    referenceNo: receiptModal.referenceNo,
    cashierName: receiptModal.cashierName,
    warrantyExpiryDate: receiptModal.warrantyExpiryDate,
    countryCode: receiptModal.countryCode,
    currencyCode: receiptModal.currencyCode,
    currencySymbol: receiptModal.currencySymbol,
    taxRegime: receiptModal.taxRegime,
    taxRegistrationSnapshot: receiptModal.taxRegistrationSnapshot,
    invoiceTemplateVersion: receiptModal.invoiceTemplateVersion,
    invoiceSnapshotJson: receiptModal.invoiceSnapshotJson,
  };

  return (
    <Modal
      open={!!receiptModal}
      onClose={onClose}
      title={`${appName} Official Tax Invoice`}
      subtitle={`${receiptModal.orderNo} · ${receiptModal.createdAt || 'Today'}`}
      size="lg"
      footer={
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 w-full">
          <div>
            {receiptModal.paymentProofUrl && (
              <button
                type="button"
                onClick={() =>
                  onViewProof({
                    url: receiptModal.paymentProofUrl!,
                    referenceNo: receiptModal.referenceNo || receiptModal.orderNo,
                    amount: receiptModal.total,
                    paymentMethod: receiptModal.paymentMethod,
                    paymentDate: receiptModal.createdAt,
                    payeeOrPayer: receiptModal.customerName,
                    recordedBy: receiptModal.cashierName || 'POS Terminal',
                    timestamp: receiptModal.createdAt,
                    notes: `Digital Invoice Proof for ${receiptModal.orderNo}`,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors shadow-2xs"
              >
                <Icon name="DocumentCheckIcon" size={14} />
                <span>View Payment Proof</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-secondary text-xs flex items-center justify-center gap-1.5 font-bold"
            >
              <Icon name="PrinterIcon" size={14} />
              <span>Print / PDF Invoice</span>
            </button>
            <button
              type="button"
              onClick={() => onSendWhatsApp(receiptModal)}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center justify-center gap-1.5 font-bold"
              title="Send WhatsApp Invoice"
              aria-label="Send WhatsApp Invoice"
            >
              <Icon name="ArrowTopRightOnSquareIcon" size={14} />
              <span>Send WhatsApp</span>
            </button>
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Close
            </button>
          </div>
        </div>
      }
    >
      <div className="max-h-[75vh] overflow-y-auto p-1">
        <InvoicePrintRenderer
          order={orderData}
          branding={branding}
          systemSettings={systemSettings}
        />
      </div>
    </Modal>
  );
};

export default DigitalInvoiceModal;
