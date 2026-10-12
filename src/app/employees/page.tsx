'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { useApp, UserAccount } from '@/context/AppContext';
import UserFormModal from '@/components/forms/UserFormModal';

export default function EmployeesPage() {
  const { currentUser, selectedStore, usersList, deleteUserAccount } = useApp();

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<UserAccount | null>(null);
  const [deleteEmpModal, setDeleteEmpModal] = useState<UserAccount | null>(null);

  const filteredEmployees = usersList.filter((e) => {
    // Hide Super Admin employee records from lower-level roles
    if (e.role === 'Super Admin' && currentUser.role !== 'Super Admin') return false;
    // Filter by store location for Store Managers & staff
    if (currentUser.role !== 'Super Admin') {
      const allowed = e.allowedStores || [e.store];
      return allowed.includes(currentUser.store) || e.store === currentUser.store;
    }
    return selectedStore === 'All Stores'
      ? true
      : e.store === selectedStore || (e.allowedStores && e.allowedStores.includes(selectedStore));
  });

  const openEdit = (emp: UserAccount) => {
    setEditModal(emp);
  };

  return (
    <AppLayout activeRoute="/employees">
      <div className="space-y-4 md:space-y-6 fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Employees</h1>
            <p className="page-subtitle">Staff roster, shifts & assignments</p>
          </div>
          <button
            onClick={() => setAddModal(true)}
            className="btn-primary gap-1.5 text-xs flex-shrink-0"
          >
            <Icon name="UserPlusIcon" size={14} />
            <span className="hidden sm:inline">Add Member</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* Employee Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredEmployees.map((emp) => (
            <div key={`emp-card-${emp.id}`} className="card p-4 space-y-3 relative">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-foreground text-sm">{emp.name}</h3>
                  <span className="badge-warning text-3xs font-semibold mt-1 inline-block">
                    {emp.role}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(emp)}
                    className="p-1 text-muted-foreground hover:text-primary"
                    title="Edit employee"
                  >
                    <Icon name="PencilSquareIcon" size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteEmpModal(emp)}
                    className="p-1 text-muted-foreground hover:text-danger"
                    title="Remove employee"
                  >
                    <Icon name="TrashIcon" size={15} />
                  </button>
                </div>
              </div>

              <div className="text-xs space-y-1.5 text-muted-foreground border-y border-border py-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <strong className="text-foreground">Assigned Store(s):</strong>
                  {(emp.allowedStores && emp.allowedStores.length > 0
                    ? emp.allowedStores
                    : [emp.store]
                  ).map((st) => (
                    <span
                      key={`emp-st-${st}`}
                      className="badge-secondary text-3xs font-mono font-bold"
                    >
                      {st}
                    </span>
                  ))}
                </div>
                <p>
                  <strong className="text-foreground">Email:</strong> {emp.email}
                </p>
                <p>
                  <strong className="text-foreground">Phone:</strong> {emp.phone || 'N/A'}
                </p>
                <p>
                  <strong className="text-foreground">Status:</strong>{' '}
                  <span
                    className={
                      emp.status === 'Active'
                        ? 'text-emerald-500 font-semibold'
                        : 'text-rose-500 font-semibold'
                    }
                  >
                    {emp.status}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reusable Single-Source-of-Truth User/Staff Form Modal */}
      <UserFormModal
        open={addModal || !!editModal}
        onClose={() => {
          setAddModal(false);
          setEditModal(null);
        }}
        user={editModal}
      />

      {/* Delete / Deactivate Employee Modal */}
      {deleteEmpModal && (
        <Modal
          open={!!deleteEmpModal}
          onClose={() => setDeleteEmpModal(null)}
          title={`Deactivate / Remove Employee "${deleteEmpModal.name}"`}
          subtitle={`Role: ${deleteEmpModal.role} · Store: ${deleteEmpModal.store} · Email: ${deleteEmpModal.email}`}
          size="md"
        >
          <div className="space-y-4 py-2 text-xs">
            {(() => {
              const isSelf =
                currentUser.email &&
                currentUser.email.toLowerCase() === deleteEmpModal.email.toLowerCase();

              return (
                <>
                  <div
                    className={`p-4 rounded-xl border ${isSelf ? 'bg-danger/10 border-danger/30 text-foreground' : 'bg-muted/40 border-border text-foreground'}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon
                        name={isSelf ? 'ExclamationCircleIcon' : 'InformationCircleIcon'}
                        size={18}
                        className={
                          isSelf ? 'text-danger shrink-0 mt-0.5' : 'text-primary shrink-0 mt-0.5'
                        }
                      />
                      <div>
                        <p className="font-bold text-sm">
                          {isSelf
                            ? 'Cannot Remove Active Logged-In Account'
                            : 'Team Member Lifecycle Management'}
                        </p>
                        <p className="text-muted-foreground mt-1">
                          {isSelf
                            ? 'You are currently logged into this account. System security rules prohibit deleting your own session.'
                            : `Removing ${deleteEmpModal.name} will synchronize with user permissions and authentication records.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-border">
                    <button
                      onClick={() => setDeleteEmpModal(null)}
                      className="btn-secondary text-xs"
                    >
                      Cancel
                    </button>
                    {!isSelf && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteUserAccount(deleteEmpModal.id, false);
                            setDeleteEmpModal(null);
                          }}
                          className="btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4"
                        >
                          Deactivate Account
                        </button>
                        {currentUser.role === 'Super Admin' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteUserAccount(deleteEmpModal.id, true);
                              setDeleteEmpModal(null);
                            }}
                            className="btn-danger text-xs font-bold px-4"
                          >
                            Permanent Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </Modal>
      )}
    </AppLayout>
  );
}
