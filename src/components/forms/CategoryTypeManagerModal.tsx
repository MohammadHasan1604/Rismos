'use client';
import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useApp, CategoryTypeItem } from '@/context/AppContext';
import { toast } from 'sonner';

interface CategoryTypeManagerModalProps {
  open: boolean;
  onClose: () => void;
  onOpenCreateNew: () => void;
  zIndex?: number;
}

export default function CategoryTypeManagerModal({
  open,
  onClose,
  onOpenCreateNew,
  zIndex = 120,
}: CategoryTypeManagerModalProps) {
  const { categoryTypes, updateCategoryType, deleteCategoryType } = useApp();
  const [editingType, setEditingType] = useState<CategoryTypeItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('primary');
  const [isUpdating, setIsUpdating] = useState(false);

  const [deleteCandidate, setDeleteCandidate] = useState<CategoryTypeItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!open) return null;

  const handleStartEdit = (t: CategoryTypeItem) => {
    setEditingType(t);
    setEditName(t.name);
    setEditDescription(t.description || '');
    setEditColor(t.color || 'primary');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingType || !editName.trim()) return;

    setIsUpdating(true);
    try {
      const res = await updateCategoryType({
        id: editingType.id,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        color: editColor,
      });

      if (res?.success) {
        setEditingType(null);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      const res = await deleteCategoryType(deleteCandidate.id);
      if (res?.success) {
        setDeleteCandidate(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Manage Category Types & Taxonomy"
        subtitle="View, edit, and safely manage root category classifications"
        size="standard"
        zIndex={zIndex}
        footer={
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs flex-1 sm:flex-initial"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <p className="text-xs text-muted-foreground">
              Total {categoryTypes.length} dynamic classification types registered.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCreateNew();
              }}
              className="btn-primary text-xs gap-1.5 py-1.5"
            >
              <Icon name="PlusIcon" size={13} />+ Add New Type
            </button>
          </div>

          {/* Edit Inline Box if editing */}
          {editingType && (
            <form
              onSubmit={handleSaveEdit}
              className="p-3.5 rounded-xl border border-primary/40 bg-primary/5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  Editing Type: <span className="text-primary">{editingType.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditingType(null)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs font-semibold text-foreground block mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input-field text-xs"
                  />
                </div>
                <div>
                  <label className="text-2xs font-semibold text-foreground block mb-1">
                    Color Style
                  </label>
                  <select
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="input-field text-xs font-medium"
                  >
                    <option value="primary">Primary (Indigo)</option>
                    <option value="info">Info (Sky)</option>
                    <option value="success">Success (Emerald)</option>
                    <option value="warning">Warning (Amber)</option>
                    <option value="purple">Purple / Violet</option>
                    <option value="rose">Rose / Coral</option>
                    <option value="secondary">Neutral / Gray</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-2xs font-semibold text-foreground block mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="input-field text-xs"
                  placeholder="Classification description..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingType(null)}
                  className="btn-secondary text-2xs py-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isUpdating} className="btn-primary text-2xs py-1">
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* List of types */}
          <div className="space-y-2 pr-1">
            {categoryTypes.map((t) => {
              const hasCategories = (t.categoryCount || 0) > 0;
              return (
                <div
                  key={t.id}
                  className="p-3 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-foreground">{t.name}</span>
                      <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {t.code}
                      </span>
                      {hasCategories ? (
                        <span className="text-3xs px-2 py-0.5 rounded-full font-semibold bg-primary/10 text-primary border border-primary/20">
                          {t.categoryCount} categor{t.categoryCount === 1 ? 'y' : 'ies'} assigned
                        </span>
                      ) : (
                        <span className="text-3xs px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground">
                          0 assigned
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-2xs text-muted-foreground mt-0.5 truncate">
                        {t.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(t)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Edit Category Type"
                    >
                      <Icon name="PencilSquareIcon" size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (hasCategories) {
                          toast.error(
                            `Cannot delete "${t.name}" because ${t.categoryCount} active categories are assigned to it. Reassign those categories first.`
                          );
                        } else {
                          setDeleteCandidate(t);
                        }
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        hasCategories
                          ? 'text-muted-foreground/40 cursor-not-allowed'
                          : 'text-danger hover:bg-danger/10'
                      }`}
                      title={
                        hasCategories
                          ? 'Protected: Categories depend on this type'
                          : 'Delete Category Type'
                      }
                    >
                      <Icon name="TrashIcon" size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Dependency Confirmation Modal */}
      {deleteCandidate && (
        <ConfirmModal
          open={!!deleteCandidate}
          onClose={() => setDeleteCandidate(null)}
          onConfirm={handleConfirmDelete}
          title={`Delete Category Type "${deleteCandidate.name}"?`}
          message={`Are you sure you want to permanently remove this Category Type from the root database? It currently has 0 dependent categories.`}
          confirmLabel={isDeleting ? 'Deleting...' : 'Delete Type'}
          loading={isDeleting}
          variant="danger"
        />
      )}
    </>
  );
}
