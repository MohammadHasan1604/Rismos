'use client';

import React, { useState, useEffect } from 'react';
import { useApp, InventoryItem } from '@/context/AppContext';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import CategoryFormModal from './CategoryFormModal';
import StoreFormModal from './StoreFormModal';
import VendorFormModal from './VendorFormModal';
import BrandModal from './BrandModal';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import NumericInput from '@/components/ui/NumericInput';
import { toast } from 'sonner';
import { StorageService } from '@/lib/storageService';
import { getJurisdictionProfile } from '@/lib/localization/jurisdictions';

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  editItem?: InventoryItem | null;
  onSuccess?: (item: InventoryItem) => void;
  zIndex?: number;
}

export default function ProductFormModal({
  open,
  onClose,
  editItem,
  onSuccess,
  zIndex = 100,
}: ProductFormModalProps) {
  const {
    addItem,
    updateItem,
    addAuditLog,
    storesList,
    categoriesList,
    vendors,
    brands,
    confirmAction,
    currentUser,
    systemSettings,
    branding,
    formatCurrency,
  } = useApp();

  const countryCode = systemSettings?.countryCode || branding?.countryCode || 'IN';
  const currencySymbol = systemSettings?.currencySymbol || '₹';
  const jurProfile = getJurisdictionProfile(countryCode);
  const taxLabel = jurProfile?.taxLabel || 'Tax';

  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const isStoreManager = currentUser?.role === 'Store Manager';
  const isSalesManager = currentUser?.role === 'Sales Manager';
  const userStoreCode =
    currentUser?.store && currentUser.store !== 'All Stores' && currentUser.store !== 'ALL'
      ? currentUser.store
      : (storesList[0]?.code || 'CENTRAL');
  const assignedStoreObj = storesList.find(
    (s) => s.code.toUpperCase() === userStoreCode.toUpperCase()
  );
  const assignedStoreLabel = `${userStoreCode} · ${assignedStoreObj?.name || 'Store Hub'}`;

  const [images, setImages] = useState<string[]>([]);
  const [primaryImage, setPrimaryImage] = useState<string>('');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeCategories = categoriesList.filter((c) => c.status === 'Active');

  const categoryOptions: SelectOption[] = React.useMemo(() => {
    return categoriesList
      .filter((c) => c.status !== 'Archived')
      .map((cat) => ({
        value: cat.name,
        label: cat.name,
        sublabel: cat.categoryType,
        badge: cat.status === 'Active' ? undefined : cat.status,
      }));
  }, [categoriesList]);

  const storeOptions: SelectOption[] = React.useMemo(() => {
    if (!isSuperAdmin) {
      return [
        {
          value: userStoreCode,
          label: assignedStoreLabel,
          sublabel: assignedStoreObj?.city || 'Assigned Store',
          badge: 'Assigned Store',
        },
      ];
    }

    return [
      { value: 'CENTRAL', label: 'CENTRAL Warehouse', sublabel: 'Central Distribution Hub' },
      ...storesList
        .filter(
          (s) =>
            s.code !== 'CENTRAL' &&
            s.code !== 'All Stores' &&
            s.code !== 'ALL' &&
            s.status === 'Active'
        )
        .map((s) => ({
          value: s.code,
          label: `${s.code} · ${s.name}`,
          sublabel: s.city,
          badge: s.status,
        })),
    ];
  }, [storesList, isSuperAdmin, userStoreCode, assignedStoreLabel, assignedStoreObj]);

  const vendorOptions: SelectOption[] = React.useMemo(() => {
    return vendors
      .filter((v) => v.status !== 'Archived')
      .map((v) => ({
        value: v.name,
        label: v.name,
        sublabel: `${v.code} · ${v.category || 'General'}`,
        badge: v.gstin ? (taxLabel || 'Tax') : undefined,
      }));
  }, [vendors, taxLabel]);

  const brandOptions: SelectOption[] = React.useMemo(() => {
    return (brands || [])
      .filter((b) => b.status === 'Active')
      .map((b) => ({
        value: b.name,
        label: b.name,
        sublabel: b.code,
      }));
  }, [brands]);

  const [formData, setFormData] = useState({
    sku: '',
    barcode: '',
    name: '',
    brand: '',
    model: '',
    category: '',
    subcategory: '',
    vendor: '',
    description: '',
    store: !isSuperAdmin ? userStoreCode : 'CENTRAL',
    qtyOnHand: '' as unknown as number,
    reorderPt: '' as unknown as number,
    minStock: '' as unknown as number,
    costPrice: '' as unknown as number,
    sellingPrice: '' as unknown as number,
    mrp: '' as unknown as number,
    hsn: '',
    taxRate: '' as unknown as number,
    warrantyMonths: '' as unknown as number,
    status: 'active' as const,
  });

  // 🔒 STABLE FORM INITIALIZATION & DRAFT PROTECTION
  const prevOpenRef = React.useRef(false);
  const editItemIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const isOpening = !prevOpenRef.current && open;
    const isTargetItemChanging =
      open && Boolean(editItem?.id) && editItem?.id !== editItemIdRef.current;

    if (isOpening || isTargetItemChanging) {
      prevOpenRef.current = open;
      editItemIdRef.current = editItem?.id || null;

      if (editItem) {
        setFormData({
          sku: editItem.sku || '',
          barcode: editItem.barcode || '',
          name: editItem.name || '',
          brand: editItem.brand || '',
          model: editItem.model || '',
          category: editItem.category || '',
          subcategory: editItem.subcategory || '',
          vendor: (editItem as any)?.vendor || '',
          description: editItem.description || '',
          store: !isSuperAdmin ? userStoreCode : (editItem.store || 'CENTRAL'),
          qtyOnHand:
            editItem.qtyOnHand !== undefined && editItem.qtyOnHand !== null
              ? editItem.qtyOnHand
              : ('' as unknown as number),
          reorderPt:
            editItem.reorderPt !== undefined && editItem.reorderPt !== null
              ? editItem.reorderPt
              : ('' as unknown as number),
          minStock:
            editItem.minStock !== undefined && editItem.minStock !== null
              ? editItem.minStock
              : ('' as unknown as number),
          costPrice:
            editItem.costPrice !== undefined && editItem.costPrice !== null
              ? editItem.costPrice
              : ('' as unknown as number),
          sellingPrice:
            editItem.sellingPrice !== undefined && editItem.sellingPrice !== null
              ? editItem.sellingPrice
              : ('' as unknown as number),
          mrp:
            editItem.mrp !== undefined && editItem.mrp !== null
              ? editItem.mrp
              : ('' as unknown as number),
          hsn: editItem.hsn || '',
          taxRate:
            editItem.taxRate !== undefined && editItem.taxRate !== null
              ? editItem.taxRate
              : ('' as unknown as number),
          warrantyMonths:
            editItem.warrantyMonths !== undefined && editItem.warrantyMonths !== null
              ? editItem.warrantyMonths
              : ('' as unknown as number),
          status: (editItem.status as any) || 'active',
        });
        const existingImages =
          editItem.images && editItem.images.length > 0
            ? editItem.images
            : editItem.imageUrl
              ? [editItem.imageUrl]
              : [];
        setImages(existingImages);
        setPrimaryImage(editItem.primaryImage || editItem.imageUrl || existingImages[0] || '');
      } else {
        setFormData({
          sku: '',
          barcode: '',
          name: '',
          brand: '',
          model: '',
          category: activeCategories[0]?.name || '',
          subcategory: '',
          vendor: '',
          description: '',
          store: !isSuperAdmin ? userStoreCode : 'CENTRAL',
          qtyOnHand: '' as unknown as number,
          reorderPt: '' as unknown as number,
          minStock: '' as unknown as number,
          costPrice: '' as unknown as number,
          sellingPrice: '' as unknown as number,
          mrp: '' as unknown as number,
          hsn: '',
          taxRate: '' as unknown as number,
          warrantyMonths: '' as unknown as number,
          status: 'active',
        });
        setImages([]);
        setPrimaryImage('');
      }
    }

    if (!open) {
      prevOpenRef.current = false;
      editItemIdRef.current = null;
    }
  }, [open, editItem?.id]);

  const isDirty = React.useMemo(() => {
    if (editItem) {
      return (
        formData.name !== (editItem.name || '') ||
        formData.sku !== (editItem.sku || '') ||
        formData.costPrice !== (editItem.costPrice || '') ||
        formData.sellingPrice !== (editItem.sellingPrice || '')
      );
    }
    return Boolean(
      formData.name ||
      formData.sku ||
      formData.barcode ||
      Boolean(formData.costPrice) ||
      Boolean(formData.sellingPrice)
    );
  }, [editItem, formData]);

  const handleSafeClose = () => {
    if (isDirty && !isSubmitting) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm('You have unsaved changes in this product form. Discard them?')
      ) {
        return;
      }
    }
    onClose();
  };

  if (!open) return null;

  const handleGenerateSku = () => {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const prefix = formData.brand ? formData.brand.slice(0, 3).toUpperCase() : 'CSK';
    const genSku = `${prefix}-${randomCode}`;
    setFormData((prev) => ({ ...prev, sku: genSku }));
    toast.info(`Generated SKU: ${genSku}`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    const maxSize = 5 * 1024 * 1024;

    files.forEach(async (file) => {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`Invalid image format (${file.name})! Upload PNG, JPG, or WebP.`);
        return;
      }
      if (file.size > maxSize) {
        toast.error(`File too large (${file.name})! Max file size is 5MB.`);
        return;
      }

      try {
        const uploadResult = await StorageService.uploadFile('product-images', file, file.name);
        if (uploadResult.url) {
          setImages((prev) => {
            const updated = [...prev, uploadResult.url];
            if (!primaryImage) setPrimaryImage(uploadResult.url);
            return updated;
          });
          toast.success(`Uploaded product image: ${file.name}`);
        }
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.message}`);
      }
    });
  };

  const handleRemoveImage = (imgUrl: string) => {
    setImages((prev) => {
      const updated = prev.filter((img) => img !== imgUrl);
      if (primaryImage === imgUrl) {
        setPrimaryImage(updated[0] || '');
      }
      return updated;
    });
    if (imgUrl.includes('/uploads/product-images/') || imgUrl.startsWith('product-images/')) {
      const key = imgUrl.replace(/^\/uploads\//, '');
      StorageService.deleteFile('product-images', key).catch(console.error);
    }
    toast.info('Product image removed.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Item name is required');
      return;
    }

    if (!formData.sku.trim()) {
      toast.error('SKU Code is required. Type a unique SKU or click "Generate SKU".');
      return;
    }

    if (!formData.category) {
      toast.error('Please select a product Category.');
      return;
    }

    if (!editItem && isSalesManager) {
      toast.error('Product master creation is restricted to Super Admin and Store Manager.');
      return;
    }

    if (!isSalesManager) {
      if (
        formData.costPrice === ('' as unknown as number) ||
        formData.costPrice === undefined ||
        formData.costPrice === null ||
        isNaN(Number(formData.costPrice))
      ) {
        toast.error('Cost Price is required. Please enter a valid number.');
        return;
      }

      if (
        formData.sellingPrice === ('' as unknown as number) ||
        formData.sellingPrice === undefined ||
        formData.sellingPrice === null ||
        isNaN(Number(formData.sellingPrice))
      ) {
        toast.error('Selling Price is required. Please enter a valid number.');
        return;
      }
    }

    const payload: any = {
      ...formData,
      name: formData.name.trim(),
      sku: formData.sku.trim().toUpperCase(),
      barcode: formData.barcode.trim() || undefined,
      brand: formData.brand.trim() || 'Generic',
      model: formData.model.trim() || undefined,
      category: formData.category.trim(),
      subcategory: formData.subcategory.trim() || 'General',
      description: formData.description.trim() || undefined,
      qtyOnHand:
        formData.qtyOnHand !== ('' as unknown as number) &&
        formData.qtyOnHand !== undefined &&
        formData.qtyOnHand !== null
          ? Number(formData.qtyOnHand)
          : 0,
      reorderPt:
        formData.reorderPt !== ('' as unknown as number) &&
        formData.reorderPt !== undefined &&
        formData.reorderPt !== null
          ? Number(formData.reorderPt)
          : 5,
      minStock:
        formData.minStock !== ('' as unknown as number) &&
        formData.minStock !== undefined &&
        formData.minStock !== null
          ? Number(formData.minStock)
          : 10,
      warrantyMonths:
        formData.warrantyMonths !== ('' as unknown as number) &&
        formData.warrantyMonths !== undefined &&
        formData.warrantyMonths !== null
          ? Number(formData.warrantyMonths)
          : 0,
      fifoLots: 1,
      lastMovement: 'Created',
      images,
      primaryImage: primaryImage || images[0] || '',
      imageUrl: primaryImage || images[0] || undefined,
    };

    if (!isSuperAdmin) {
      payload.store = userStoreCode;
    } else {
      payload.store = formData.store || 'CENTRAL';
    }

    if (isSalesManager) {
      payload.store = userStoreCode;
      delete payload.costPrice;
      delete payload.transferPrice;
      delete payload.sellingPrice;
      delete payload.mrp;
      delete payload.taxRate;
    } else {
      payload.costPrice = Number(formData.costPrice);
      payload.transferPrice = Number(formData.costPrice);
      payload.sellingPrice = Number(formData.sellingPrice);
      payload.mrp =
        formData.mrp !== ('' as unknown as number) &&
        formData.mrp !== undefined &&
        formData.mrp !== null
          ? Number(formData.mrp)
          : undefined;
      payload.taxRate =
        formData.taxRate !== ('' as unknown as number) &&
        formData.taxRate !== undefined &&
        formData.taxRate !== null
          ? Number(formData.taxRate)
          : 0;
    }

    const summaryItems = [
      { label: 'Product Name', value: payload.name, highlighted: true },
      { label: 'SKU Code', value: payload.sku },
      { label: 'Category', value: `${payload.category} / ${payload.subcategory}` },
      { label: 'Assigned Store', value: payload.store },
      ...(isSalesManager
        ? [{ label: 'Operational Scope', value: 'Catalog info & local store stock' }]
        : [
            { label: 'Cost Price', value: formatCurrency(payload.costPrice || 0) },
            {
              label: 'Selling Price',
              value: formatCurrency(payload.sellingPrice || 0),
            },
          ]),
      { label: 'Stock On Hand', value: `${payload.qtyOnHand} units` },
    ];

    const confirmed = await confirmAction({
      actionType: editItem ? 'update' : 'create',
      title: editItem ? `Confirm Product Update: ${payload.name}` : 'Confirm New Product Creation',
      subtitle: 'Please review catalog specifications, pricing, and initial stock.',
      confirmLabel: editItem ? 'Confirm & Update Product' : 'Confirm & Create Product',
      summaryItems,
      warningMessage: editItem
        ? 'Updating this product will modify pricing and catalog attributes across all active POS and inventory views.'
        : 'Once confirmed, this SKU will be permanently added to the central catalog and database ledger.',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      if (editItem) {
        await updateItem(editItem.id, payload);
        addAuditLog(
          'Inventory',
          'Update Product',
          `Updated product: ${payload.name} (${payload.sku})`
        );
        toast.success(`Product "${payload.name}" updated successfully!`);
        if (onSuccess) onSuccess({ ...editItem, ...payload } as InventoryItem);
      } else {
        const created = await addItem({
          ...payload,
          store: payload.store || 'CENTRAL',
        });
        addAuditLog(
          'Inventory',
          'Add Product',
          `Created new catalog SKU: ${payload.name} (${payload.sku})`
        );
        toast.success(`Product "${payload.name}" added to catalog!`);
        if (onSuccess && created) onSuccess(created);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleSafeClose}
        title={editItem ? `Edit Product: ${editItem.name}` : 'Create New Product Record'}
        subtitle={
          editItem
            ? `SKU: ${editItem.sku}`
            : 'Master product catalog and store inventory definition'
        }
        size="large-form"
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
              form="product-form"
              className="btn-primary text-xs gap-1.5 flex-1 sm:flex-initial"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={14} />
                  <span>{editItem ? 'Update Product' : 'Add to Inventory'}</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* General Information */}
          <div className="space-y-3">
            <h4 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
              Basic Product Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Product Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. OLED Display Panel iPhone 14 Pro"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field text-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-foreground block">
                    SKU Code <span className="text-danger">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateSku}
                    className="text-3xs font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Icon name="SparklesIcon" size={11} />
                    Generate SKU
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. DSP-IPH14P-01"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                  className="input-field text-xs font-mono font-semibold uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <CustomSelect
                  label="Brand"
                  placeholder="Select or add brand..."
                  value={formData.brand}
                  onChange={(val) => setFormData((prev) => ({ ...prev, brand: val }))}
                  options={brandOptions}
                  searchable={true}
                  addNewLabel="+ Add New Brand"
                  onAddNew={() => setBrandModalOpen(true)}
                  size="sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Model / Specs
                </label>
                <input
                  type="text"
                  placeholder="e.g. A2890, Super Retina XDR"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="input-field text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Barcode (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 8901234567890"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="input-field text-xs font-mono"
                />
              </div>
            </div>

            {/* Category selection with dynamic CustomSelect */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <CustomSelect
                  label="Category"
                  required
                  placeholder="Select or add category..."
                  value={formData.category}
                  onChange={(val) => setFormData((prev) => ({ ...prev, category: val }))}
                  options={categoryOptions}
                  searchable={true}
                  addNewLabel="+ Add New Category"
                  onAddNew={() => setCategoryModalOpen(true)}
                  size="sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Subcategory</label>
                <input
                  type="text"
                  placeholder="e.g. Front Glass, Battery Assembly"
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                  className="input-field text-xs h-8"
                />
              </div>
            </div>

            {/* Preferred Supplier Vendor */}
            <div>
              <CustomSelect
                label="Preferred Supplier / Vendor"
                placeholder="Select or onboard supplier vendor (optional)..."
                value={formData.vendor}
                onChange={(val) => setFormData((prev) => ({ ...prev, vendor: val }))}
                options={vendorOptions}
                searchable={true}
                addNewLabel="+ Onboard New Vendor"
                onAddNew={() => setVendorModalOpen(true)}
                size="sm"
              />
            </div>
          </div>

          {/* Pricing & Tax Architecture */}
          <div className="space-y-3 pt-2">
            <h4 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
              Pricing & {taxLabel} Architecture
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {isSalesManager ? (
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Cost Price ({currencySymbol}){' '}
                    <span className="text-muted-foreground text-2xs">(Protected)</span>
                  </label>
                  <div className="input-field text-xs bg-muted/30 text-muted-foreground flex items-center justify-between cursor-not-allowed py-2">
                    <span>••••••</span>
                    <span className="text-2xs font-semibold uppercase text-warning">
                      Restricted
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Cost Price ({currencySymbol}) <span className="text-danger">*</span>
                  </label>
                  <NumericInput
                    required
                    min={0}
                    step="0.01"
                    allowDecimals={true}
                    placeholder="e.g. 500.00"
                    value={formData.costPrice}
                    onChange={(val) => setFormData({ ...formData, costPrice: val as any })}
                    className="text-xs font-tabular font-semibold"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Selling Price ({currencySymbol}){' '}
                  {isSalesManager ? (
                    <span className="text-2xs text-muted-foreground">(Locked)</span>
                  ) : (
                    <span className="text-danger">*</span>
                  )}
                </label>
                <NumericInput
                  required={!isSalesManager}
                  disabled={isSalesManager}
                  min={0}
                  step="0.01"
                  allowDecimals={true}
                  placeholder="e.g. 750.00"
                  value={formData.sellingPrice}
                  onChange={(val) => setFormData({ ...formData, sellingPrice: val as any })}
                  className={`text-xs font-tabular font-bold ${isSalesManager ? 'text-muted-foreground bg-muted/30 cursor-not-allowed' : 'text-success'}`}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  MRP ({currencySymbol}){' '}
                  {isSalesManager && (
                    <span className="text-2xs text-muted-foreground">(Locked)</span>
                  )}
                </label>
                <NumericInput
                  disabled={isSalesManager}
                  min={0}
                  step="0.01"
                  allowDecimals={true}
                  placeholder="e.g. 999.00"
                  value={formData.mrp}
                  onChange={(val) => setFormData({ ...formData, mrp: val as any })}
                  className={`text-xs font-tabular ${isSalesManager ? 'text-muted-foreground bg-muted/30 cursor-not-allowed' : 'text-muted-foreground'}`}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  {taxLabel} Tax Rate (%){' '}
                  {isSalesManager && (
                    <span className="text-2xs text-muted-foreground">(Locked)</span>
                  )}
                </label>
                <select
                  disabled={isSalesManager}
                  value={
                    formData.taxRate !== undefined && formData.taxRate !== ('' as unknown as number)
                      ? formData.taxRate
                      : ''
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      taxRate:
                        e.target.value === '' ? ('' as unknown as number) : Number(e.target.value),
                    })
                  }
                  className={`input-field text-xs font-medium ${isSalesManager ? 'bg-muted/30 text-muted-foreground cursor-not-allowed' : ''}`}
                >
                  <option value="">Select {taxLabel} Rate...</option>
                  {(jurProfile?.standardTaxRates || [0, 5, 12, 18, 28]).map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}% {rate === 0 ? '(Exempt / Zero)' : ''}
                    </option>
                  ))}
                  {formData.taxRate !== undefined &&
                    formData.taxRate !== ('' as unknown as number) &&
                    !(jurProfile?.standardTaxRates || [0, 5, 12, 18, 28]).includes(
                      Number(formData.taxRate)
                    ) && (
                      <option value={Number(formData.taxRate)}>
                        {formData.taxRate}% (Custom / Preserved)
                      </option>
                    )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  {jurProfile?.hasHsnSac ? 'HSN / SAC Code' : 'Tax / Commodity Code (Optional)'}
                </label>
                <input
                  type="text"
                  placeholder={jurProfile?.hasHsnSac ? 'e.g. 85177090' : 'e.g. TAX-COMM-01'}
                  value={formData.hsn}
                  onChange={(e) => setFormData({ ...formData, hsn: e.target.value })}
                  className="input-field text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Warranty (Months)
                </label>
                <NumericInput
                  min={0}
                  step="1"
                  allowDecimals={false}
                  placeholder="e.g. 12"
                  value={formData.warrantyMonths}
                  onChange={(val) => setFormData({ ...formData, warrantyMonths: val as any })}
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          {/* Stock & Location */}
          <div className="space-y-3 pt-2">
            <h4 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
              Stock & Inventory Control
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Stock Location <span className="text-danger">*</span>
                </label>
                {!isSuperAdmin ? (
                  <div className="input-field text-xs bg-muted/30 border border-border text-foreground flex items-center justify-between cursor-not-allowed py-2">
                    <span className="font-semibold text-foreground truncate mr-2">
                      {assignedStoreLabel}
                    </span>
                    <span className="text-3xs font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
                      Assigned Store
                    </span>
                  </div>
                ) : (
                  <CustomSelect
                    label=""
                    disabled={!!editItem}
                    placeholder="Select store location..."
                    value={formData.store}
                    onChange={(val) => setFormData((prev) => ({ ...prev, store: val }))}
                    options={storeOptions}
                    searchable={true}
                    size="sm"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Initial Qty</label>
                <NumericInput
                  min={0}
                  step="1"
                  allowDecimals={false}
                  placeholder="e.g. 25"
                  value={formData.qtyOnHand}
                  onChange={(val) => setFormData({ ...formData, qtyOnHand: val as any })}
                  className="text-xs font-tabular"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Reorder Alert Qty
                </label>
                <NumericInput
                  min={0}
                  step="1"
                  allowDecimals={false}
                  placeholder="e.g. 5"
                  value={formData.reorderPt}
                  onChange={(val) => setFormData({ ...formData, reorderPt: val as any })}
                  className="text-xs font-tabular"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  Min Target Stock
                </label>
                <NumericInput
                  min={0}
                  step="1"
                  allowDecimals={false}
                  placeholder="e.g. 10"
                  value={formData.minStock}
                  onChange={(val) => setFormData({ ...formData, minStock: val as any })}
                  className="text-xs font-tabular"
                />
              </div>
            </div>
          </div>

          {/* Images */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground">Product Images</label>
              <label className="text-3xs font-bold text-primary hover:underline cursor-pointer inline-flex items-center gap-1">
                <Icon name="ArrowUpTrayIcon" size={12} />
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            {images.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto p-2 border border-border rounded-xl bg-muted/20">
                {images.map((img, idx) => (
                  <div
                    key={`img-${idx}`}
                    className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border shrink-0"
                  >
                    <img src={img} alt="Product" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(img)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                    >
                      <Icon name="TrashIcon" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-3xs text-muted-foreground italic">No image uploaded. (Optional)</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              Description <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Item specifications, warranty notes, and details..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-field text-xs resize-none"
            />
          </div>

        </form>
      </Modal>

      {/* Dynamic Category Modal */}
      <CategoryFormModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onSuccess={(catName) => {
          setFormData((prev) => ({ ...prev, category: catName }));
          toast.success(`Category "${catName}" selected!`);
        }}
        quickMode={true}
        zIndex={zIndex + 20}
      />

      {/* Dynamic Store Hub Modal */}
      <StoreFormModal
        open={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
        onSuccess={(newStore) => {
          setFormData((prev) => ({ ...prev, store: newStore.code }));
          toast.success(`Store "${newStore.name}" (${newStore.code}) selected!`);
        }}
        zIndex={zIndex + 20}
      />

      {/* Dynamic Vendor Onboarding Modal */}
      <VendorFormModal
        open={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        onSuccess={(newVendor) => {
          setFormData((prev) => ({ ...prev, vendor: newVendor }));
          toast.success(`Vendor "${newVendor}" linked to product!`);
        }}
        quickMode={true}
        zIndex={zIndex + 20}
      />

      {/* Dynamic Brand Modal */}
      <BrandModal
        open={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        onSuccess={(newBrandName) => {
          setFormData((prev) => ({ ...prev, brand: newBrandName }));
          toast.success(`Brand "${newBrandName}" selected!`);
        }}
        zIndex={zIndex + 20}
      />
    </>
  );
}
