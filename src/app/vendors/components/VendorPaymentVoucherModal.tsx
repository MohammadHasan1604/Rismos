'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';

interface VendorPaymentVoucherModalProps {
  voucher: any | null;
  onClose: () => void;
  onPrint?: () => void;
  currentUser?: any;
  setProofViewerData?: (data: any) => void;
}

export const VendorPaymentVoucherModal: React.FC<VendorPaymentVoucherModalProps> = ({
  voucher,
  onClose,
  onPrint = () => window.print(),
  currentUser,
  setProofViewerData,
}) => {
  const { branding, formatCurrency, dateLocale } = useApp();
  if (!voucher) return null;

  return (
    <Modal
      open={!!voucher}
      onClose={onClose}
      title="Official Payment Receipt Voucher"
      subtitle={`Voucher #${voucher.voucherNo} · Status: Verified`}
      size="md"
    >
      <div className="space-y-4 py-2 text-xs">
        {/* Printable Voucher Card */}
        <div
          id="payment-voucher-print-area"
          className="p-5 border border-border rounded-xl bg-card space-y-4"
        >
          <div className="flex items-start justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-base font-extrabold text-foreground tracking-tight">
                {branding?.businessName || branding?.appName || 'RISMOS ENTERPRISE RETAIL'}
              </h2>
              <p className="text-3xs text-muted-foreground">
                Procurement & Accounts Payable Department
              </p>
              <p className="text-3xs text-muted-foreground font-mono mt-0.5">
                Voucher: {voucher.voucherNo}
              </p>
            </div>
            <div className="text-right">
              <span className="badge-positive text-2xs font-bold px-2 py-0.5">PAID / SETTLED</span>
              <p className="text-3xs text-muted-foreground mt-1">
                {new Date(voucher.paymentDate).toLocaleDateString(dateLocale || 'en-IN')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-2xs">
            <div>
              <span className="text-muted-foreground uppercase text-3xs font-bold block">
                Vendor Beneficiary:
              </span>
              <strong className="text-foreground text-xs block">{voucher.vendorName}</strong>
              {voucher.vendorGstin && (
                <span className="text-muted-foreground font-mono block">
                  GSTIN: {voucher.vendorGstin}
                </span>
              )}
              {voucher.vendorPhone && (
                <span className="text-muted-foreground block">Phone: {voucher.vendorPhone}</span>
              )}
            </div>
            <div className="text-right">
              <span className="text-muted-foreground uppercase text-3xs font-bold block">
                Bill Details:
              </span>
              <strong className="text-primary font-mono text-xs block">
                Invoice #{voucher.billNo}
              </strong>
              <span className="text-muted-foreground font-mono text-3xs block">
                PO Ref: {voucher.poNo}
              </span>
            </div>
          </div>

          <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1.5 font-tabular text-2xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Bill Value:</span>
              <span className="font-bold text-foreground">
                {formatCurrency(Number(voucher.totalCost))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Method:</span>
              <span className="font-bold text-foreground">{voucher.paymentMethod}</span>
            </div>
            {voucher.referenceNo && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction Reference (UTR):</span>
                <span className="font-mono font-bold text-foreground">{voucher.referenceNo}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-border font-extrabold text-sm text-emerald-600">
              <span>Disbursed Amount:</span>
              <span>{formatCurrency(Number(voucher.amount))}</span>
            </div>
            <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/60">
              <span>Remaining Balance on Bill:</span>
              <span className="font-bold text-foreground">
                {formatCurrency(Number(voucher.remainingBalance))}
              </span>
            </div>
          </div>

          {voucher.receiptUrl && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <Icon name="DocumentCheckIcon" size={16} className="text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-2xs block">Payment Proof Attached</span>
                  <span className="text-4xs text-muted-foreground font-mono">
                    Permanently stored in database ledger
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setProofViewerData?.({
                    proofUrl: voucher.receiptUrl,
                    title: `Payment Proof — Voucher #${voucher.voucherNo}`,
                    amount: Number(voucher.amount),
                    paymentMethod: voucher.paymentMethod,
                    referenceNo: voucher.referenceNo,
                    paymentDate: voucher.paymentDate,
                    recordedBy: voucher.recordedBy,
                    entityName: voucher.vendorName,
                    billNo: voucher.billNo,
                  })
                }
                className="btn-secondary text-2xs py-1 px-2.5 gap-1 font-bold shadow-2xs cursor-pointer"
              >
                <Icon name="EyeIcon" size={12} />
                View Proof
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-3xs text-muted-foreground pt-2 border-t border-border">
            <span>
              Authorized by: <strong>{voucher.recordedBy || currentUser?.name}</strong>
            </span>
            <span>Digitally Recorded via {branding?.appName || 'RISMOS'} StoreCommand</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-3xs text-muted-foreground">
            Print or export copy for vendor file.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrint}
              className="btn-secondary text-xs gap-1.5 font-bold cursor-pointer"
            >
              <Icon name="PrinterIcon" size={14} />
              Print Receipt Voucher
            </button>
            <button onClick={onClose} className="btn-primary text-xs font-bold cursor-pointer">
              Done
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
