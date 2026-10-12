'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { useApp, StoreHub } from '@/context/AppContext';
import StoreFormModal from '@/components/forms/StoreFormModal';
import StockTransferModal from '@/components/forms/StockTransferModal';
import { toast } from 'sonner';
import SuperAdminGuard from '@/components/SuperAdminGuard';

export default function StoresPage() {
  const { storesList, deleteStoreHub, setSelectedStore, inventory, currentUser } = useApp();

  const [addStoreModal, setAddStoreModal] = useState(false);
  const [editStoreModal, setEditStoreModal] = useState<StoreHub | null>(null);
  const [deleteStoreModal, setDeleteStoreModal] = useState<StoreHub | null>(null);
  const [transferModal, setTransferModal] = useState(false);

  const openEdit = (s: StoreHub) => {
    setEditStoreModal(s);
  };

  return (
    <SuperAdminGuard moduleName="Store Management">
      <AppLayout activeRoute="/stores">
        <div className="space-y-4 md:space-y-6 fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="page-header">
              <h1 className="page-title">Stores</h1>
              <p className="page-subtitle">Multi-location hubs & transfers</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setTransferModal(true)} className="btn-secondary btn-sm gap-1">
                <Icon name="ArrowsRightLeftIcon" size={14} />
                <span className="hidden sm:inline">Transfer</span>
              </button>
              {currentUser.role === 'Super Admin' && (
                <button onClick={() => setAddStoreModal(true)} className="btn-primary btn-sm gap-1">
                  <Icon name="PlusIcon" size={14} />
                  <span className="hidden sm:inline">Add Store</span>
                  <span className="sm:hidden">Add</span>
                </button>
              )}
            </div>
          </div>

          {/* Store Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
            {storesList.map((s) => {
              const isCentral = s.code === 'CENTRAL';
              return (
                <div
                  key={`store-card-${s.id}`}
                  className="card p-5 space-y-4 hover:shadow-card-hover transition-all duration-200 relative group border border-border/80"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-3xs font-mono font-bold px-2 py-0.5 rounded-full ${
                            isCentral
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                              : 'badge-info'
                          }`}
                        >
                          {s.code}
                        </span>
                        {isCentral && (
                          <span className="text-3xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                            Default Permanent Hub
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-foreground mt-1.5">{s.name}</h3>
                      <p className="text-2xs text-muted-foreground">{s.city}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {currentUser.role === 'Super Admin' && (
                        <button
                          onClick={() => {
                            setSelectedStore(s.code);
                            toast.success(`Switched active store scope to ${s.name}`);
                          }}
                          className="btn-ghost text-3xs text-primary font-bold px-2 py-1 hover:bg-primary/10 rounded-lg transition-colors"
                        >
                          Select Scope
                        </button>
                      )}

                      {/* Edit & Delete Controls (SUPER ADMIN ONLY) */}
                      {currentUser.role === 'Super Admin' && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => openEdit(s)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Edit store hub"
                          >
                            <Icon name="PencilSquareIcon" size={14} />
                          </button>
                          {isCentral ? (
                            <span
                              className="p-1.5 text-muted-foreground/60 cursor-help"
                              title="The default Central Warehouse & Owner Store is permanent and cannot be deleted"
                            >
                              <Icon name="ShieldCheckIcon" size={16} className="text-primary" />
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteStoreModal(s)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Delete store hub"
                            >
                              <Icon name="TrashIcon" size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs space-y-1 text-muted-foreground border-y border-border/60 py-2.5">
                    <p>
                      <strong className="text-foreground font-semibold">Address:</strong>{' '}
                      {s.address}
                    </p>
                    <p>
                      <strong className="text-foreground font-semibold">Store Owner:</strong>{' '}
                      {s.owner || s.manager || 'Unassigned'}
                    </p>
                    <p>
                      <strong className="text-foreground font-semibold">Phone:</strong> {s.phone}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-3xs text-muted-foreground uppercase font-bold tracking-wider">
                      Operational City
                    </span>
                    <span className="text-2xs font-semibold text-foreground">{s.city}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reusable Single-Source-of-Truth Store Form Modal */}
        <StoreFormModal
          open={addStoreModal || !!editStoreModal}
          onClose={() => {
            setAddStoreModal(false);
            setEditStoreModal(null);
          }}
          store={editStoreModal}
          zIndex={transferModal ? 110 : 100}
          onSuccess={() => {
            setAddStoreModal(false);
            setEditStoreModal(null);
          }}
        />

        {/* Delete / Deactivate Store Modal */}
        {deleteStoreModal && (
          <Modal
            open={!!deleteStoreModal}
            onClose={() => setDeleteStoreModal(null)}
            title={`Deactivate / Delete Store "${deleteStoreModal.name}"`}
            subtitle={`Code: ${deleteStoreModal.code} · Location: ${deleteStoreModal.city}`}
            size="md"
          >
            <div className="space-y-4 py-2 text-xs">
              {(() => {
                const storeInventoryCount = inventory.filter(
                  (i) => i.store === deleteStoreModal.code
                ).length;
                const hasHistory = storeInventoryCount > 0;

                return (
                  <>
                    <div
                      className={`p-4 rounded-xl border ${hasHistory ? 'bg-warning/10 border-warning/30 text-foreground' : 'bg-muted/40 border-border text-foreground'}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon
                          name={hasHistory ? 'ExclamationTriangleIcon' : 'InformationCircleIcon'}
                          size={18}
                          className={
                            hasHistory
                              ? 'text-warning shrink-0 mt-0.5'
                              : 'text-primary shrink-0 mt-0.5'
                          }
                        />
                        <div>
                          <p className="font-bold text-sm">
                            {hasHistory
                              ? 'Store Hub Has Active Inventory / Sales'
                              : 'Unused Store Location'}
                          </p>
                          <p className="text-muted-foreground mt-1">
                            {hasHistory
                              ? `This store currently manages ${storeInventoryCount} product SKUs and historical sales records. To prevent data corruption, it will be safely Deactivated / Archived.`
                              : `This store has no linked inventory or sales records. You can safely remove it.`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-border">
                      <button
                        onClick={() => setDeleteStoreModal(null)}
                        className="btn-secondary text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteStoreHub(deleteStoreModal.id, false);
                          setDeleteStoreModal(null);
                        }}
                        className="btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4"
                      >
                        Safe Deactivate
                      </button>
                      {!hasHistory && (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteStoreHub(deleteStoreModal.id, true);
                            setDeleteStoreModal(null);
                          }}
                          className="btn-danger text-xs font-bold px-4"
                        >
                          Permanent Delete
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </Modal>
        )}

        {/* Master Single Source of Truth Stock Transfer Modal */}
        <StockTransferModal
          open={transferModal}
          onClose={() => setTransferModal(false)}
          initialSourceStore="BLR"
          initialDestStore="HYD"
          onSuccess={() => setTransferModal(false)}
        />
      </AppLayout>
    </SuperAdminGuard>
  );
}
