'use client';
import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import CategoryFormModal from '@/components/forms/CategoryFormModal';
import CategoryTypeModal from '@/components/forms/CategoryTypeModal';
import CategoryTypeManagerModal from '@/components/forms/CategoryTypeManagerModal';
import { useApp, CategoryItem } from '@/context/AppContext';

export default function CategoriesPage() {
  const {
    categoriesList,
    categoryTypes,
    toggleCategoryStatus,
    deleteCategory,
    inventory,
    branding,
    currentUser,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  // Category Types child modals
  const [createTypeOpen, setCreateTypeOpen] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);

  // Dynamic category types list from root database
  const dynamicCategoryTypes = useMemo(() => {
    return ['All', ...categoryTypes.map((t) => t.name)];
  }, [categoryTypes]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categoriesList.filter((cat) => {
      if (cat.status === 'Archived') return false;

      const matchesSearch =
        searchQuery === '' ||
        cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cat.description && cat.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesType = selectedType === 'All' || cat.categoryType === selectedType;
      const matchesStatus = selectedStatus === 'All' || cat.status === selectedStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [categoriesList, searchQuery, selectedType, selectedStatus]);

  // Category Metrics
  const metrics = useMemo(() => {
    const activeList = categoriesList.filter((c) => c.status === 'Active');
    const topLevelCount = categoriesList.filter(
      (c) => !c.parentCategoryId && c.status !== 'Archived'
    ).length;
    const subCount = categoriesList.filter(
      (c) => !!c.parentCategoryId && c.status !== 'Archived'
    ).length;

    return {
      total: categoriesList.filter((c) => c.status !== 'Archived').length,
      active: activeList.length,
      topLevel: topLevelCount,
      subcategories: subCount,
    };
  }, [categoriesList]);

  const handleOpenAddModal = () => {
    setEditingCategory(null);
    setAddModalOpen(true);
  };

  const handleOpenEditModal = (cat: CategoryItem) => {
    setEditingCategory(cat);
    setAddModalOpen(true);
  };

  const [confirmDeleteCat, setConfirmDeleteCat] = useState<CategoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async (permanent = false) => {
    if (!confirmDeleteCat) return;
    setIsDeleting(true);
    try {
      await deleteCategory(confirmDeleteCat.id, permanent);
      setConfirmDeleteCat(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppLayout activeRoute="/categories">
      <div className="space-y-4 md:space-y-6 fade-in">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="page-header">
            <h1 className="page-title">Categories</h1>
            <p className="page-subtitle">Product taxonomy & catalog types</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setManageTypesOpen(true)}
              className="btn-secondary btn-sm gap-1 hidden sm:inline-flex"
            >
              <Icon name="Cog6ToothIcon" size={13} />
              Types
            </button>
            <button onClick={handleOpenAddModal} className="btn-primary btn-sm gap-1">
              <Icon name="PlusIcon" size={14} />
              <span className="hidden sm:inline">Add</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Categories
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-foreground font-tabular mt-1">
              {metrics.total}
            </p>
            <p className="text-3xs text-muted-foreground mt-0.5">Authoritative taxonomy items</p>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Active in Catalog
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-success font-tabular mt-1">
              {metrics.active}
            </p>
            <p className="text-3xs text-success mt-0.5">Available for POS & Inventory</p>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Top-Level Groups
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-primary font-tabular mt-1">
              {metrics.topLevel}
            </p>
            <p className="text-3xs text-muted-foreground mt-0.5">Mobile, EV, Appliances, etc.</p>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Subcategories
            </p>
            <p className="text-xl sm:text-2xl font-extrabold text-foreground font-tabular mt-1">
              {metrics.subcategories}
            </p>
            <p className="text-3xs text-muted-foreground mt-0.5">Nested parts & service lines</p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-4 rounded-2xl bg-card border border-border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Icon name="MagnifyingGlassIcon" size={15} />
            </span>
            <input
              type="text"
              placeholder="Search by category name, slug, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9 py-2 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="input-field py-2 text-xs"
            >
              {dynamicCategoryTypes.map((t) => (
                <option key={`type-${t}`} value={t}>
                  {t === 'All' ? 'All Types' : t}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="input-field py-2 text-xs"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Categories Roster: Independent Mobile Cards (<md) & Desktop Table (>=md) */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Mobile Category Cards (<md) */}
          <div className="block md:hidden divide-y divide-border">
            {filteredCategories.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground space-y-2">
                <Icon name="FolderIcon" size={32} className="mx-auto text-muted-foreground/50 mb-1" />
                <p className="font-semibold text-sm">No categories match your search criteria</p>
                <p className="text-3xs">Try adjusting the filter options or click "Add" to create one.</p>
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const productsLinked = inventory.filter(
                  (i) =>
                    i.category === cat.name ||
                    i.category === cat.slug ||
                    i.subcategory === cat.name ||
                    i.subcategory === cat.slug
                ).length;

                return (
                  <div key={`m-cat-${cat.id}`} className="p-4 space-y-3 bg-card hover:bg-muted/10 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cat.status === 'Active' ? 'bg-success' : 'bg-muted-foreground'}`}
                          />
                          <p className="font-bold text-sm text-foreground truncate">{cat.name}</p>
                          <span className="text-3xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                            {cat.slug}
                          </span>
                        </div>
                        {cat.description && (
                          <p className="text-2xs text-muted-foreground mt-1 line-clamp-2">
                            {cat.description}
                          </p>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        <ToggleSwitch
                          checked={cat.status === 'Active'}
                          onChange={() => toggleCategoryStatus(cat.id)}
                          size="sm"
                          onText="ON"
                          offText="OFF"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap text-2xs pt-1 border-t border-border/50">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {cat.parentCategoryName ? (
                          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 text-3xs font-bold inline-flex items-center gap-1">
                            <Icon name="FolderIcon" size={10} />
                            {cat.parentCategoryName}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-3xs font-bold">
                            Root Group
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-md text-3xs font-bold ${
                            cat.categoryType === 'Device'
                              ? 'bg-info/15 text-info'
                              : cat.categoryType === 'Spare Part'
                                ? 'bg-primary/15 text-primary'
                                : cat.categoryType === 'EV'
                                  ? 'bg-success/15 text-success'
                                  : cat.categoryType === 'Home Appliance'
                                    ? 'bg-warning/15 text-warning'
                                    : 'bg-muted text-foreground'
                          }`}
                        >
                          {cat.categoryType}
                        </span>

                        <span
                          className={`font-bold px-2 py-0.5 rounded-full text-3xs ${productsLinked > 0 ? 'bg-primary/10 text-primary font-extrabold' : 'bg-muted/60 text-muted-foreground'}`}
                        >
                          {productsLinked} SKUs
                        </span>
                      </div>

                      {/* Mobile Actions with touch target >= 44px */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(cat)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={`Edit category ${cat.name}`}
                        >
                          <Icon name="PencilSquareIcon" size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCat(cat)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors"
                          aria-label={`Archive or delete category ${cat.name}`}
                        >
                          <Icon name="ArchiveBoxIcon" size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Category Table (>=md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground uppercase text-3xs font-bold tracking-wider">
                  <th className="px-4 py-3 sticky left-0 z-20 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    Category Name
                  </th>
                  <th className="px-4 py-3">Hierarchy / Parent</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-center">Products Linked</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-tabular">
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <Icon
                        name="FolderIcon"
                        size={32}
                        className="mx-auto text-muted-foreground/50 mb-2"
                      />
                      <p className="font-semibold text-sm">
                        No categories match your search criteria
                      </p>
                      <p className="text-3xs mt-1">
                        Try adjusting the filter options or click "Add Category" to create a new
                        one.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((cat) => {
                    const productsLinked = inventory.filter(
                      (i) =>
                        i.category === cat.name ||
                        i.category === cat.slug ||
                        i.subcategory === cat.name ||
                        i.subcategory === cat.slug
                    ).length;

                    return (
                      <tr key={`cat-row-${cat.id}`} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground sticky left-0 z-10 bg-card border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${cat.status === 'Active' ? 'bg-success' : 'bg-muted-foreground'}`}
                            />
                            <div>
                              <p className="font-bold text-foreground">{cat.name}</p>
                              <p className="text-3xs text-muted-foreground font-mono">{cat.slug}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {cat.parentCategoryName ? (
                            <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-3xs font-bold inline-flex items-center gap-1">
                              <Icon name="FolderIcon" size={11} />
                              {cat.parentCategoryName}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground text-3xs font-bold">
                              Root Group
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-3xs font-bold ${
                              cat.categoryType === 'Device'
                                ? 'bg-info/15 text-info'
                                : cat.categoryType === 'Spare Part'
                                  ? 'bg-primary/15 text-primary'
                                  : cat.categoryType === 'EV'
                                    ? 'bg-success/15 text-success'
                                    : cat.categoryType === 'Home Appliance'
                                      ? 'bg-warning/15 text-warning'
                                      : 'bg-muted text-foreground'
                            }`}
                          >
                            {cat.categoryType}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-muted-foreground text-2xs max-w-xs truncate">
                          {cat.description || '—'}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span
                            className={`font-bold px-2 py-0.5 rounded-full text-2xs ${productsLinked > 0 ? 'bg-primary/10 text-primary font-extrabold' : 'bg-muted/60 text-muted-foreground'}`}
                          >
                            {productsLinked} SKUs
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <ToggleSwitch
                            checked={cat.status === 'Active'}
                            onChange={() => toggleCategoryStatus(cat.id)}
                            size="sm"
                            onText="ON"
                            offText="OFF"
                          />
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(cat)}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit Category"
                            >
                              <Icon name="PencilSquareIcon" size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCat(cat)}
                              className="p-1.5 rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors"
                              title="Archive / Delete Category"
                            >
                              <Icon name="ArchiveBoxIcon" size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unified Single-Source-of-Truth Category Modal */}
        <CategoryFormModal
          open={addModalOpen}
          onClose={() => {
            setAddModalOpen(false);
            setEditingCategory(null);
          }}
          category={editingCategory}
        />

        {/* Dynamic Category Type Modals */}
        <CategoryTypeModal open={createTypeOpen} onClose={() => setCreateTypeOpen(false)} />

        <CategoryTypeManagerModal
          open={manageTypesOpen}
          onClose={() => setManageTypesOpen(false)}
          onOpenCreateNew={() => setCreateTypeOpen(true)}
        />

        {/* Safe Delete / Archive Confirmation Dialog */}
        {confirmDeleteCat && (
          <Modal
            open={!!confirmDeleteCat}
            onClose={() => !isDeleting && setConfirmDeleteCat(null)}
            title={`Archive / Delete "${confirmDeleteCat.name}"`}
            subtitle="Database relational verification and safe lifecycle management"
            size="md"
          >
            <div className="space-y-4 py-2 text-xs">
              {(() => {
                const linkedCount = inventory.filter(
                  (i) =>
                    i.category === confirmDeleteCat.name ||
                    i.category === confirmDeleteCat.slug ||
                    i.subcategory === confirmDeleteCat.name ||
                    i.subcategory === confirmDeleteCat.slug
                ).length;

                return (
                  <>
                    <div
                      className={`p-4 rounded-xl border ${linkedCount > 0 ? 'bg-warning/10 border-warning/30 text-foreground' : 'bg-muted/40 border-border text-foreground'}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon
                          name={
                            linkedCount > 0 ? 'ExclamationTriangleIcon' : 'InformationCircleIcon'
                          }
                          size={18}
                          className={
                            linkedCount > 0
                              ? 'text-warning shrink-0 mt-0.5'
                              : 'text-primary shrink-0 mt-0.5'
                          }
                        />
                        <div>
                          <p className="font-bold text-sm">
                            {linkedCount > 0 ? 'Category in Active Use' : 'Unused Category'}
                          </p>
                          <p className="text-muted-foreground mt-1">
                            {linkedCount > 0
                              ? `This category is currently linked to ${linkedCount} inventory product(s). To maintain accounting and sales record integrity, it will be safely Archived (hidden from active selection while preserving historical records).`
                              : `This category has 0 linked products. You may archive it safely, or Super Admins may permanently remove it from the database.`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDeleteCat(null)}
                        className="btn-secondary text-xs"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteConfirm(false)}
                        className="btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4"
                      >
                        {isDeleting ? 'Archiving...' : 'Safe Archive'}
                      </button>

                      {linkedCount === 0 && currentUser.role === 'Super Admin' && (
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDeleteConfirm(true)}
                          className="btn-danger text-xs font-bold px-4"
                        >
                          {isDeleting ? 'Deleting...' : 'Permanent Delete'}
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
}
