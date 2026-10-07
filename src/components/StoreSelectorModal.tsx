'use client';
import React, { useState } from 'react';
import { useApp, StoreHub } from '@/context/AppContext';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import Modal from '@/components/ui/Modal';
import StoreFormModal from '@/components/forms/StoreFormModal';
import { toast } from 'sonner';

export default function StoreSelectorModal() {
  const {
    storeSelectorOpen,
    setStoreSelectorOpen,
    selectedStore,
    setSelectedStore,
    storesList,
    deleteStoreHub,
    currentUser,
    branding,
    addAuditLog,
    inventory,
  } = useApp();

  const [addStoreModal, setAddStoreModal] = useState(false);
  const [editStoreModal, setEditStoreModal] = useState<StoreHub | null>(null);
  const [deleteStoreModal, setDeleteStoreModal] = useState<StoreHub | null>(null);

  if (!storeSelectorOpen) return null;

  const handleSelect = (storeCode: string, storeName: string) => {
    const targetStore = storeCode === 'ALL' ? 'All Stores' : storeCode;

    // Scope Permission Check
    if (currentUser.role !== 'Super Admin') {
      if (targetStore === 'All Stores') {
        toast.error(
          'Store Scope Restricted: Enterprise "All Stores" scope is restricted to Super Admin accounts only.'
        );
        return;
      }
      const allowedStores =
        currentUser.allowedStores && currentUser.allowedStores.length > 0
          ? currentUser.allowedStores
          : currentUser.store && currentUser.store !== 'All Stores'
            ? [currentUser.store]
            : ['BLR'];
      if (!allowedStores.includes(targetStore)) {
        toast.error(
          `Store Scope Restricted: You are only permitted to access assigned store(s): ${allowedStores.join(', ')}`
        );
        return;
      }
    }

    setSelectedStore(targetStore);
    addAuditLog(
      'Organization',
      'Switch Store Scope',
      `Switched active store view context to "${storeName}" (${storeCode})`
    );
    setStoreSelectorOpen(false);
    toast.success(`Active store scope set to: ${storeName}`);
  };

  const openEdit = (e: React.MouseEvent, st: StoreHub) => {
    e.stopPropagation();
    setEditStoreModal(st);
  };

  const openDelete = (e: React.MouseEvent, st: StoreHub) => {
    e.stopPropagation();
    if (st.code === 'CENTRAL') {
      toast.error(
        'The default Central Warehouse & Owner Store (CENTRAL) is permanent and cannot be deleted.'
      );
      return;
    }
    setDeleteStoreModal(st);
  };

  // Sort physical stores so CENTRAL is prominently at top, followed by regional stores
  const sortedPhysicalStores = [...storesList].sort((a, b) => {
    if (a.code === 'CENTRAL') return -1;
    if (b.code === 'CENTRAL') return 1;
    return a.code.localeCompare(b.code);
  });

  return (
    <Modal
      open={storeSelectorOpen}
      onClose={() => setStoreSelectorOpen(false)}
      title="Select Active Store Scope"
      subtitle={`${branding.appName} Location & Hub Selection — Select an active store location scope`}
      size="standard"
    >
      <div className="space-y-4 py-2">
        {/* Business Branding & Add Store Button */}
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AppLogo size={32} showText />
          </div>

          {currentUser.role === 'Super Admin' && (
            <button
              onClick={() => setAddStoreModal(true)}
              className="btn-primary text-2xs py-1.5 px-3 gap-1"
            >
              <Icon name="PlusIcon" size={13} />
              Add Store Hub
            </button>
          )}
        </div>

        {/* SECTION 1: Enterprise Reporting Scope (Consolidated View) - Super Admin Only */}
        {currentUser.role === 'Super Admin' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Icon name="ChartBarSquareIcon" size={13} />
                Enterprise Reporting Scope (Aggregated View)
              </h5>
              <span className="text-3xs text-muted-foreground font-medium">
                Reporting & Filter Only
              </span>
            </div>

            {(() => {
              const isSelected = selectedStore === 'All Stores';
              return (
                <div
                  onClick={() => handleSelect('ALL', 'All Stores (Consolidated View)')}
                  className={`p-3.5 rounded-xl border transition-all duration-150 flex items-center justify-between ${
                    isSelected
                      ? 'bg-primary/10 border-primary shadow-xs cursor-pointer ring-1 ring-primary/30'
                      : 'bg-card border-border hover:border-primary/50 hover:bg-muted/40 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-xs flex-shrink-0 ${isSelected ? 'bg-primary text-white' : 'bg-muted text-foreground'}`}
                    >
                      ALL
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-foreground">
                          All Stores (Consolidated View)
                        </p>
                        <span className="text-3xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-bold">
                          Consolidated Scope
                        </span>
                      </div>
                      <p className="text-2xs text-muted-foreground mt-0.5">
                        Consolidated reporting & cross-store analytics across all{' '}
                        {storesList.length} locations. (Non-physical / Non-inventory scope)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                        <Icon name="CheckIcon" size={14} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* SECTION 2: Physical Store Locations & Warehouses */}
        {(() => {
          const userAllowed =
            currentUser.allowedStores && currentUser.allowedStores.length > 0
              ? currentUser.allowedStores
              : currentUser.store && currentUser.store !== 'All Stores'
                ? [currentUser.store]
                : ['BLR'];

          const displayStores =
            currentUser.role === 'Super Admin'
              ? sortedPhysicalStores
              : sortedPhysicalStores.filter((st) => userAllowed.includes(st.code));

          return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Icon name="BuildingStorefrontIcon" size={13} />
                  {currentUser.role === 'Super Admin'
                    ? `Physical Store Locations & Hubs (${displayStores.length})`
                    : `Your Assigned Stores (${displayStores.length})`}
                </h5>
                <span className="text-3xs text-muted-foreground font-medium">
                  {currentUser.role === 'Super Admin'
                    ? 'Inventory & POS Owning'
                    : 'Permitted Locations'}
                </span>
              </div>

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto scrollbar-thin pr-1">
                {displayStores.map((st) => {
                  const isSelected = selectedStore === st.code;
                  const isCentral = st.code === 'CENTRAL';

                  return (
                    <div
                      key={`scope-${st.id}`}
                      onClick={() => handleSelect(st.code, st.name)}
                      className={`p-3.5 rounded-xl border transition-all duration-150 flex items-center justify-between ${
                        isSelected
                          ? 'bg-primary/10 border-primary shadow-xs cursor-pointer ring-1 ring-primary/30'
                          : 'bg-card border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                            isCentral
                              ? isSelected
                                ? 'bg-primary text-white'
                                : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                              : isSelected
                                ? 'bg-primary text-white'
                                : 'bg-muted text-foreground'
                          }`}
                        >
                          {st.code}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-foreground truncate">{st.name}</p>
                            {isCentral ? (
                              <span className="text-3xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                                Default Permanent Hub
                              </span>
                            ) : (
                              <span className="badge-info text-3xs">{st.status}</span>
                            )}
                          </div>
                          <p className="text-2xs text-muted-foreground mt-0.5 truncate">
                            {st.address}
                          </p>
                          <div className="flex items-center gap-3 text-2xs text-muted-foreground mt-1">
                            <span>{st.city}</span>
                            {isCentral && (
                              <>
                                <span>·</span>
                                <span className="text-primary font-medium">Owner Intake Hub</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Action Buttons for Store Hubs (SUPER ADMIN ONLY) */}
                        {currentUser.role === 'Super Admin' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => openEdit(e, st)}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                              title="Edit Store Hub details"
                            >
                              <Icon name="PencilSquareIcon" size={15} />
                            </button>
                            {isCentral ? (
                              <span
                                className="p-1.5 text-muted-foreground/60 cursor-help"
                                title="The default Central Warehouse & Owner Store is permanent and cannot be deleted."
                              >
                                <Icon name="ShieldCheckIcon" size={16} className="text-primary" />
                              </span>
                            ) : (
                              <button
                                onClick={(e) => openDelete(e, st)}
                                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-danger transition-colors"
                                title="Delete Store Hub"
                              >
                                <Icon name="TrashIcon" size={15} />
                              </button>
                            )}
                          </div>
                        )}

                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                            <Icon name="CheckIcon" size={14} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Master Reusable Store Form Modal (Add Store) */}
      <StoreFormModal open={addStoreModal} onClose={() => setAddStoreModal(false)} zIndex={120} />

      {/* Master Reusable Store Form Modal (Edit Store) */}
      {editStoreModal && (
        <StoreFormModal
          open={!!editStoreModal}
          onClose={() => setEditStoreModal(null)}
          store={editStoreModal}
          zIndex={120}
        />
      )}

      {/* Delete Store Hub Modal */}
      {deleteStoreModal && (
        <Modal
          open={!!deleteStoreModal}
          onClose={() => setDeleteStoreModal(null)}
          title="Delete Store Hub"
          size="compact"
          zIndex={130}
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button onClick={() => setDeleteStoreModal(null)} className="btn-secondary text-xs flex-1 sm:flex-initial">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteStoreModal.code === 'CENTRAL') {
                    toast.error(
                      'The default Central Warehouse & Owner Store (CENTRAL) cannot be deleted.'
                    );
                    setDeleteStoreModal(null);
                    return;
                  }
                  const hasInventory = inventory.some((i) => i.store === deleteStoreModal.code);
                  const permanent = !hasInventory;
                  await deleteStoreHub(deleteStoreModal.id, permanent);
                  if (selectedStore === deleteStoreModal.code) {
                    setSelectedStore('All Stores');
                  }
                  setDeleteStoreModal(null);
                }}
                className="btn-danger text-xs font-bold px-3 py-1.5 flex-1 sm:flex-initial"
              >
                Delete Store Hub
              </button>
            </div>
          }
        >
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Are you sure you want to delete store hub{' '}
              <strong className="text-foreground">
                {deleteStoreModal.name} ({deleteStoreModal.code})
              </strong>
              ?
            </p>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
