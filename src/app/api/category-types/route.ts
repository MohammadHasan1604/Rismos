import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/authPipeline';
import { broadcastRealtimeEvent } from '@/lib/realtime';

const DEFAULT_CATEGORY_TYPES = [
  {
    name: 'Product',
    code: 'product',
    description: 'General retail products and inventory goods',
    color: 'primary',
    isSystem: true,
  },
  {
    name: 'Expense',
    code: 'expense',
    description: 'Operational, administrative and store expenses',
    color: 'danger',
    isSystem: true,
  },
  {
    name: 'Device',
    code: 'device',
    description: 'Smartphones, Tablets, Smartwatches, Laptops and finished electronics',
    color: 'info',
    isSystem: true,
  },
  {
    name: 'Spare Part',
    code: 'spare-part',
    description: 'Replacement parts, repair components and hardware',
    color: 'warning',
    isSystem: true,
  },
  {
    name: 'Accessory',
    code: 'accessory',
    description: 'Cables, cases, chargers and peripherals',
    color: 'success',
    isSystem: true,
  },
  {
    name: 'Service',
    code: 'service',
    description: 'Labor, diagnostic services and maintenance packages',
    color: 'purple',
    isSystem: true,
  },
  {
    name: 'EV',
    code: 'ev',
    description: 'Electric vehicle components, battery packs and drives',
    color: 'emerald',
    isSystem: true,
  },
  {
    name: 'Home Appliance',
    code: 'home-appliance',
    description: 'ACs, TVs, Refrigerators, Washing machines and spares',
    color: 'amber',
    isSystem: true,
  },
];

let cachedCategoryTypesPayload: any = null;
let lastCategoryTypesCacheTime = 0;
const CATEGORY_TYPES_CACHE_TTL = 60_000;

function invalidateCategoryTypesCache() {
  cachedCategoryTypesPayload = null;
  lastCategoryTypesCacheTime = 0;
}

/**
 * GET /api/category-types
 * Returns full list of Category Types with real-time Category count for dependency tracking
 */
