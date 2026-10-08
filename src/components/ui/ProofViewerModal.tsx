'use client';

import React from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { useApp } from '@/context/AppContext';

export interface ProofViewerData {
  proofUrl?: string;
  url?: string;
  title?: string;
  amount?: number;
  paymentMethod?: string;
  referenceNo?: string;
  paymentDate?: string | Date;
  recordedBy?: string;
  entityName?: string;
  payeeOrPayer?: string;
  billNo?: string;
  notes?: string;
  timestamp?: string | Date;
}

export type PaymentProofData = ProofViewerData;

interface ProofViewerModalProps {
  open?: boolean;
  onClose: () => void;
  data?: ProofViewerData | null;
  proof?: ProofViewerData | null;
}

export function normalizeProofUrl(inputUrl?: string): string {
  if (!inputUrl) return '';
  // If it's already an app file URL with %2F or mixed slashes, decode and re-encode safely
  if (inputUrl.startsWith('/api/files/')) {
    const rest = inputUrl.slice('/api/files/'.length);
    const segments = decodeURIComponent(rest)
      .split(/[/\\]+/)
      .filter(Boolean);
    return `/api/files/${segments.map(encodeURIComponent).join('/')}`;
  }
  // If it's a raw R2/S3/external URL pointing to payment-proofs or expense-receipts
  const proofIndex = inputUrl.indexOf('payment-proofs/');
  if (proofIndex !== -1) {
    const key = inputUrl.slice(proofIndex).split('?')[0];
    const segments = key.split(/[/\\]+/).filter(Boolean);
    return `/api/files/${segments.map(encodeURIComponent).join('/')}`;
  }
  const receiptIndex = inputUrl.indexOf('expense-receipts/');
  if (receiptIndex !== -1) {
    const key = inputUrl.slice(receiptIndex).split('?')[0];
    const segments = key.split(/[/\\]+/).filter(Boolean);
    return `/api/files/${segments.map(encodeURIComponent).join('/')}`;
  }
  return inputUrl;
}

export default function ProofViewerModal({ open, onClose, data, proof }: ProofViewerModalProps) {
  const { formatCurrency, dateLocale } = useApp();
  const activeData = proof || data;
  const isModalOpen = open !== undefined ? open : Boolean(activeData);
  const rawUrl = activeData?.proofUrl || activeData?.url;

  const [hasError, setHasError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setHasError(false);
    setLoading(true);
  }, [rawUrl]);

  if (!isModalOpen || !activeData || !rawUrl) return null;

  const url = normalizeProofUrl(rawUrl);
  const isPdf = url.toLowerCase().endsWith('.pdf') || url.includes('application/pdf');
  const filename = url.split('/').pop() || 'payment-proof';

  const formattedDate = activeData.paymentDate
    ? new Date(activeData.paymentDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : undefined;

  const formattedTimestamp = activeData.timestamp
    ? new Date(activeData.timestamp).toLocaleString('en-IN')
    : undefined;

  const displayName = activeData.entityName || activeData.payeeOrPayer;

  return (
    <Modal
      open={isModalOpen}
      onClose={onClose}
      title={activeData.title || 'Authoritative Payment Proof & Voucher'}
      subtitle={
        activeData.billNo
          ? `Transaction Ref: ${activeData.billNo}`
          : 'Verified Financial Transaction'
      }
      size="standard"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <span className="text-3xs text-muted-foreground font-mono truncate max-w-[200px] hidden sm:inline">
            File: {filename}
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!hasError && (
              <a
                href={url}
                download={filename}
                target="_blank"
                rel="noreferrer"
                className="btn-primary text-xs py-1.5 px-3 gap-1.5 font-bold flex-1 sm:flex-initial text-center justify-center inline-flex items-center"
              >
                <Icon name="ArrowDownTrayIcon" size={14} />
                Download Proof
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-1.5 px-3 flex-1 sm:flex-initial"
            >
              Close
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1 text-xs">
        {/* Metadata summary header card */}
        <div className="p-3.5 bg-muted/40 border border-border rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3">
          {activeData.amount !== undefined && (
            <div>
              <span className="text-3xs uppercase tracking-wider text-muted-foreground font-bold block">
                Amount Paid
              </span>
              <span className="text-base font-black text-emerald-600 font-tabular">
                {formatCurrency(Number(activeData.amount))}
              </span>
            </div>
          )}

          {activeData.paymentMethod && (
            <div>
              <span className="text-3xs uppercase tracking-wider text-muted-foreground font-bold block">
                Payment Method
              </span>
              <span className="text-xs font-bold text-foreground block truncate">
                {activeData.paymentMethod}
              </span>
            </div>
          )}

          {activeData.referenceNo && (
            <div>
              <span className="text-3xs uppercase tracking-wider text-muted-foreground font-bold block">
                Reference / Txn ID
              </span>
              <span
                className="text-xs font-mono font-bold text-primary block truncate"
                title={activeData.referenceNo}
              >
                {activeData.referenceNo}
              </span>
            </div>
          )}

          {formattedDate && (
            <div>
              <span className="text-3xs uppercase tracking-wider text-muted-foreground font-bold block">
                Payment Date
              </span>
              <span className="text-xs font-semibold text-foreground block">{formattedDate}</span>
            </div>
          )}

          {displayName && (
            <div className="col-span-2 sm:col-span-2">
              <span className="text-3xs uppercase tracking-wider text-muted-foreground font-bold block">
                Payee / Customer
              </span>
              <span className="text-xs font-bold text-foreground block truncate">
                {displayName}
              </span>
            </div>
          )}

          {activeData.recordedBy && (
            <div className="col-span-2 sm:col-span-2">
              <span className="text-3xs uppercase tracking-wider text-muted-foreground font-bold block">
                Recorded By / Uploader
              </span>
              <span className="text-xs font-medium text-muted-foreground block truncate">
                {activeData.recordedBy} {formattedTimestamp ? `(${formattedTimestamp})` : ''}
              </span>
            </div>
          )}
        </div>

        {activeData.notes && (
          <div className="p-2.5 bg-muted/20 border border-border/60 rounded-lg text-3xs text-muted-foreground">
            <strong className="text-foreground">Remarks:</strong> {activeData.notes}
          </div>
        )}

        {/* Proof Document Viewer */}
        <div className="border border-border rounded-xl overflow-hidden bg-muted/20 flex flex-col items-center justify-center min-h-[260px] max-h-[460px] relative">
          {hasError ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto">
                <Icon name="ExclamationTriangleIcon" size={24} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  Payment proof file is missing from object storage
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  The transaction voucher metadata exists in database, but the physical file could not be retrieved from object storage.
                </p>
              </div>
            </div>
          ) : isPdf ? (
            <div className="w-full h-[400px] flex flex-col items-center justify-center p-4 bg-muted/10 relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <iframe
                src={`${url}#toolbar=1`}
                className="w-full h-full rounded-lg border border-border"
                title="PDF Payment Proof"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setHasError(true);
                  setLoading(false);
                }}
              />
            </div>
          ) : (
            <div className="p-3 w-full h-full flex items-center justify-center overflow-auto max-h-[420px] relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Payment Proof Document"
                className="max-w-full max-h-[400px] object-contain rounded-lg shadow-xs"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setHasError(true);
                  setLoading(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
