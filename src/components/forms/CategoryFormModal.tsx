'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import { useApp, CategoryItem } from '@/context/AppContext';
import CategoryTypeModal from './CategoryTypeModal';
import CategoryTypeManagerModal from './CategoryTypeManagerModal';
import { toast } from 'sonner';

interface CategoryFormModalProps {
  open: boolean;
  onClose: () => void;
  category?: CategoryItem | null;
  onSuccess?: (categoryName: string, category?: CategoryItem) => void;
  initialCategoryType?: string;
  lockCategoryType?: boolean;
  initialName?: string;
  quickMode?: boolean;
  zIndex?: number;
}

export default function CategoryFormModal({
  open,
  onClose,
  category,
  onSuccess,
  initialCategoryType,
  lockCategoryType = false,
  initialName = '',
  quickMode = false,
  zIndex = 110,
}: CategoryFormModalProps) {
  const { categoriesList, categoryTypes, addCategory, updateCategory, currentUser, confirmAction } =
    useApp();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [categoryType, setCategoryType] = useState(initialCategoryType || 'Product');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Child modals for dynamic Category Types
  const [createTypeModalOpen, setCreateTypeModalOpen] = useState(false);
  const [manageTypesModalOpen, setManageTypesModalOpen] = useState(false);

  const isEdit = Boolean(category);

  // Top-level / potential parent categories
  const parentCandidates = useMemo(() => {
    return categoriesList.filter((c) => {
      if (c.status === 'Archived') return false;
      if (category && c.id === category.id) return false; // cannot be parent of itself
      return true;
    });
  }, [categoriesList, category]);

  const parentOptions: SelectOption[] = useMemo(() => {
    return [
      { value: '', label: 'None (Top-Level Category)', sublabel: 'Root Taxonomy' },
      ...parentCandidates.map((c) => ({
        value: c.id,
        label: c.name,
        sublabel: c.categoryType,
        badge: c.status === 'Active' ? undefined : c.status,
      })),
    ];
  }, [parentCandidates]);

  const categoryTypeOptions: SelectOption[] = useMemo(() => {
    return categoryTypes.map((t) => ({
      value: t.name,
      label: t.name,
      sublabel: t.description || undefined,
      badge: t.isSystem ? 'System' : 'Custom',
    }));
  }, [categoryTypes]);

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editCategoryIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetCategoryChanging =
      open && Boolean(category?.id) && category?.id !== editCategoryIdRef.current;

    if (isOpening || isTargetCategoryChanging) {
      prevOpenRef.current = open;
      editCategoryIdRef.current = category?.id || null;

      if (category) {
        setName(category.name || '');
        setSlug(category.slug || '');
        setParentCategoryId(category.parentCategoryId || '');
        setCategoryType(category.categoryType || 'Product');
        setDescription(category.description || '');
        setSortOrder(category.sortOrder || 0);
        setIsActive(category.status === 'Active');
      } else {
        setName(initialName || '');
        if (initialName) {
          const generated = initialName
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
          setSlug(generated);
        } else {
          setSlug('');
        }
        setParentCategoryId('');
        const defaultType = initialCategoryType || categoryTypes[0]?.name || 'Product';
        setCategoryType(defaultType);
        setDescription('');
        setSortOrder(categoriesList.length + 1);
        setIsActive(true);
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editCategoryIdRef.current = null;
    }
  }, [open, category, categoryTypes, categoriesList.length, initialCategoryType, initialName]);

  const isDirty = React.useMemo(() => {
    if (category) {
      return (
        name !== (category.name || '') ||
        slug !== (category.slug || '') ||
        description !== (category.description || '')
      );
    }
    return Boolean(name || description);
  }, [category, name, slug, description]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this category form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  // Handle Name change and auto slug generation
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEdit) {
      const generated = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      setSlug(generated);
    }
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Category Name is required');
      return;
    }

    // Check duplicate name for new categories
    if (!isEdit) {
      const duplicate = categoriesList.find(
        (c) => c.name.toLowerCase() === cleanName.toLowerCase() && c.status !== 'Archived'
      );
      if (duplicate) {
        toast.info(`Category "${cleanName}" already exists. Selecting it.`);
        if (onSuccess) onSuccess(duplicate.name, duplicate);
        onClose();
        return;
      }
    }

    const finalSlug =
      slug.trim() ||
      `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36).slice(0, 4)}`;

    const confirmed = await confirmAction({
      actionType: isEdit ? 'update' : 'create',
      title: isEdit ? `Confirm Category Update: ${cleanName}` : 'Confirm New Category Definition',
      subtitle: 'Please review category details and classification type.',
      confirmLabel: isEdit ? 'Confirm & Update Category' : 'Confirm & Create Category',
      summaryItems: [
        { label: 'Category Name', value: cleanName, highlighted: true },
        { label: 'Category Type', value: categoryType },
        { label: 'Status', value: isActive ? 'Active' : 'Inactive' },
        { label: 'Sort Order', value: String(sortOrder) },
      ],
      warningMessage: isEdit
        ? 'Updating this category will immediately update product groupings and POS filter tabs.'
        : 'Once created, this category will immediately be available for catalog products and expense classification.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (isEdit && category) {
        const res = await updateCategory(category.id, {
          name: cleanName,
          slug: finalSlug,
          parentCategoryId: parentCategoryId || null,
          categoryType,
          description: description.trim() || undefined,
          sortOrder: Number(sortOrder) || 0,
          status: isActive ? 'Active' : 'Inactive',
        });

        if (res?.success) {
          if (onSuccess) onSuccess(cleanName, { ...category, name: cleanName, categoryType });
          onClose();
        }
      } else {
        const res = await addCategory({
          name: cleanName,
          slug: finalSlug,
          parentCategoryId: parentCategoryId || null,
          categoryType,
          description: description.trim() || undefined,
          sortOrder: Number(sortOrder) || 0,
          status: isActive ? 'Active' : 'Inactive',
          createdBy: currentUser.email || currentUser.name,
        });

        if (res?.success) {
          if (onSuccess) onSuccess(cleanName, res.category);
          onClose();
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExpenseMode = initialCategoryType === 'Expense' || categoryType === 'Expense';
  const entityTitle = isExpenseMode ? 'Expense Category' : 'Category';

  return (
    <>
      <Modal
        open={open}
        onClose={handleSafeClose}
        title={
          isEdit
            ? `Edit ${entityTitle}: ${category?.name}`
            : quickMode
              ? `+ Add New ${entityTitle}`
              : `Create ${entityTitle} Record`
        }
        subtitle={
          isEdit
            ? `ID: ${category?.id}`
            : isExpenseMode
              ? 'Unified store operational expenditure classification'
              : 'Unified taxonomy & catalog master categorization'
        }
        size={quickMode ? 'compact' : 'standard'}
        zIndex={zIndex}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={handleSafeClose}
              className="btn-secondary text-xs flex-1 sm:flex-initial"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="category-form"
              className="btn-primary text-xs gap-1.5 flex-1 sm:flex-initial font-bold"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={14} />
                  {isEdit ? 'Update Category' : 'Save & Select Category'}
                </>
              )}
            </button>
          </div>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Category Name */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              {entityTitle} Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder={
                isExpenseMode
                  ? 'e.g. Store Rent, Electricity Bill, Logistics Freight, Packaging'
                  : 'e.g. Mobile Accessories, Display Panels, EV Spare Parts'
              }
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="input-field text-xs"
            />
          </div>

          {/* Slug & Hierarchy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                URL Slug{' '}
                <span className="text-3xs text-muted-foreground font-normal">(Auto-generated)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. mobile-accessories"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="input-field text-xs font-mono"
              />
            </div>

            <div>
              <CustomSelect
                label="Parent Category"
                placeholder="None (Top-Level Category)"
                value={parentCategoryId}
                onChange={setParentCategoryId}
                options={parentOptions}
                searchable={true}
                size="sm"
                allowClear={true}
              />
            </div>
          </div>

          {/* Category Type Selection with + Add New Type Button */}
          <div>
            {lockCategoryType ? (
              <div className="p-2.5 rounded-lg border border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Classification Type
                  </span>
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-danger" />
                    {categoryType}
                  </span>
                </div>
                <span className="text-3xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                  Locked to {categoryType}
                </span>
              </div>
            ) : (
              <>
                <CustomSelect
                  label="Category Type"
                  required
                  placeholder="Select category type..."
                  value={categoryType}
                  onChange={setCategoryType}
                  options={categoryTypeOptions}
                  searchable={true}
                  addNewLabel="+ Add New Type"
                  onAddNew={() => setCreateTypeModalOpen(true)}
                  size="sm"
                />
                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    onClick={() => setManageTypesModalOpen(true)}
                    className="inline-flex items-center gap-1 text-3xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Icon name="Cog6ToothIcon" size={12} />
                    Manage Types
                  </button>
                </div>
                <p className="text-3xs text-muted-foreground mt-0.5">
                  Classifies whether items under this category are hardware devices, spare parts, EV
                  parts, retail products, or expenses.
                </p>
              </>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Description <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Short description of products or services in this category..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field text-xs resize-none"
            />
          </div>

          {/* Status & Sort Order */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
            <div>
              <label className="text-xs font-bold text-foreground block">Active Status</label>
              <p className="text-3xs text-muted-foreground">
                Inactive categories are hidden from POS and inventory selectors.
              </p>
            </div>
            <ToggleSwitch checked={isActive} onChange={setIsActive} size="sm" />
          </div>
        </form>
      </Modal>

      {/* Embedded Dynamic Category Type Creation Modal */}
      <CategoryTypeModal
        open={createTypeModalOpen}
        onClose={() => setCreateTypeModalOpen(false)}
        onSuccess={(newTypeName) => {
          setCategoryType(newTypeName);
          toast.success(`Category Type "${newTypeName}" selected`);
        }}
        zIndex={zIndex + 10}
      />

      {/* Embedded Category Type Manager Modal */}
      <CategoryTypeManagerModal
        open={manageTypesModalOpen}
        onClose={() => setManageTypesModalOpen(false)}
        onOpenCreateNew={() => setCreateTypeModalOpen(true)}
        zIndex={zIndex + 10}
      />
    </>
  );
}