export async function GET(req: NextRequest) {
  try {
    const forceFresh = req?.nextUrl?.searchParams?.get('fresh') === 'true';
    if (
      !forceFresh &&
      cachedCategoryTypesPayload &&
      Date.now() - lastCategoryTypesCacheTime < CATEGORY_TYPES_CACHE_TTL
    ) {
      return NextResponse.json(cachedCategoryTypesPayload, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    let types = await (prisma as any).categoryType.findMany({
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
    });

    // Auto-seed defaults if database table is empty
    if (types.length === 0) {
      // 1. Seed defaults
      for (const def of DEFAULT_CATEGORY_TYPES) {
        await (prisma as any).categoryType.upsert({
          where: { name: def.name },
          update: {},
          create: def,
        });
      }

      // 2. Also import any distinct category types already present in Category table
      const distinctTypes = await (prisma as any).category.findMany({
        select: { categoryType: true },
        distinct: ['categoryType'],
      });

      for (const d of distinctTypes) {
        if (
          d.categoryType &&
          !DEFAULT_CATEGORY_TYPES.some((x) => x.name.toLowerCase() === d.categoryType.toLowerCase())
        ) {
          const code = d.categoryType
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
          await (prisma as any).categoryType.upsert({
            where: { name: d.categoryType },
            update: {},
            create: {
              name: d.categoryType,
              code: code || `type-${Date.now().toString(36)}`,
              description: `Imported from existing categories`,
              color: 'secondary',
              isSystem: false,
            },
          });
        }
      }

      types = await (prisma as any).categoryType.findMany({
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
      });
    }

    // Attach category count to each type for dependency protection in UI
    const counts = await (prisma as any).category.groupBy({
      by: ['categoryType'],
      _count: { id: true },
    });

    const countMap = new Map<string, number>();
    counts.forEach((c: any) => {
      if (c.categoryType) {
        countMap.set(c.categoryType.toLowerCase(), c._count.id);
      }
    });

    const enrichedTypes = types.map((t: any) => ({
      ...t,
      categoryCount: countMap.get(t.name.toLowerCase()) || 0,
    }));

    const payload = {
      success: true,
      categoryTypes: enrichedTypes,
    };

    cachedCategoryTypesPayload = payload;
    lastCategoryTypesCacheTime = Date.now();

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error: any) {
    console.error('Error fetching category types:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to retrieve category types', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/category-types
 * Creates a new Category Type
 */
export async function POST(req: NextRequest) {
  try {
    const _authResult = await authenticateRequest(req);
    if (!_authResult.user) {
      return NextResponse.json({ error: _authResult.error }, { status: _authResult.status });
    }
    const session = _authResult.user;
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Store Manager')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized: Only Admin or Store Manager can create Category Types',
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, description, color = 'primary' } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, message: 'Category Type name is required' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const code = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    // Check for duplicate name or code
    const existing = await (prisma as any).categoryType.findFirst({
      where: {
        OR: [{ name: { equals: trimmedName } }, { code: { equals: code } }],
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, message: `Category Type "${trimmedName}" already exists` },
        { status: 400 }
      );
    }

    const newType = await (prisma as any).categoryType.create({
      data: {
        name: trimmedName,
        code: code || `type-${Date.now().toString(36)}`,
        description: description?.trim() || null,
        color: color || 'primary',
        isSystem: false,
      },
    });

    invalidateCategoryTypesCache();
    await broadcastRealtimeEvent('category-types', 'CATEGORY_TYPE_CREATED', {
      id: newType.id,
      name: newType.name,
    });

    return NextResponse.json({
      success: true,
      categoryType: { ...newType, categoryCount: 0 },
      message: `Category Type "${newType.name}" created successfully`,
    });
  } catch (error: any) {
    console.error('Error creating category type:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create category type', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/category-types
 * Updates an existing Category Type (and cascades name updates to Category records if renamed)
 */
export async function PUT(req: NextRequest) {
  try {
    const _authResult = await authenticateRequest(req);
    if (!_authResult.user) {
      return NextResponse.json({ error: _authResult.error }, { status: _authResult.status });
    }
    const session = _authResult.user;
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Store Manager')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized: Only Admin or Store Manager can update Category Types',
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, name, description, color } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Category Type ID is required' },
        { status: 400 }
      );
    }

    const existing = await (prisma as any).categoryType.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Category Type not found' },
        { status: 404 }
      );
    }

    const trimmedName = name ? name.trim() : existing.name;
    const oldName = existing.name;
    const isRenaming = trimmedName !== oldName;

    if (isRenaming) {
      // Check collision
      const collision = await (prisma as any).categoryType.findFirst({
        where: {
          name: trimmedName,
          id: { not: id },
        },
      });
      if (collision) {
        return NextResponse.json(
          { success: false, message: `Another Category Type already uses name "${trimmedName}"` },
          { status: 400 }
        );
      }
    }

    const updated = await (prisma as any).$transaction(async (tx: any) => {
      const u = await tx.categoryType.update({
        where: { id },
        data: {
          name: trimmedName,
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
          ...(color !== undefined ? { color } : {}),
        },
      });

      // If renamed, update all categories using the old name safely
      if (isRenaming) {
        await tx.category.updateMany({
          where: { categoryType: oldName },
          data: { categoryType: trimmedName },
        });
      }

      return u;
    });

    // Get updated category count
    const count = await (prisma as any).category.count({
      where: { categoryType: updated.name },
    });

    invalidateCategoryTypesCache();
    await broadcastRealtimeEvent('category-types', 'CATEGORY_TYPE_UPDATED', {
      id: updated.id,
      name: updated.name,
    });

    return NextResponse.json({
      success: true,
      categoryType: { ...updated, categoryCount: count },
      message: `Category Type "${updated.name}" updated successfully`,
    });
  } catch (error: any) {
    console.error('Error updating category type:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update category type', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/category-types - Delete Approval Workflow
 * Deletes a Category Type with STRICT dependency protection
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const session = auth.user;
    if (session.securityLevel < 80) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Insufficient security level' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');
    const reason = searchParams.get('reason') || '';

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Category Type ID is required' },
        { status: 400 }
      );
    }

    const targetType = await (prisma as any).categoryType.findUnique({ where: { id } });
    if (!targetType) {
      return NextResponse.json(
        { success: false, message: 'Category Type not found' },
        { status: 404 }
      );
    }

    // NON-SUPER-ADMIN: delete approval workflow
    if (session.securityLevel < 100) {
      if (!reason || reason.trim().length < 3) {
        return NextResponse.json(
          { success: false, message: 'A reason for deletion is required (minimum 3 characters)' },
          { status: 400 }
        );
      }
      const { createDeleteRequest } = await import('@/lib/services/deleteApprovalService');
      const result = await createDeleteRequest(session as any, {
        entityType: 'CATEGORY_TYPE',
        entityId: id,
        reason: reason.trim(),
      });
      if (!result.success)
        return NextResponse.json({ success: false, message: result.error }, { status: 409 });
      return NextResponse.json({
        success: true,
        mode: 'pending_approval',
        deleteRequest: result.deleteRequest,
        message: `Delete request for category type "${targetType.name}" submitted for Super Admin approval.`,
      });
    }

    // SUPER ADMIN: Dependency Protection
    const categoryCount = await (prisma as any).category.count({
      where: { categoryType: targetType.name },
    });

    if (categoryCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'DEPENDENCY_PROTECTED',
          message: `Cannot delete Category Type "${targetType.name}" because ${categoryCount} categor${categoryCount === 1 ? 'y is' : 'ies are'} assigned to it.`,
          categoryCount,
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.categoryType.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          module: 'CATEGORY_TYPES',
          action: `DELETED: Category Type "${targetType.name}"`,
          details: JSON.stringify({ categoryTypeId: id, beforeState: targetType }),
          userEmail: session.email,
          userRole: session.role,
          storeCode: session.store || 'CENTRAL',
        },
      });
    });

    invalidateCategoryTypesCache();
    await broadcastRealtimeEvent('category-types', 'CATEGORY_TYPE_DELETED', {
      id,
      name: targetType.name,
    });

    return NextResponse.json({
      success: true,
      message: `Category Type "${targetType.name}" deleted successfully`,
    });
  } catch (error: any) {
    console.error('Error deleting category type:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete category type', error: error.message },
      { status: 500 }
    );
  }
}
