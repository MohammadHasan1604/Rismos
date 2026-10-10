import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent, getStoreChannel, persistOutboxEvent } from '@/lib/realtime';
import { executeWithIdempotency } from '@/lib/idempotency';
import {
  authenticateRequest,
  hasPermission,
  createAuditLog,
  requireStoreScope,
  validatePhysicalStore,
} from '@/lib/authPipeline';
import { ensureStoredImage } from '@/lib/objectStorage';

/**
 * GET /api/inventory - Retrieve inventory with store filtering (excludes deleted & archived products by default)
 * Also supports ?id=... or ?sku=... to retrieve a single authoritative product record with all store inventory items.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const sku = searchParams.get('sku');

    // ─── SINGLE PRODUCT FETCH (For Edit Product Form & Details) ─────────────
    if (id || sku) {
      const isSalesManager =
        user.role === 'Sales Manager' ||
        (user.securityLevel !== undefined && user.securityLevel <= 40);
      const isSuperAdmin =
        user.role === 'Super Admin' ||
        (user.securityLevel !== undefined && user.securityLevel >= 100);

      const product = await prisma.product.findFirst({
        where: id ? { OR: [{ id }, { sku: id }] } : { sku: sku! },
        include: {
          inventoryItems: true,
        },
      });

      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }

      // Authoritative Store Isolation: Super Admin gets all active stores; lower roles strictly get own assigned store
      const storesWhere = isSuperAdmin
        ? { status: 'Active' }
        : { status: 'Active', code: user.store };

      const activeStores = await prisma.storeHub.findMany({
        where: storesWhere,
      });
      activeStores.sort((a, b) =>
        a.code === 'CENTRAL' ? -1 : b.code === 'CENTRAL' ? 1 : a.code.localeCompare(b.code)
      );

      const storeStock = activeStores.map((s) => {
        const inv = product.inventoryItems.find(
          (it) => it.storeCode.toUpperCase() === s.code.toUpperCase()
        );
        return {
          storeCode: s.code,
          storeName: s.name,
          city: s.city,
          qtyOnHand: inv ? inv.qtyOnHand : 0,
          qtyReserved: inv ? inv.qtyReserved : 0,
          reorderPt: inv ? inv.reorderPt : 5,
        };
      });

      // 🔒 Single-product information leakage fix (Requirement 3.3 & 13)
      // Non-Super-Admin must NEVER receive inventoryItems of other stores
      const filteredInventoryItems = isSuperAdmin
        ? product.inventoryItems
        : product.inventoryItems.filter(
            (it) => it.storeCode.toUpperCase() === user.store.toUpperCase()
          );

      const sanitizedProduct = {
        ...product,
        baseCostPrice: isSalesManager ? 0 : Number(product.baseCostPrice),
        inventoryItems: filteredInventoryItems,
      };

      return NextResponse.json(
        { success: true, product: sanitizedProduct, storeStock },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
      );
    }

    // ─── LIST QUERY WITH STORE FILTERING ────────────────────────────────────
    const store = searchParams.get('store');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const storeScope = await requireStoreScope(user, store, { allowAllStoresForSuperAdmin: true });
    if (!storeScope.authorized) {
      return NextResponse.json({ error: storeScope.error }, { status: storeScope.status });
    }

    const productWhere: any = {};
    if (!includeArchived) {
      productWhere.status = { notIn: ['deleted', 'archived'] };
    }

    const storeWhereClause: any = {};
    if (storeScope.effectiveStore && storeScope.effectiveStore !== 'All Stores') {
      storeWhereClause.storeCode = storeScope.effectiveStore;
      productWhere.inventoryItems = { some: { storeCode: storeScope.effectiveStore } };
    }

    const products = await prisma.product.findMany({
      where: productWhere,
      include: {
        inventoryItems: {
          where: storeWhereClause,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const isSalesManager =
      user.role === 'Sales Manager' ||
      (user.securityLevel !== undefined && user.securityLevel <= 40);
    const sanitizedProducts = products.map((p) => ({
      ...p,
      baseCostPrice: isSalesManager ? 0 : Number(p.baseCostPrice),
    }));

    return NextResponse.json(
      { success: true, products: sanitizedProducts },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    );
  } catch (error: any) {
    console.error('API /api/inventory GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve inventory' }, { status: 500 });
  }
}

/**
 * POST /api/inventory - Create or update inventory product
 * Full field persistence: sku, name, brand, model, category, subcategory,
 * costPrice, sellingPrice, mrp, taxRate, warrantyMonths, imageUrl, description,
 * status, barcode, store, qtyOnHand, reorderPt.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'inventory.add')) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to modify product inventory' },
        { status: 403 }
      );
    }

    if (user.role === 'Sales Manager') {
      return NextResponse.json(
        { error: 'Forbidden: Sales Manager cannot create enterprise product catalog entries.' },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.name || !body.sku) {
      return NextResponse.json({ error: 'Product name and SKU are required' }, { status: 400 });
    }

    const cleanSku = body.sku.trim().toUpperCase();
    const cleanBarcode = body.barcode?.trim() || null;

    const customKey =
      body.idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `prod_${cleanSku}_${Date.now()}`;

    return await executeWithIdempotency<any>(
      req,
      {
        action: 'CREATE_PRODUCT',
        key: customKey,
        userId: user.id,
        extractEntityId: (d) => d?.product?.id || d?.product?.sku,
      },
      async () => {
        // Check duplicate SKU (POST = CREATE only)
        const existingProduct = await prisma.product.findUnique({
          where: { sku: cleanSku },
        });
        if (existingProduct) {
          return {
            status: 409,
            data: {
              error: `Product with SKU "${cleanSku}" already exists. Use PUT /api/inventory to update.`,
            },
          };
        }

        // Check duplicate barcode if provided
        if (cleanBarcode) {
          const duplicateBarcode = await prisma.product.findFirst({
            where: { barcode: cleanBarcode, sku: { not: cleanSku } },
          });
          if (duplicateBarcode) {
            return {
              status: 409,
              data: { error: `Duplicate barcode: Already assigned to "${duplicateBarcode.name}"` },
            };
          }
        }

        const requestedStore = body.storeCode || body.store;
        if (
          requestedStore === 'All Stores' ||
          requestedStore === 'ALL' ||
          body.store === 'All Stores' ||
          body.store === 'ALL'
        ) {
          return {
            status: 400,
            data: {
              error:
                '"All Stores" is a reporting/aggregation scope only. Physical inventory must be assigned to a specific store location or Central Warehouse (e.g., CENTRAL, BLR, MUM).',
            },
          };
        }

        if (
          user.role !== 'Super Admin' &&
          requestedStore &&
          requestedStore.trim().toUpperCase() !== (user.store || '').trim().toUpperCase()
        ) {
          return {
            status: 403,
            data: {
              error: `Forbidden: As ${user.role}, you are restricted to store "${user.store}". Cannot modify inventory for store "${requestedStore}".`,
            },
          };
        }

        let storeCode: string;
        if (user.role === 'Super Admin') {
          if (requestedStore) {
            const val = await validatePhysicalStore(requestedStore);
            if (!val.valid) {
              return { status: 400, data: { error: val.error } };
            }
            storeCode = val.storeCode!;
          } else {
            storeCode = 'CENTRAL';
          }
        } else {
          storeCode = user.store;
        }

        const qtyOnHand =
          typeof body.qtyOnHand === 'number'
            ? body.qtyOnHand
            : body.qtyOnHand !== undefined && body.qtyOnHand !== null && body.qtyOnHand !== ''
              ? Number(body.qtyOnHand)
              : 0;

        if (qtyOnHand < 0) {
          return {
            status: 400,
            data: { error: 'Quantity on hand cannot be negative.' },
          };
        }

        const reorderPt =
          typeof body.reorderPt === 'number'
            ? body.reorderPt
            : body.reorderPt !== undefined && body.reorderPt !== null && body.reorderPt !== ''
              ? Number(body.reorderPt)
              : 5;

        if (body.costPrice === undefined || body.costPrice === null || body.costPrice === '') {
          return { status: 400, data: { error: 'Cost price is required' } };
        }
        if (
          body.sellingPrice === undefined ||
          body.sellingPrice === null ||
          body.sellingPrice === ''
        ) {
          return { status: 400, data: { error: 'Selling price is required' } };
        }
        const costPrice = Number(body.costPrice);
        const sellingPrice = Number(body.sellingPrice);
        if (isNaN(costPrice) || isNaN(sellingPrice)) {
          return {
            status: 400,
            data: { error: 'Cost price and selling price must be valid numbers' },
          };
        }

        const mrp =
          body.mrp !== undefined && body.mrp !== null && body.mrp !== '' ? Number(body.mrp) : null;
        const taxRate =
          body.taxRate !== undefined && body.taxRate !== null && body.taxRate !== ''
            ? Number(body.taxRate)
            : 0;
        const warrantyMonths =
          body.warrantyMonths !== undefined &&
          body.warrantyMonths !== null &&
          body.warrantyMonths !== ''
            ? Number(body.warrantyMonths)
            : 0;
        const rawImageUrl =
          body.imageUrl ||
          body.primaryImage ||
          (Array.isArray(body.images) && body.images[0]) ||
          null;
        const imageUrl = await ensureStoredImage(rawImageUrl, 'product-images', user.name);
        const description = body.description?.trim() || null;

        const savedProduct = await prisma.$transaction(async (tx: any) => {
          const product = await tx.product.create({
            data: {
              sku: cleanSku,
              barcode: cleanBarcode,
              name: body.name.trim(),
              brand: body.brand?.trim() || null,
              model: body.model?.trim() || null,
              category: body.category || 'General',
              subcategory: body.subcategory?.trim() || null,
              description: description,
              baseCostPrice: costPrice,
              baseSellingPrice: sellingPrice,
              mrp: mrp,
              gstRate: taxRate,
              warrantyMonths: warrantyMonths,
              imageUrl: imageUrl,
              status: body.status || 'active',
            },
          });

          if (storeCode) {
            await tx.inventory.upsert({
              where: {
                productId_storeCode: {
                  productId: product.id,
                  storeCode: storeCode,
                },
              },
              create: {
                productId: product.id,
                storeCode: storeCode,
                qtyOnHand: qtyOnHand,
                reorderPt: reorderPt,
              },
              update: {
                qtyOnHand: qtyOnHand,
                reorderPt: reorderPt,
              },
            });

            if (qtyOnHand > 0) {
              await tx.inventoryLedger.create({
                data: {
                  productId: product.id,
                  storeCode: storeCode,
                  refNo: `INIT-${product.sku}-${Date.now().toString().slice(-6)}`,
                  type: 'PURCHASE',
                  qtyChange: qtyOnHand,
                  costPerUnit: product.baseCostPrice,
                  sellingPricePerUnit: product.baseSellingPrice,
                  balanceAfter: qtyOnHand,
                  notes: `Initial catalog registration for ${product.name} (${product.sku}) at ${storeCode}`,
                  createdBy: user.name || user.email,
                },
              });
            }

            // Atomically persist durable outbox event inside same transaction
            await persistOutboxEvent(
              getStoreChannel(storeCode),
              'STOCK_UPDATED',
              {
                storeCode,
                productId: product.id,
                sku: product.sku,
              },
              tx
            );
          }

          return tx.product.findUnique({
            where: { id: product.id },
            include: {
              inventoryItems: true,
            },
          });
        });

        const stockPayload = {
          storeCode,
          productId: savedProduct?.id,
          sku: savedProduct?.sku,
        };
        await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', stockPayload, {
          skipOutbox: true,
        });
        if (storeCode) {
          await broadcastRealtimeEvent(getStoreChannel(storeCode), 'STOCK_UPDATED', stockPayload, {
            skipOutbox: true,
          });
        }

        let responseProduct: any = savedProduct;
        if (responseProduct && user.securityLevel < 100) {
          responseProduct = {
            ...responseProduct,
            baseCostPrice: user.role === 'Sales Manager' ? 0 : responseProduct.baseCostPrice,
            inventoryItems: (responseProduct.inventoryItems || []).filter(
              (inv: any) => inv.storeCode.toUpperCase() === (user.store || '').toUpperCase()
            ),
          };
        }

        return {
          status: 201,
          data: { success: true, product: responseProduct },
        };
      }
    );
  } catch (error: any) {
    console.error('API /api/inventory POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save product' }, { status: 500 });
  }
}

/**
 * PUT /api/inventory - Update an existing product and its inventory record
 * Resolves product by ID, inventory ID, or SKU.
 * Updates ONLY provided fields without wiping untouched existing data.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'inventory.edit')) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const targetId = body.productId || body.id;

    if (!targetId && !body.sku) {
      return NextResponse.json(
        { error: 'Product ID or SKU is required for update' },
        { status: 400 }
      );
    }

    // Resolve product reliably (whether body.id is product.id or inventory.id or sku)
    let product: any = null;
    let targetInventoryStoreCode: string | null = null;
    if (targetId) {
      product = await prisma.product.findUnique({ where: { id: targetId } }).catch(() => null);
      if (!product) {
        // Check if targetId is an inventory record ID
        const inv = await prisma.inventory
          .findUnique({ where: { id: targetId } })
          .catch(() => null);
        if (inv) {
          targetInventoryStoreCode = inv.storeCode;
          if (
            user.securityLevel < 100 &&
            inv.storeCode.trim().toUpperCase() !== (user.store || '').trim().toUpperCase()
          ) {
            return NextResponse.json(
              {
                error: `Forbidden: As ${user.role}, you cannot modify an inventory record belonging to store "${inv.storeCode}". Your assigned store is "${user.store}".`,
              },
              { status: 403 }
            );
          }
          product = await prisma.product
            .findUnique({ where: { id: inv.productId } })
            .catch(() => null);
        }
      }
    }

    if (!product && body.sku) {
      product = await prisma.product.findUnique({ where: { sku: body.sku } }).catch(() => null);
    }

    if (!product) {
      return NextResponse.json({ error: 'Product record not found in database' }, { status: 404 });
    }

    // Verify inventory ID ownership if body.inventoryId or an inventory ID was supplied
    const possibleInvId =
      body.inventoryId || (body.id && product && body.id !== product.id ? body.id : null);
    if (possibleInvId) {
      const invCheck = await prisma.inventory
        .findUnique({ where: { id: possibleInvId } })
        .catch(() => null);
      if (invCheck) {
        targetInventoryStoreCode = invCheck.storeCode;
        if (
          user.securityLevel < 100 &&
          invCheck.storeCode.trim().toUpperCase() !== (user.store || '').trim().toUpperCase()
        ) {
          return NextResponse.json(
            {
              error: `Forbidden: As ${user.role}, you cannot modify an inventory record belonging to store "${invCheck.storeCode}". Your assigned store is "${user.store}".`,
            },
            { status: 403 }
          );
        }
      }
    }

    // ─── STORE SCOPE ENFORCEMENT ON PUT ─────────────────────────────────────
    const requestedStore = body.storeCode || body.store;
    if (requestedStore === 'All Stores' || requestedStore === 'ALL') {
      return NextResponse.json(
        { error: '"All Stores" is a reporting scope only. Updates must target a specific store.' },
        { status: 400 }
      );
    }

    if (user.securityLevel < 100) {
      if (
        requestedStore &&
        requestedStore.trim().toUpperCase() !== (user.store || '').trim().toUpperCase()
      ) {
        return NextResponse.json(
          {
            error: `Forbidden: As ${user.role}, you are restricted to store "${user.store}". Cannot modify inventory for store "${requestedStore}".`,
          },
          { status: 403 }
        );
      }
    }

    let storeCode: string | null = null;
    if (user.securityLevel >= 100) {
      if (requestedStore) {
        const val = await validatePhysicalStore(requestedStore);
        if (!val.valid) {
          return NextResponse.json({ error: val.error }, { status: 400 });
        }
        storeCode = val.storeCode!;
      } else if (targetInventoryStoreCode) {
        storeCode = targetInventoryStoreCode;
      }
    } else {
      storeCode = user.store;
    }

    // Check duplicate barcode if barcode is being updated
    if (body.barcode !== undefined && body.barcode !== null && body.barcode.trim() !== '') {
      const cleanBarcode = body.barcode.trim();
      const duplicateBarcode = await prisma.product.findFirst({
        where: { barcode: cleanBarcode, id: { not: product.id } },
      });
      if (duplicateBarcode) {
        return NextResponse.json(
          { error: `Duplicate barcode: Already assigned to "${duplicateBarcode.name}"` },
          { status: 409 }
        );
      }
    }

    // 🔒 Product Master Security: Sales Manager cannot modify cost, price, tax, or financial config
    if (user.role === 'Sales Manager') {
      const hasCostEdit =
        (body.costPrice !== undefined && body.costPrice !== null && body.costPrice !== '') ||
        (body.baseCostPrice !== undefined &&
          body.baseCostPrice !== null &&
          body.baseCostPrice !== '');
      const hasTaxEdit =
        (body.taxRate !== undefined && body.taxRate !== null && body.taxRate !== '') ||
        (body.gstRate !== undefined && body.gstRate !== null && body.gstRate !== '');
      const hasPriceEdit =
        (body.sellingPrice !== undefined &&
          body.sellingPrice !== null &&
          body.sellingPrice !== '') ||
        (body.baseSellingPrice !== undefined &&
          body.baseSellingPrice !== null &&
          body.baseSellingPrice !== '') ||
        (body.mrp !== undefined && body.mrp !== null && body.mrp !== '');

      if (hasCostEdit || hasTaxEdit || hasPriceEdit) {
        return NextResponse.json(
          {
            error:
              'Forbidden: As Sales Manager, you are not authorized to modify product cost, price, or financial configuration.',
          },
          { status: 403 }
        );
      }
    }

    // Build update payload dynamically so UNTOUCHED fields are preserved
    const productUpdate: any = {};
    if (body.name !== undefined && body.name.trim() !== '') productUpdate.name = body.name.trim();
    if (body.barcode !== undefined)
      productUpdate.barcode = body.barcode ? body.barcode.trim() : null;
    if (body.brand !== undefined) productUpdate.brand = body.brand ? body.brand.trim() : null;
    if (body.model !== undefined) productUpdate.model = body.model ? body.model.trim() : null;
    if (body.category !== undefined && body.category.trim() !== '')
      productUpdate.category = body.category.trim();
    if (body.subcategory !== undefined)
      productUpdate.subcategory = body.subcategory ? body.subcategory.trim() : null;
    if (body.description !== undefined)
      productUpdate.description = body.description ? body.description.trim() : null;
    if (body.costPrice !== undefined && body.costPrice !== null && body.costPrice !== '')
      productUpdate.baseCostPrice = Number(body.costPrice);
    if (body.sellingPrice !== undefined && body.sellingPrice !== null && body.sellingPrice !== '')
      productUpdate.baseSellingPrice = Number(body.sellingPrice);
    if (body.mrp !== undefined)
      productUpdate.mrp = body.mrp !== null && body.mrp !== '' ? Number(body.mrp) : null;
    if (body.taxRate !== undefined)
      productUpdate.gstRate =
        body.taxRate !== null && body.taxRate !== '' ? Number(body.taxRate) : null;
    if (body.warrantyMonths !== undefined)
      productUpdate.warrantyMonths =
        body.warrantyMonths !== null && body.warrantyMonths !== ''
          ? Number(body.warrantyMonths)
          : null;
    if (
      body.imageUrl !== undefined ||
      body.primaryImage !== undefined ||
      body.images !== undefined
    ) {
      const img =
        body.imageUrl || body.primaryImage || (Array.isArray(body.images) ? body.images[0] : null);
      if (img !== undefined) {
        productUpdate.imageUrl = await ensureStoredImage(img || null, 'product-images', user.name);
      }
    }
    // Prevent negative quantities
    if (body.qtyOnHand !== undefined && body.qtyOnHand !== null && Number(body.qtyOnHand) < 0) {
      return NextResponse.json({ error: 'Quantity on hand cannot be negative.' }, { status: 400 });
    }

    const updatedProduct = await prisma.$transaction(
      async (tx: any) => {
        if (Object.keys(productUpdate).length > 0) {
          await tx.product.update({
            where: { id: product.id },
            data: productUpdate,
          });
        }

        // Update store inventory if store, quantity, or reorder point was provided
        if (storeCode && (body.qtyOnHand !== undefined || body.reorderPt !== undefined)) {
          const invWhere = {
            productId_storeCode: {
              productId: product.id,
              storeCode: storeCode,
            },
          };

          const existingInv = await tx.inventory.findUnique({ where: invWhere }).catch(() => null);
          const invUpdate: any = {};
          if (body.qtyOnHand !== undefined) invUpdate.qtyOnHand = Number(body.qtyOnHand);
          if (body.reorderPt !== undefined) invUpdate.reorderPt = Number(body.reorderPt);

          if (existingInv) {
            if (Object.keys(invUpdate).length > 0) {
              await tx.inventory.update({
                where: invWhere,
                data: invUpdate,
              });

              // If quantity was modified, record an adjustment entry
              if (body.qtyOnHand !== undefined && body.qtyOnHand !== existingInv.qtyOnHand) {
                const diff = Number(body.qtyOnHand) - existingInv.qtyOnHand;
                await tx.inventoryLedger.create({
                  data: {
                    productId: product.id,
                    storeCode: storeCode,
                    refNo: `ADJ-${product.sku}-${Date.now().toString().slice(-6)}`,
                    type: 'ADJUSTMENT',
                    qtyChange: diff,
                    costPerUnit: productUpdate.baseCostPrice || product.baseCostPrice,
                    sellingPricePerUnit: productUpdate.baseSellingPrice || product.baseSellingPrice,
                    balanceAfter: Number(body.qtyOnHand),
                    notes: `Stock quantity edited via Edit Product (${diff > 0 ? `+${diff}` : diff} units)`,
                    createdBy: user.name || user.email,
                  },
                });
              }
            }
          } else if (body.qtyOnHand !== undefined) {
            await tx.inventory.create({
              data: {
                productId: product.id,
                storeCode: storeCode,
                qtyOnHand: Number(body.qtyOnHand) || 0,
                reorderPt: Number(body.reorderPt) || 5,
              },
            });
          }

          // Atomically persist durable outbox event inside same transaction
          await persistOutboxEvent(
            getStoreChannel(storeCode),
            'STOCK_UPDATED',
            {
              storeCode,
              productId: product.id,
              sku: product.sku,
            },
            tx
          );
        }

        return tx.product.findUnique({
          where: { id: product.id },
          include: {
            inventoryItems: true,
          },
        });
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const invStore = storeCode || user.store;
    const stockPayload = {
      productId: product.id,
      sku: product.sku,
      storeCode: invStore,
    };
    await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', stockPayload, { skipOutbox: true });
    if (invStore) {
      await broadcastRealtimeEvent(getStoreChannel(invStore), 'STOCK_UPDATED', stockPayload, {
        skipOutbox: true,
      });
    }

    let responseProduct: any = updatedProduct;
    if (responseProduct && user.securityLevel < 100) {
      responseProduct = {
        ...responseProduct,
        baseCostPrice: user.role === 'Sales Manager' ? 0 : responseProduct.baseCostPrice,
        inventoryItems: (responseProduct.inventoryItems || []).filter(
          (inv: any) => inv.storeCode.toUpperCase() === (user.store || '').toUpperCase()
        ),
      };
    }

    return NextResponse.json({ success: true, product: responseProduct });
  } catch (error: any) {
    console.error('API /api/inventory PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update product' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/inventory - Delete Approval Workflow
 * Super Admin: direct archive/delete. Store Manager: creates pending delete request.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (!hasPermission(user, 'inventory.archive')) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to archive or delete products' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';
    const reason = searchParams.get('reason') || '';

    if (!id) {
      return NextResponse.json({ error: 'Product ID or SKU is required' }, { status: 400 });
    }

    // Try finding by id first, then by sku, then by inventory id
    let target = await prisma.product.findUnique({ where: { id } }).catch(() => null);
    if (!target) {
      target = await prisma.product.findFirst({ where: { sku: id } });
    }
    if (!target) {
      const inv = await prisma.inventory.findUnique({ where: { id } }).catch(() => null);
      if (inv) {
        target = await prisma.product.findUnique({ where: { id: inv.productId } });
      }
    }
    if (!target && id.includes('-')) {
      const parts = id.split('-');
      if (parts.length > 5) {
        const candidateUuid = parts.slice(0, 5).join('-');
        target = await prisma.product
          .findUnique({ where: { id: candidateUuid } })
          .catch(() => null);
      }
      if (!target) {
        target = await prisma.product.findUnique({ where: { id: parts[0] } }).catch(() => null);
      }
    }

    if (!target) {
      return NextResponse.json({
        success: true,
        message: 'Product already deleted or non-existent',
      });
    }

    // ─── NON-SUPER-ADMIN: Route through delete approval workflow ────────────
    if (user.securityLevel < 100) {
      if (!reason || reason.trim().length < 3) {
        return NextResponse.json(
          { error: 'A reason for deletion is required (minimum 3 characters)' },
          { status: 400 }
        );
      }
      const { createDeleteRequest } = await import('@/lib/services/deleteApprovalService');
      const result = await createDeleteRequest(user as any, {
        entityType: 'INVENTORY',
        entityId: target.id,
        reason: reason.trim(),
      });
      if (!result.success) {
        const isForbidden =
          result.error?.toLowerCase().includes('forbidden') ||
          result.error?.toLowerCase().includes('authorized');
        return NextResponse.json({ error: result.error }, { status: isForbidden ? 403 : 409 });
      }
      return NextResponse.json({
        success: true,
        mode: 'pending_approval',
        deleteRequest: result.deleteRequest,
        message: `Delete request for product "${target.name}" submitted for Super Admin approval.`,
      });
    }

    // ─── SUPER ADMIN: Direct delete/archive ─────────────────────────────────
    const [salesCount, poCount, transferCount, ledgerCount] = await Promise.all([
      prisma.salesOrderItem.count({ where: { productId: target.id } }),
      prisma.purchaseOrderItem.count({ where: { productId: target.id } }),
      prisma.stockTransferItem.count({ where: { productId: target.id } }),
      prisma.inventoryLedger.count({ where: { productId: target.id } }),
    ]);

    const hasHistory = salesCount + poCount + transferCount + ledgerCount > 0;

    if (hasHistory || !permanent) {
      const product = await prisma.product.update({
        where: { id: target.id },
        data: { status: 'archived' },
      });

      await (prisma as any).auditLog.create({
        data: {
          module: 'INVENTORY',
          action: `ARCHIVED: Product "${target.name}" (${target.sku})`,
          details: JSON.stringify({
            productId: target.id,
            salesCount,
            poCount,
            transferCount,
            ledgerCount,
          }),
          userEmail: user.email,
          userRole: user.role,
          storeCode: user.store || 'CENTRAL',
        },
      });

      const archiveStockPayload = {
        productId: target.id,
        sku: target.sku,
        action: 'archived',
        storeCode: user.store || 'CENTRAL',
      };
      await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', archiveStockPayload);
      if (user.store && user.store !== 'All Stores') {
        await broadcastRealtimeEvent(
          getStoreChannel(user.store),
          'STOCK_UPDATED',
          archiveStockPayload
        );
      }

      return NextResponse.json({
        success: true,
        mode: 'archived',
        product,
        hasHistory,
        message: hasHistory
          ? `Product "${target.name}" has transaction history (${salesCount} sales, ${poCount} purchases, ${transferCount} transfers, ${ledgerCount} ledger movements) and was archived safely.`
          : `Product "${target.name}" archived successfully.`,
      });
    }

    // Hard-delete for unused products by Super Admin
    await prisma.$transaction(
      async (tx: any) => {
        await tx.inventory.deleteMany({ where: { productId: target.id } });
        await tx.product.delete({ where: { id: target.id } });
        await tx.auditLog.create({
          data: {
            module: 'INVENTORY',
            action: `HARD_DELETED: Product "${target.name}" (${target.sku})`,
            details: JSON.stringify({ productId: target.id, beforeState: target }),
            userEmail: user.email,
            userRole: user.role,
            storeCode: user.store || 'CENTRAL',
          },
        });
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const deleteStockPayload = {
      productId: target.id,
      sku: target.sku,
      action: 'deleted',
      storeCode: user.store || 'CENTRAL',
    };
    await broadcastRealtimeEvent('inventory', 'STOCK_UPDATED', deleteStockPayload);
    if (user.store && user.store !== 'All Stores') {
      await broadcastRealtimeEvent(
        getStoreChannel(user.store),
        'STOCK_UPDATED',
        deleteStockPayload
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'deleted',
      message: `Product "${target.name}" (${target.sku}) permanently deleted from database.`,
    });
  } catch (error: any) {
    console.error('API /api/inventory DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive/delete product' },
      { status: 500 }
    );
  }
}
