import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuditLog, validatePhysicalStore } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent } from '@/lib/realtime';
import { validateTaxRegistrationId } from '@/lib/taxValidation';
import { executeWithIdempotency } from '@/lib/idempotency';

/**
 * GET /api/vendors - Retrieve vendors with authoritative store scoping & reconciled financial payables
 * Super Admin: all or filtered by store
 * Store Manager: strictly own-store vendors
 * Sales Manager: 403 Forbidden (no vendor administration)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC: Sales Manager has no vendor administration access
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Sales Managers do not have vendor administration access.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const vendorId = searchParams.get('id');
    const storeParam = searchParams.get('store') || searchParams.get('storeCode');

    const whereClause: any = {};
    if (vendorId) {
      whereClause.id = vendorId;
    } else if (!includeArchived) {
      whereClause.status = { not: 'Archived' };
    }

    // Authoritative Store Isolation
    if (user.role !== 'Super Admin') {
      if (storeParam && storeParam !== 'All Stores' && storeParam !== user.store) {
        return NextResponse.json(
          { error: 'Forbidden: Cross-store vendor access is denied.' },
          { status: 403 }
        );
      }
      whereClause.storeCode = user.store;
    } else {
      if (storeParam && storeParam !== 'All Stores') {
        whereClause.storeCode = storeParam;
      }
    }

    const vendors = await (prisma as any).vendor.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        purchases: {
          where: {
            status: { notIn: ['Cancelled', 'Archived'] },
            ...(user.role !== 'Super Admin' ? { storeCode: user.store } : {}),
          },
          select: {
            id: true,
            storeCode: true,
            totalCost: true,
            paidAmount: true,
            creditAmount: true,
            dueDate: true,
            expectedDate: true,
            payments: {
              select: {
                amount: true,
              },
            },
          },
        },
      },
    });

    // If searching by ID, verify Store Manager owns this vendor
    if (vendorId && user.role !== 'Super Admin') {
      if (vendors.length === 0 || vendors[0].storeCode !== user.store) {
        return NextResponse.json(
          { error: 'Forbidden: You do not have permission to access this vendor.' },
          { status: 403 }
        );
      }
    }

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Reconcile financial figures scoped to vendor's store
    const vendorsWithPayable = vendors.map((v: any) => {
      let totalBilledAmount = 0;
      let totalPaidAmount = 0;
      let totalCreditsAmount = 0;
      let outstandingPayable = 0;
      let unpaidBillsCount = 0;
      let overdueBillsCount = 0;

      v.purchases?.forEach((po: any) => {
        const cost = Number(po.totalCost) || 0;
        const paid =
          po.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) ??
          (Number(po.paidAmount) || 0);
        const credit = Number(po.creditAmount) || 0;
        const remaining = Math.max(0, Math.round((cost - paid - credit) * 100) / 100);

        totalBilledAmount += cost;
        totalPaidAmount += paid;
        totalCreditsAmount += credit;
        outstandingPayable += remaining;

        if (remaining > 0.005) {
          unpaidBillsCount++;
          const effDue = po.dueDate || po.expectedDate;
          if (effDue) {
            const dueD = new Date(effDue);
            const dueMidnight = new Date(
              dueD.getFullYear(),
              dueD.getMonth(),
              dueD.getDate()
            ).getTime();
            if (todayMidnight > dueMidnight) {
              overdueBillsCount++;
            }
          }
        }
      });

      const { purchases: _, ...vendorData } = v;
      return {
        ...vendorData,
        totalBilledAmount: Math.round(totalBilledAmount * 100) / 100,
        totalPaidAmount: Math.round(totalPaidAmount * 100) / 100,
        totalCreditsAmount: Math.round(totalCreditsAmount * 100) / 100,
        outstandingPayable: Math.round(outstandingPayable * 100) / 100,
        totalBillsCount: v.purchases?.length || 0,
        unpaidBillsCount,
        overdueBillsCount,
      };
    });

    return NextResponse.json(
      { success: true, vendors: vendorsWithPayable },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/vendors GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve vendors' }, { status: 500 });
  }
}

/**
 * POST /api/vendors - Create a new vendor (CREATE-only, no upsert)
 * Super Admin: can explicitly select authorized store (validated against StoreHub)
 * Store Manager: server FORCE own store
 * Sales Manager: 403 Forbidden
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC check
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Sales Managers cannot create vendors.' },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 });
    }

    // Authoritative store assignment
    let targetStoreCode: string;
    if (user.role === 'Super Admin' || user.securityLevel >= 100) {
      const reqStore = body.storeCode?.trim() || body.store?.trim() || 'CENTRAL';
      const validated = await validatePhysicalStore(reqStore);
      if (!validated.valid) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      targetStoreCode = validated.storeCode!;
    } else {
      // Store Manager: server FORCE own store. Client cannot override.
      targetStoreCode = user.store;
    }

    const effectiveCountry = (body.countryCode || 'IN').toUpperCase().trim();
    const gstinValidation = validateTaxRegistrationId(body.gstin, effectiveCountry);
    if (!gstinValidation.valid) {
      return NextResponse.json(
        {
          error: gstinValidation.error || 'Invalid Tax Registration format.',
        },
        { status: 400 }
      );
    }
    const cleanGstin = gstinValidation.normalized;

    const customKey =
      body.idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `vnd_${body.name.trim()}_${targetStoreCode}_${cleanGstin || 'nogst'}_${Date.now()}`;

    let code = body.code?.trim();
    if (code) {
      const existingCode = await (prisma as any).vendor.findUnique({ where: { code } });
      if (existingCode) {
        return NextResponse.json(
          {
            error: `Conflict: Vendor with code "${code}" already exists. Updates must use PUT /api/vendors.`,
          },
          { status: 409 }
        );
      }
    }

    return await executeWithIdempotency(
      req,
      {
        action: 'CREATE_VENDOR',
        key: customKey,
        userId: user.id,
        extractEntityId: (d) => d?.vendor?.id || d?.vendor?.code,
      },
      async () => {
        if (!code) {
          const allVendors = await (prisma as any).vendor.findMany({ select: { code: true } });
          let maxNum = 0;
          for (const v of allVendors) {
            const match = v.code.match(/^VND-(\d+)$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
          code = `VND-${String(maxNum + 1).padStart(4, '0')}`;
        }

        // 🔒 Strict CREATE-only semantics (Requirement 5.1): NEVER upsert across stores
        const vendor = await (prisma as any).vendor.create({
          data: {
            code,
            name: body.name.trim(),
            contactPerson: body.contactPerson?.trim() || 'Account Manager',
            email: body.email?.trim() || '',
            phone: body.phone?.trim() || '',
            city: body.city?.trim() || targetStoreCode,
            address: body.address?.trim() || null,
            categories: body.categories?.trim() || body.category?.trim() || 'General',
            gstin: cleanGstin,
            leadTimeDays:
              body.leadTimeDays !== undefined &&
              body.leadTimeDays !== null &&
              body.leadTimeDays !== ''
                ? Number(body.leadTimeDays)
                : null,
            rating: body.rating ? Number(body.rating) : 5.0,
            paymentTerms: body.paymentTerms?.trim() || 'Net 30',
            storeCode: targetStoreCode,
            status: body.status || 'Active',
          },
        });

        // Write audit log with REAL affected storeCode
        await (prisma as any).auditLog.create({
          data: {
            module: 'Vendors',
            action: 'Onboard Vendor',
            details: `Onboarded vendor "${vendor.name}" (${vendor.code}) for store ${targetStoreCode}. GSTIN: ${cleanGstin || 'None'}, Terms: ${vendor.paymentTerms}`,
            userId: user.id,
            userEmail: user.email || user.name,
            userRole: user.role,
            storeCode: targetStoreCode,
          },
        });

        await broadcastRealtimeEvent('vendors', 'VENDOR_UPDATED', {
          id: vendor.id,
          code: vendor.code,
          name: vendor.name,
          action: 'saved',
        });

        return { status: 201, data: { success: true, vendor } };
      }
    );
  } catch (error: any) {
    console.error('API /api/vendors POST error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save vendor' }, { status: 500 });
  }
}

/**
 * PUT /api/vendors - Update existing vendor
 * First loads from DB and verifies store ownership.
 * Store Manager cannot modify another store's vendor.
 * Sales Manager: 403 Forbidden.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC check
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient security level to update vendor' },
        { status: 403 }
      );
    }

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 });
    }

    // Authoritative check: First load vendor from DB
    const existing = await (prisma as any).vendor.findUnique({
      where: { id: body.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    // Verify caller store ownership
    if (user.role !== 'Super Admin' && existing.storeCode !== user.store) {
      return NextResponse.json(
        {
          error:
            'Forbidden: You do not have permission to modify a vendor belonging to another store.',
        },
        { status: 403 }
      );
    }

    if (body.gstin !== undefined && body.gstin !== null) {
      const effectiveCountry = (body.countryCode || 'IN').toUpperCase().trim();
      const gstinValidation = validateTaxRegistrationId(body.gstin, effectiveCountry);
      if (!gstinValidation.valid) {
        return NextResponse.json(
          {
            error: gstinValidation.error || 'Invalid Tax Registration format.',
          },
          { status: 400 }
        );
      }
      body.gstin = gstinValidation.normalized;
    }

    const updateData: any = {
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.contactPerson ? { contactPerson: body.contactPerson.trim() } : {}),
      ...(body.email ? { email: body.email.trim() } : {}),
      ...(body.phone ? { phone: body.phone.trim() } : {}),
      ...(body.city ? { city: body.city.trim() } : {}),
      ...(body.address !== undefined ? { address: body.address?.trim() || null } : {}),
      ...(body.categories || body.category
        ? { categories: (body.categories || body.category).trim() }
        : {}),
      ...(body.gstin !== undefined ? { gstin: body.gstin } : {}),
      ...(body.leadTimeDays !== undefined ? { leadTimeDays: Number(body.leadTimeDays) } : {}),
      ...(body.rating !== undefined ? { rating: Number(body.rating) } : {}),
      ...(body.paymentTerms ? { paymentTerms: body.paymentTerms.trim() } : {}),
      ...(body.status ? { status: body.status } : {}),
    };

    // Only Super Admin can transfer vendor to another store
    if ((user.role === 'Super Admin' || user.securityLevel >= 100) && body.storeCode) {
      const validated = await validatePhysicalStore(body.storeCode.trim());
      if (!validated.valid) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      updateData.storeCode = validated.storeCode!;
    }

    const vendor = await (prisma as any).vendor.update({
      where: { id: body.id },
      data: updateData,
    });

    // Write audit log with REAL affected storeCode
    await (prisma as any).auditLog.create({
      data: {
        module: 'Vendors',
        action: 'Update Vendor',
        details: `Updated vendor details for "${vendor.name}" (${vendor.code}). Store: ${vendor.storeCode}`,
        userId: user.id,
        userEmail: user.email || user.name,
        userRole: user.role,
        storeCode: vendor.storeCode,
      },
    });

    await broadcastRealtimeEvent('vendors', 'VENDOR_UPDATED', {
      id: vendor.id,
      code: vendor.code,
      name: vendor.name,
      action: 'updated',
    });

    return NextResponse.json({ success: true, vendor });
  } catch (error: any) {
    console.error('API /api/vendors PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update vendor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/vendors - Delete Approval Workflow / Deletion
 * First loads from DB and verifies store ownership.
 * Store Manager cannot delete another store's vendor.
 * Sales Manager: 403 Forbidden.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC check
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient security level to archive/delete vendor' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';
    const reason = searchParams.get('reason') || '';

    if (!id) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 });
    }

    let target = await (prisma as any).vendor.findUnique({ where: { id } }).catch(() => null);
    if (!target) {
      target = await (prisma as any).vendor.findFirst({ where: { code: id } });
    }

    if (!target) {
      return NextResponse.json({
        success: true,
        message: 'Vendor already deleted or non-existent',
      });
    }

    // Verify store ownership: Store Manager cannot delete another store's vendor
    if (user.role !== 'Super Admin' && target.storeCode !== user.store) {
      return NextResponse.json(
        {
          error:
            'Forbidden: You do not have permission to delete a vendor belonging to another store.',
        },
        { status: 403 }
      );
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
        entityType: 'VENDOR',
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
        message: `Delete request for vendor "${target.name}" submitted for Super Admin approval.`,
      });
    }

    // ─── SUPER ADMIN: Direct delete/archive ─────────────────────────────────
    const poCount = await (prisma as any).purchaseOrder.count({ where: { vendorId: target.id } });

    if (poCount > 0 || !permanent) {
      const vendor = await (prisma as any).vendor.update({
        where: { id: target.id },
        data: { status: 'Archived' },
      });

      await (prisma as any).auditLog.create({
        data: {
          module: 'Vendors',
          action: `ARCHIVED: Vendor "${target.name}" (${target.code})`,
          details: JSON.stringify({ vendorId: target.id, poCount, storeCode: target.storeCode }),
          userId: user.id,
          userEmail: user.email || user.name,
          userRole: user.role,
          storeCode: target.storeCode,
        },
      });

      await broadcastRealtimeEvent('vendors', 'VENDOR_UPDATED', {
        id: target.id,
        code: target.code,
        name: target.name,
        action: 'archived',
      });

      return NextResponse.json({
        success: true,
        mode: 'archived',
        vendor,
        hasHistory: poCount > 0,
        message:
          poCount > 0
            ? `Vendor "${target.name}" has ${poCount} linked purchase orders and was safely Archived.`
            : `Vendor "${target.name}" archived successfully.`,
      });
    }

    // Hard delete unused vendor (Super Admin only, zero POs)
    await prisma.$transaction(async (tx: any) => {
      await tx.vendor.delete({ where: { id: target.id } });
      await tx.auditLog.create({
        data: {
          module: 'Vendors',
          action: `HARD_DELETED: Vendor "${target.name}" (${target.code})`,
          details: JSON.stringify({ vendorId: target.id, beforeState: target }),
          userId: user.id,
          userEmail: user.email || user.name,
          userRole: user.role,
          storeCode: target.storeCode,
        },
      });
    });

    await broadcastRealtimeEvent('vendors', 'VENDOR_UPDATED', {
      id: target.id,
      code: target.code,
      name: target.name,
      action: 'deleted',
    });

    return NextResponse.json({
      success: true,
      mode: 'deleted',
      message: `Vendor "${target.name}" permanently deleted from database.`,
    });
  } catch (error: any) {
    console.error('API /api/vendors DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive/delete vendor' },
      { status: 500 }
    );
  }
}
