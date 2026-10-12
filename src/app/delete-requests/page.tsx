'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { useApp } from '@/context/AppContext';
import SuperAdminGuard from '@/components/SuperAdminGuard';
import { toast } from 'sonner';

interface DeleteRequest {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string;
  reason: string;
  status: string;
  requesterEmail: string;
  requesterRole: string;
  requesterStore: string;
  dependencyAnalysis: string | null;
  beforeStateSnapshot: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
}

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

export default function DeleteRequestsPage() {
  const { currentUser } = useApp();
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedRequest, setSelectedRequest] = useState<DeleteRequest | null>(null);
  const [reviewModal, setReviewModal] = useState<DeleteRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`/api/delete-requests?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests || []);
        setPendingCount(data.pendingCount || 0);
      } else {
        toast.error(data.error || 'Failed to load delete requests');
      }
    } catch (_err) {
      toast.error('Network error loading delete requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleAction = async (requestId: string, action: 'approve' | 'reject') => {
    setActionLoading(requestId);
    try {
      const res = await fetch('/api/delete-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          action === 'approve'
            ? `Delete request approved. ${data.result?.mode === 'archived' ? 'Record archived.' : 'Record deleted.'}`
            : 'Delete request rejected.'
        );
        setReviewModal(null);
        setReviewNotes('');
        fetchRequests();
      } else {
        toast.error(data.error || `Failed to ${action} request`);
      }
    } catch {
      toast.error(`Network error during ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
            ⏳ Pending
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">
            ✓ Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
            ✗ Rejected
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/15 text-gray-400">
            {status}
          </span>
        );
    }
  };

  const getEntityIcon = (type: string) => {
    const icons: Record<string, string> = {
      CUSTOMER: 'UserGroupIcon',
      INVENTORY: 'CubeIcon',
      VENDOR: 'TruckIcon',
      EXPENSE: 'BanknotesIcon',
      CATEGORY: 'TagIcon',
      CATEGORY_TYPE: 'AdjustmentsHorizontalIcon',
      PURCHASE: 'ShoppingCartIcon',
      REPAIR: 'WrenchScrewdriverIcon',
      BRAND: 'SwatchIcon',
      UNIT: 'ScaleIcon',
      PAYMENT_METHOD: 'CreditCardIcon',
    };
    return icons[type] || 'TrashIcon';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const parseDependency = (json: string | null) => {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const filteredRequests = requests;

  return (
    <SuperAdminGuard moduleName="Delete Request Management">
      <AppLayout activeRoute="/delete-requests">
        <div className="space-y-4 md:space-y-6 fade-in">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="page-header">
              <h1 className="page-title flex items-center gap-1.5">
                Delete Requests
                {pendingCount > 0 && <span className="badge-danger text-3xs">{pendingCount}</span>}
              </h1>
              <p className="page-subtitle">Review & approve pending deletions</p>
            </div>
            <button
              onClick={() => fetchRequests()}
              className="btn-secondary btn-sm gap-1 flex-shrink-0"
              disabled={loading}
            >
              <Icon name="ArrowPathIcon" size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === f
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'bg-card text-muted-foreground hover:bg-accent/50'
                }`}
              >
                {f === 'ALL' ? 'All Requests' : f.charAt(0) + f.slice(1).toLowerCase()}
                {f === 'PENDING' && pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500 text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Icon name="ArrowPathIcon" size={32} className="animate-spin text-muted-foreground" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Icon name="InboxIcon" size={48} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                No delete requests {statusFilter !== 'ALL' ? `with status "${statusFilter}"` : ''}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredRequests.map((req) => {
                const deps = parseDependency(req.dependencyAnalysis);
                return (
                  <div
                    key={req.id}
                    className="bg-card rounded-xl border border-border p-4 hover:border-accent/50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="p-2 rounded-lg bg-red-500/10 shrink-0">
                          <Icon
                            name={getEntityIcon(req.entityType)}
                            size={20}
                            className="text-red-400"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground truncate">
                              {req.entityName}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground uppercase tracking-wide">
                              {req.entityType.replace(/_/g, ' ')}
                            </span>
                            {getStatusBadge(req.status)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium">{req.requesterEmail}</span>
                            <span className="mx-1">•</span>
                            <span>{req.requesterRole}</span>
                            <span className="mx-1">•</span>
                            <span>{req.requesterStore}</span>
                            <span className="mx-1">•</span>
                            <span>{formatDate(req.createdAt)}</span>
                          </p>
                          <p className="text-xs text-foreground/80 mt-1.5 italic">
                            &ldquo;{req.reason}&rdquo;
                          </p>

                          {deps && deps.hasFinancialHistory && (
                            <div className="mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                              <p className="text-[11px] text-yellow-400 font-medium">
                                ⚠️ Financial Impact: {deps.description}
                              </p>
                            </div>
                          )}

                          {req.reviewedAt && (
                            <p className="text-[11px] text-muted-foreground mt-2">
                              Reviewed by {req.reviewedBy} on {formatDate(req.reviewedAt)}
                              {req.reviewNotes && <span> — &ldquo;{req.reviewNotes}&rdquo;</span>}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setSelectedRequest(req)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                          title="View Details"
                        >
                          <Icon name="EyeIcon" size={16} className="text-muted-foreground" />
                        </button>
                        {req.status === 'PENDING' && currentUser.role === 'Super Admin' && (
                          <>
                            <button
                              onClick={() => {
                                setReviewModal(req);
                                setReviewNotes('');
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30 transition-all"
                              disabled={actionLoading === req.id}
                            >
                              {actionLoading === req.id ? '...' : '✓ Approve'}
                            </button>
                            <button
                              onClick={() => handleAction(req.id, 'reject')}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition-all"
                              disabled={actionLoading === req.id}
                            >
                              {actionLoading === req.id ? '...' : '✗ Reject'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedRequest && (
          <Modal open onClose={() => setSelectedRequest(null)} title={`Delete Request Details`}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Entity Type</p>
                  <p className="font-medium">{selectedRequest.entityType.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Entity Name</p>
                  <p className="font-medium">{selectedRequest.entityName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Requested</p>
                  <p className="font-medium text-xs">{formatDate(selectedRequest.createdAt)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Requester</p>
                  <p className="font-medium text-xs">
                    {selectedRequest.requesterEmail} ({selectedRequest.requesterRole},{' '}
                    {selectedRequest.requesterStore})
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Reason</p>
                  <p className="italic text-foreground/80">
                    &ldquo;{selectedRequest.reason}&rdquo;
                  </p>
                </div>
              </div>

              {selectedRequest.dependencyAnalysis && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Dependency Analysis</p>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40 whitespace-pre-wrap">
                    {JSON.stringify(parseDependency(selectedRequest.dependencyAnalysis), null, 2)}
                  </pre>
                </div>
              )}

              {selectedRequest.beforeStateSnapshot && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Before-State Snapshot</p>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40 whitespace-pre-wrap">
                    {JSON.stringify(
                      JSON.parse(selectedRequest.beforeStateSnapshot || '{}'),
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={() => setSelectedRequest(null)} className="btn-secondary text-sm">
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Approve Confirmation Modal */}
        {reviewModal && (
          <Modal open onClose={() => setReviewModal(null)} title="Approve Delete Request">
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                You are about to approve the deletion of <strong>{reviewModal.entityName}</strong> (
                {reviewModal.entityType.replace(/_/g, ' ')}).
              </p>
              {(() => {
                const deps = parseDependency(reviewModal.dependencyAnalysis);
                return deps?.hasFinancialHistory ? (
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-xs text-yellow-400 font-medium">
                      ⚠️ This record has financial history. It will be soft-deleted/archived rather
                      than permanently removed.
                    </p>
                  </div>
                ) : null;
              })()}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Review Notes (optional)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add any notes for the audit trail..."
                  className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setReviewModal(null)} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button
                  onClick={() => handleAction(reviewModal.id, 'approve')}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors"
                  disabled={actionLoading === reviewModal.id}
                >
                  {actionLoading === reviewModal.id ? 'Processing...' : 'Confirm Approve'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AppLayout>
    </SuperAdminGuard>
  );
}
