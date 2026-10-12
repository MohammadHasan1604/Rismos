import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/authPipeline';
import { broadcastRealtimeEvent } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

const DEFAULT_BRANDS = [
  'Apple',
  'Samsung',
  'Google',
  'OnePlus',
  'Xiaomi',
  'Sony',
  'Dell',
  'HP',
  'Lenovo',
  'Asus',
  'Ather',
  'Ola Electric',
  'Generic / OEM',
];

export async function GET(_req: NextRequest) {
  try {
    let items = await prisma.brand.findMany({
      orderBy: [{ name: 'asc' }],
    });

    if (items.length === 0) {
      // 1. Gather distinct brands from existing products
      const existingProds = await prisma.product.findMany({
        where: { brand: { not: null } },
        select: { brand: true },
        distinct: ['brand'],
      });

      const brandNames = new Set<string>();
      DEFAULT_BRANDS.forEach((b) => brandNames.add(b));
      existingProds.forEach((p) => {
        if (p.brand && p.brand.trim()) brandNames.add(p.brand.trim());
      });

      for (const name of brandNames) {
        const code = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');
        await prisma.brand.upsert({
          where: { name },
          update: {},
          create: {
            name,
            code: code || `br-${Date.now().toString(36)}`,
            status: 'Active',
          },
        });
      }

      items = await prisma.brand.findMany({
        orderBy: [{ name: 'asc' }],
      });
    }

    return NextResponse.json({
      success: true,
      brands: items,
      totalCount: items.length,
    });
  } catch (error: any) {
    console.error('Error fetching brands:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch brands' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const _ar = await authenticateRequest(req);
    if (!_ar.user) {
      return NextResponse.json({ error: _ar.error }, { status: _ar.status });
    }
    const body = await req.json();

    const name = body?.name?.trim();
    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Brand name is required' },
        { status: 400 }
      );
    }

    const code =
      body?.code
        ?.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 32);

    const description = body?.description?.trim() || null;
    const status = body?.status === 'Inactive' ? 'Inactive' : 'Active';

    // Duplicate check
    const existing = await prisma.brand.findFirst({
      where: {
        OR: [{ name: { equals: name } }, { code: { equals: code } }],
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: true, brand: existing, message: 'Brand already exists' },
        { status: 200 }
      );
    }

    const created = await prisma.brand.create({
      data: {
        name,
        code,
        description,
        status,
      },
    });

    await broadcastRealtimeEvent('brands', 'BRAND_CREATED', created);

    return NextResponse.json(
      { success: true, brand: created, message: 'Brand created successfully' },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating brand:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create brand' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const _ar = await authenticateRequest(req);
    if (!_ar.user) {
      return NextResponse.json({ error: _ar.error }, { status: _ar.status });
    }
    const body = await req.json();

    const id = body?.id?.trim();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Brand ID is required' }, { status: 400 });
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        description: body.description?.trim() || null,
        status: body.status,
      },
    });

    await broadcastRealtimeEvent('brands', 'BRAND_UPDATED', updated);

    return NextResponse.json({
      success: true,
      brand: updated,
      message: 'Brand updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating brand:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update brand' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const _ar = await authenticateRequest(req);
    if (!_ar.user) {
      return NextResponse.json({ error: _ar.error }, { status: _ar.status });
    }
    const authUser = _ar.user;
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (authUser.securityLevel < 80) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const reason = searchParams.get('reason') || '';

    if (!id) {
      return NextResponse.json({ success: false, error: 'Brand ID is required' }, { status: 400 });
    }

    const existing = await prisma.brand.findUnique({ where: { id } }).catch(() => null);
    if (!existing) {
      return NextResponse.json({ success: true, message: 'Brand already deleted or non-existent' });
    }

    // NON-SUPER-ADMIN: delete approval workflow
    if (authUser.securityLevel < 100) {
      if (!reason || reason.trim().length < 3) {
        return NextResponse.json(
          { success: false, error: 'A reason for deletion is required (minimum 3 characters)' },
          { status: 400 }
        );
      }
      const { createDeleteRequest } = await import('@/lib/services/deleteApprovalService');
      const result = await createDeleteRequest(authUser as any, {
        entityType: 'BRAND',
        entityId: id,
        reason: reason.trim(),
      });
      if (!result.success)
        return NextResponse.json({ success: false, error: result.error }, { status: 409 });
      return NextResponse.json({
        success: true,
        mode: 'pending_approval',
        deleteRequest: result.deleteRequest,
        message: `Delete request for brand "${existing.name}" submitted for Super Admin approval.`,
      });
    }

    // SUPER ADMIN: direct delete
    await prisma.$transaction(async (tx: any) => {
      await tx.brand.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          module: 'BRANDS',
          action: `DELETED: Brand "${existing.name}"`,
          details: JSON.stringify({ brandId: id, beforeState: existing }),
          userEmail: authUser.email,
          userRole: authUser.role,
          storeCode: authUser.store || 'CENTRAL',
        },
      });
    });

    await broadcastRealtimeEvent('brands', 'BRAND_DELETED', { id });

    return NextResponse.json({ success: true, message: 'Brand deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting brand:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete brand' },
      { status: 500 }
    );
  }
}
