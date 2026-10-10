'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import ExpenseFormModal from '@/components/forms/ExpenseFormModal';
import { useApp, Expense } from '@/context/AppContext';
import { toast } from 'sonner';
import ProofViewerModal, { PaymentProofData } from '@/components/ui/ProofViewerModal';

export default function ExpensesPage() {
  const { expenses, deleteExpense, selectedStore, formatCurrency, systemSettings } = useApp();
  const currencySymbol = systemSettings?.currencySymbol || '₹';

  // Master modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Proof viewer modal
  const [selectedProof, setSelectedProof] = useState<PaymentProofData | null>(null);

  // Delete state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered expenses based on active store scope
  const filteredExpenses =
    selectedStore === 'All Stores' ? expenses : expenses.filter((e) => e.store === selectedStore);

  const totalExpense = filteredExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
  };

  const handleOpenDelete = (exp: Expense) => {
    setDeletingExpense(exp);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingExpense) return;
    try {
      setIsDeleting(true);
      await deleteExpense(deletingExpense.id);
      setDeleteModalOpen(false);
      setDeletingExpense(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppLayout activeRoute="/expenses">
      <div className="space-y-4 md:space-y-6 fade-in">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Expenses</h1>
            <p className="page-subtitle">Store operating costs & approvals</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="btn-primary gap-1.5 text-xs flex-shrink-0"
          >
            <Icon name="PlusIcon" size={14} />
            <span className="hidden sm:inline">Log Expense</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* Expenses Summary Card */}
        <div className="card p-3 md:p-5 bg-gradient-to-r from-primary/8 via-info/5 to-card flex items-center justify-between border border-border/60">
          <div>
            <p className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Expenses
            </p>
            <h2 className="text-xl md:text-2xl font-extrabold text-foreground font-tabular mt-1">
              {formatCurrency(totalExpense)}
            </h2>
            <p className="text-3xs text-muted-foreground mt-0.5">
              {filteredExpenses.length} transactions · {selectedStore}
            </p>
          </div>
          <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm">
            {currencySymbol}
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="w-full text-left min-w-[750px] text-xs">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    Ref No
                  </th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3 font-tabular text-right">Amount</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3 text-center">Payment Proof</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-12 text-center text-muted-foreground text-xs"
                    >
                      No expense records found for {selectedStore}. Click &quot;Log New
                      Expense&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={`exp-${exp.id}`} className="table-row">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-primary sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        {exp.referenceNo}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{exp.category}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{exp.description}</td>
                      <td className="px-4 py-3">
                        <span className="badge-info text-3xs font-semibold">{exp.store}</span>
                      </td>
                      <td className="px-4 py-3 font-extrabold font-tabular text-foreground text-right">
                        {formatCurrency(exp.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {exp.paymentMethod}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {exp.receiptUrl ? (
                          <button
                            onClick={() =>
                              setSelectedProof({
                                url: exp.receiptUrl!,
                                referenceNo: exp.referenceNoText || exp.referenceNo,
                                amount: exp.amount,
                                paymentMethod: exp.paymentMethod,
                                paymentDate: exp.date,
                                payeeOrPayer: exp.category,
                                recordedBy: exp.recordedBy || 'Finance Dept',
                                timestamp: exp.createdAt || exp.date,
                                notes: exp.description,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-3xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors shadow-2xs"
                            title="View Attached Proof"
                          >
                            <Icon name="DocumentCheckIcon" size={13} />
                            View Proof
                          </button>
                        ) : (
                          <span className="text-3xs text-muted-foreground italic">No Proof</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-success text-3xs font-bold">{exp.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {exp.date}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEdit(exp)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit Expense"
                        >
                          <Icon name="PencilSquareIcon" size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(exp)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Delete Expense"
                        >
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: Card list */}
          <div className="md:hidden divide-y divide-border/60">
            {filteredExpenses.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">No expenses</p>
                <p className="empty-state-text">Tap "Add" to log a new expense</p>
              </div>
            ) : (
              filteredExpenses.map((exp) => (
                <div
                  key={`m-exp-${exp.id}`}
                  className="record-item"
                  onClick={() => handleOpenEdit(exp)}
                >
                  <div className="record-avatar bg-primary/10 text-primary">{currencySymbol}</div>
                  <div className="record-content">
                    <p className="record-title">{exp.category}</p>
                    <p className="record-subtitle">{exp.description}</p>
                    <p className="text-3xs text-muted-foreground mt-0.5">
                      {exp.date} · {exp.store}
                    </p>
                  </div>
                  <div className="record-meta">
                    <p className="record-value">{formatCurrency(exp.amount)}</p>
                    <span className="badge-success text-3xs">{exp.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Master Reusable Expense Form Modal (Record or Edit) */}
      <ExpenseFormModal
        open={modalOpen || !!editingExpense}
        onClose={() => {
          setModalOpen(false);
          setEditingExpense(null);
        }}
        expense={editingExpense}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Expense Record"
        size="sm"
      >
        <div className="py-2 space-y-3 text-sm">
          <p className="text-muted-foreground">
            Are you sure you want to delete expense{' '}
            <span className="font-mono font-bold text-foreground">
              {deletingExpense?.referenceNo}
            </span>{' '}
            ({deletingExpense?.description}) for{' '}
            <span className="font-bold text-foreground">
              {formatCurrency(deletingExpense?.amount)}
            </span>
            ?
          </p>
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-600 dark:text-rose-400">
            This action permanently deletes this expense record from the MySQL database.
          </div>
          <div className="pt-2 border-t border-border flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="btn-ghost text-xs"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="btn-danger text-xs"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Expense'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Full-Screen Payment Proof Viewer */}
      <ProofViewerModal proof={selectedProof} onClose={() => setSelectedProof(null)} />
    </AppLayout>
  );
}
