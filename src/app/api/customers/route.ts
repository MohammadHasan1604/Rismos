import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  hasPermission,
  createAuditLog,
  validatePhysicalStore,
} from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { normalizeMobileNumber } from '@/lib/phoneUtils';
import { broadcastRealtimeEvent, getStoreChannel } from '@/lib/realtime';
import { executeWithIdempotency } from '@/lib/idempotency';

/**
 * GET /api/customers - Search customer by normalized phone or query (excludes Archived by default)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');
    const query = searchParams.get('query') || searchParams.get('search');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const isSuperAdmin = user.role === 'Super Admin' || user.securityLevel >= 100;
    const callerStore = (
      user.store && user.store !== 'All Stores' ? user.store : 'BLR'
    ).toUpperCase();

    const whereClause: any = {};
    if (!includeArchived) {
      whereClause.status = { not: 'Archived' };
    }

    const mapCustomerProfiles = (c: any) => {
      if (!c) return c;
      const allProfiles = c.storeProfiles || [];
      let totalSpent = 0;
      let creditBalance = 0;
      let totalOrders = 0;

      if (!isSuperAdmin) {
        const p = allProfiles.find((prof: any) => prof.storeCode.toUpperCase() === callerStore);
        if (p) {
          totalSpent = Number(p.totalSpent) || 0;
          creditBalance = Number(p.creditBalance) || 0;
          totalOrders = Number(p.totalOrders) || 0;
        }
        return {
          ...c,
          totalSpent,
          creditBalance,
          totalOrders,
          storeProfiles: p ? [p] : [],
          serviceStores: p ? [p.storeCode] : [],
        };
      } else {
        const filterStore = searchParams.get('storeCode') || searchParams.get('store');
        if (filterStore && filterStore !== 'All Stores' && filterStore !== 'ALL') {
          const p = allProfiles.find(
            (prof: any) => prof.storeCode.toUpperCase() === filterStore.toUpperCase()
          );
          if (p) {
            totalSpent = Number(p.totalSpent) || 0;
            creditBalance = Number(p.creditBalance) || 0;
            totalOrders = Number(p.totalOrders) || 0;
          }
        } else {
          for (const p of allProfiles) {
            totalSpent += Number(p.totalSpent) || 0;
            creditBalance += Number(p.creditBalance) || 0;
            totalOrders += Number(p.totalOrders) || 0;
          }
        }
        return {
          ...c,
          totalSpent,
          creditBalance,
          totalOrders,
          storeProfiles: allProfiles,
          serviceStores: allProfiles.map((prof: any) => prof.storeCode),
        };
      }
    };

    if (phone) {
      const normalized = normalizeMobileNumber(phone);
      const customer = await (prisma as any).customer.findFirst({
        where: {
          ...whereClause,
          normalizedPhone: {
            contains: normalized,
          },
        },
        include: {
          storeProfiles: true,
          sales: {
            select: { storeCode: true },
            take: 5,
          },
        },
      });

      if (!customer) {
        return NextResponse.json(
          { success: true, customer: null },
          { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        );
      }

      // Non-Super-Admin: Customer MUST have an active profile or past sales in callerStore
      if (!isSuperAdmin) {
        const hasStoreProfile = customer.storeProfiles?.some(
          (p: any) => p.storeCode.toUpperCase() === callerStore
        );
        const hasSalesInStore = customer.sales?.some(
          (s: any) => s.storeCode.toUpperCase() === callerStore
        );
        if (!hasStoreProfile && !hasSalesInStore) {
          // Exists exclusively in another store — block enumeration
          return NextResponse.json(
            { success: true, customer: null },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
          );
        }
      }

      return NextResponse.json(
        { success: true, customer: mapCustomerProfiles(customer) },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    const storeScopeCondition = {
      OR: [
        { storeProfiles: { some: { storeCode: callerStore } } },
        { sales: { some: { storeCode: callerStore } } },
      ],
    };

    if (query) {
      const searchConditions = [
        { name: { contains: query } },
        { phone: { contains: query } },
        { email: { contains: query } },
      ];
      if (!isSuperAdmin) {
        whereClause.AND = [storeScopeCondition, { OR: searchConditions }];
      } else {
        whereClause.OR = searchConditions;
      }
    } else if (!isSuperAdmin) {
      whereClause.AND = [storeScopeCondition];
    }

    const customers = await (prisma as any).customer.findMany({
      where: whereClause,
      include: {
        storeProfiles: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return NextResponse.json(
      { success: true, customers: customers.map(mapCustomerProfiles) },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/customers GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve customer records' }, { status: 500 });
  }
}

/**
 * POST /api/customers - Create or update Customer Master profile
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const body = await req.json();

    if (!body.name || !body.phone) {
      return NextResponse.json({ error: 'Customer Name and Phone are required' }, { status: 400 });
    }

    const normalizedPhone = normalizeMobileNumber(body.phone);

    const isSuperAdmin = user.role === 'Super Admin' || user.securityLevel >= 100;
    let effectiveStore: string;

    if (!isSuperAdmin) {
      // Non-Super-Admin: storeCode MUST be authenticated user.store.
      // Ignore/reject forged storeCode.
      const assignedStore = (user.store || '').toUpperCase().trim();
      if (
        !assignedStore ||
        assignedStore === 'ALL' ||
        assignedStore === 'ALL STORES' ||
        assignedStore === 'HQ'
      ) {
        return NextResponse.json(
          { error: 'Assigned physical store required to register customers' },
          { status: 403 }
        );
      }
      effectiveStore = assignedStore;
    } else {
      // Super Admin: accept selected physical store ONLY after validatePhysicalStore()
      const requestedStore = (body.storeCode || body.store || '').trim();
      if (
        !requestedStore ||
        requestedStore.toUpperCase() === 'ALL' ||
        requestedStore.toUpperCase() === 'ALL STORES' ||
        requestedStore.toUpperCase() === 'HQ'
      ) {
        return NextResponse.json(
          {
            error:
              'Super Admin must select a valid active physical store for customer service location',
          },
          { status: 400 }
        );
      }
      const val = await validatePhysicalStore(requestedStore);
      if (!val.valid) {
        return NextResponse.json(
          { error: val.error || `Invalid or inactive physical store: "${requestedStore}"` },
          { status: 400 }
        );
      }
      effectiveStore = val.storeCode!;
    }

    const customKey =
      body.idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `cust_${normalizedPhone}_${Date.now()}`;

    return await executeWithIdempotency(
      req,
      {
        action: 'CREATE_CUSTOMER',
        key: customKey,
        userId: user.id,
        extractEntityId: (d) => d?.customer?.id,
      },
      async () => {
        const customer = await prisma.$transaction(
          async (tx: any) => {
            const existingCustomer = await tx.customer.findFirst({
              where: { normalizedPhone },
            });

            const storeCode = effectiveStore;
            const initialSpent = Number(body.totalSpend || body.totalSpent) || 0;
            const initialCredit = Number(body.creditBalance) || 0;

            if (existingCustomer) {
              // Ownership check: Only modify master profile fields if Super Admin or caller owns the customer exclusively
              const existingProfiles = await tx.customerStoreProfile.findMany({
                where: { customerId: existingCustomer.id },
              });
              const callerProfile = existingProfiles.find(
                (p: any) => p.storeCode.toUpperCase() === storeCode
              );
              const canModifyMaster =
                isSuperAdmin ||
                existingProfiles.length === 0 ||
                (existingProfiles.length === 1 && Boolean(callerProfile));

              const updateData: any = { status: 'Active' };
              if (canModifyMaster) {
                if (body.name) updateData.name = body.name.trim();
                if (body.email !== undefined)
                  updateData.email = body.email ? body.email.trim() : null;
                if (body.address !== undefined)
                  updateData.address = body.address ? body.address.trim() : null;
                if (body.city !== undefined) updateData.city = body.city ? body.city.trim() : null;
              }

              const updated = await tx.customer.update({
                where: { id: existingCustomer.id },
                data: updateData,
              });

              // Always ensure effectiveStore's profile is upserted safely
              const profile = await tx.customerStoreProfile.upsert({
                where: {
                  customerId_storeCode: {
                    customerId: existingCustomer.id,
                    storeCode,
                  },
                },
                create: {
                  customerId: existingCustomer.id,
                  storeCode,
                  totalSpent: initialSpent,
                  creditBalance: initialCredit,
                  totalOrders: 0,
                },
                update: {
                  creditBalance: initialCredit > 0 ? initialCredit : undefined,
                },
              });

              const allProfiles = await tx.customerStoreProfile.findMany({
                where: { customerId: existingCustomer.id },
              });

              return {
                ...updated,
                storeCode,
                totalSpent: Number(profile.totalSpent) || initialSpent,
                creditBalance: Number(profile.creditBalance) || initialCredit,
                totalOrders: Number(profile.totalOrders) || 0,
                storeProfiles: isSuperAdmin ? allProfiles : [profile],
                serviceStores: isSuperAdmin
                  ? allProfiles.map((p: any) => p.storeCode)
                  : [profile.storeCode],
              };
            }

            const created = await tx.customer.create({
              data: {
                name: body.name.trim(),
                phone: body.phone,
                normalizedPhone,
                email: body.email ? body.email.trim() : null,
                address: body.address ? body.address.trim() : null,
                city: body.city ? body.city.trim() : '',
                status: 'Active',
              },
            });

            const newProfile = await tx.customerStoreProfile.create({
              data: {
                customerId: created.id,
                storeCode,
                totalSpent: initialSpent,
                creditBalance: initialCredit,
                totalOrders: 0,
              },
            });

            return {
              ...created,
              storeCode,
              totalSpent: initialSpent,
              creditBalance: initialCredit,
              totalOrders: 0,
              storeProfiles: [newProfile],
              serviceStores: [newProfile.storeCode],
            };
          },
          { maxWait: 15000, timeout: 45000 }
        );

        const customerPayload = {
          entityId: customer.id,
          storeCode: effectiveStore,
          action: 'saved',
        };

        await broadcastRealtimeEvent('customers', 'CUSTOMER_UPDATED', customerPayload);
        await broadcastRealtimeEvent(
          getStoreChannel(effectiveStore),
          'CUSTOMER_UPDATED',
          customerPayload
        );

        return { status: 201, data: { success: true, customer } };
      }
    );
  } catch (error: any) {
    console.error('API /api/customers POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save customer' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/customers - Update existing customer
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const isSuperAdmin = user.role === 'Super Admin' || user.securityLevel >= 100;
    let targetStoreCode: string | undefined;

    if (!isSuperAdmin) {
      const callerStore = (
        user.store && user.store !== 'All Stores' ? user.store : 'BLR'
      ).toUpperCase();
      const association = await (prisma as any).customer.findFirst({
        where: {
          id: body.id,
          OR: [
            { storeProfiles: { some: { storeCode: callerStore } } },
            { sales: { some: { storeCode: callerStore } } },
          ],
        },
        select: { id: true },
      });
      if (!association) {
        return NextResponse.json(
          {
            error: `Forbidden: Customer is not associated with your assigned store "${user.store}". Modification denied.`,
          },
          { status: 403 }
        );
      }
      targetStoreCode = callerStore;
    } else {
      if (body.storeCode || body.store) {
        const val = await validatePhysicalStore(body.storeCode || body.store);
        if (val.valid && val.storeCode) {
          targetStoreCode = val.storeCode;
        }
      }
      if (!targetStoreCode) {
        targetStoreCode =
          user.store && user.store !== 'All Stores' && user.store !== 'HQ'
            ? user.store.toUpperCase()
            : undefined;
      }
    }

    const customer = await (prisma as any).customer.update({
      where: { id: body.id },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.phone
          ? { phone: body.phone, normalizedPhone: normalizeMobileNumber(body.phone) }
          : {}),
        ...(body.email !== undefined ? { email: body.email ? body.email.trim() : null } : {}),
        ...(body.city !== undefined ? { city: body.city ? body.city.trim() : null } : {}),
        ...(body.address !== undefined
          ? { address: body.address ? body.address.trim() : null }
          : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });

    if (body.creditBalance !== undefined && targetStoreCode) {
      await (prisma as any).customerStoreProfile.upsert({
        where: {
          customerId_storeCode: {
            customerId: body.id,
            storeCode: targetStoreCode,
          },
        },
        create: {
          customerId: body.id,
          storeCode: targetStoreCode,
          creditBalance: Number(body.creditBalance) || 0,
          totalSpent: 0,
          totalOrders: 0,
        },
        update: {
          creditBalance: Number(body.creditBalance) || 0,
        },
      });
    }

    const customerStore = targetStoreCode || (user.store || 'BLR').toUpperCase();
    const customerPayload = {
      entityId: customer.id,
      storeCode: customerStore,
      action: 'updated',
    };

    await broadcastRealtimeEvent('customers', 'CUSTOMER_UPDATED', customerPayload);
    if (customerStore) {
      await broadcastRealtimeEvent(
        getStoreChannel(customerStore),
        'CUSTOMER_UPDATED',
        customerPayload
      );
    }

    return NextResponse.json({ success: true, customer });
  } catch (error: any) {
    console.error('API /api/customers PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update customer' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/customers - Delete Approval Workflow
 * Super Admin: direct archive/delete. Store Manager: creates pending delete request.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient security level' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';
    const reason = searchParams.get('reason') || '';

    if (!id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const target = await (prisma as any).customer.findUnique({ where: { id } }).catch(() => null);
    if (!target) {
      return NextResponse.json({
        success: true,
        message: 'Customer already deleted or non-existent',
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
        entityType: 'CUSTOMER',
        entityId: id,
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
        message: `Delete request for customer "${target.name}" submitted for Super Admin approval.`,
      });
    }

    // ─── SUPER ADMIN: Direct delete/archive ─────────────────────────────────
    const [salesCount, repairCount] = await Promise.all([
      (prisma as any).salesOrder.count({ where: { customerId: target.id } }),
      (prisma as any).repairEnquiry.count({ where: { customerId: target.id } }),
    ]);

    const hasHistory =
      salesCount > 0 ||
      repairCount > 0 ||
      Number(target.totalSpent) > 0 ||
      Number(target.creditBalance) > 0;

    if (hasHistory || !permanent) {
      const customer = await (prisma as any).customer.update({
        where: { id: target.id },
        data: { status: 'Archived' },
      });

      await (prisma as any).auditLog.create({
        data: {
          module: 'CUSTOMERS',
          action: `ARCHIVED: Customer "${target.name}"`,
          details: JSON.stringify({
            customerId: target.id,
            salesCount,
            repairCount,
            totalSpent: target.totalSpent,
          }),
          userEmail: user.email,
          userRole: user.role,
          storeCode: user.store || 'CENTRAL',
        },
      });

      await broadcastRealtimeEvent('customers', 'CUSTOMER_UPDATED', {
        entityId: target.id,
        action: 'archived',
      });

      return NextResponse.json({
        success: true,
        mode: 'archived',
        customer,
        hasHistory,
        message: hasHistory
          ? `Customer "${target.name}" has business history (${salesCount} sales, ${repairCount} repairs, ${target.totalSpent} spend) and was archived safely.`
          : `Customer "${target.name}" archived successfully.`,
      });
    }

    // Hard-delete only for completely unused customers by Super Admin
    await prisma.$transaction(
      async (tx: any) => {
        await tx.customerExternalLink.deleteMany({ where: { coskoCustomerId: target.id } });
        await tx.customer.delete({ where: { id: target.id } });
        await tx.auditLog.create({
          data: {
            module: 'CUSTOMERS',
            action: `HARD_DELETED: Customer "${target.name}"`,
            details: JSON.stringify({ customerId: target.id, beforeState: target }),
            userEmail: user.email,
            userRole: user.role,
            storeCode: user.store || 'CENTRAL',
          },
        });
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const customerStore = user.store || 'BLR';
    const customerPayload = {
      entityId: target.id,
      storeCode: customerStore,
      action: 'deleted',
    };

    await broadcastRealtimeEvent('customers', 'CUSTOMER_UPDATED', customerPayload);
    if (customerStore) {
      await broadcastRealtimeEvent(
        getStoreChannel(customerStore),
        'CUSTOMER_UPDATED',
        customerPayload
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'deleted',
      message: `Customer "${target.name}" permanently deleted from database.`,
    });
  } catch (error: any) {
    console.error('API /api/customers DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive/delete customer' },
      { status: 500 }
    );
  }
}
