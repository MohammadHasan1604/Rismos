import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { getLegacyCustomersList } from '@/lib/services/legacyCustomerService';

/**
 * GET /api/customers/legacy/link - List all legacy customer identities and link statuses
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const linkStatus = searchParams.get('linkStatus') || 'All';
    const search = searchParams.get('search') || '';

    // Retrieve database links
    const externalLinks = await prisma.customerExternalLink.findMany({
      include: { customer: true },
    });

    const linkMap = new Map<string, any>();
    externalLinks.forEach((l) => {
      linkMap.set(l.externalCustomerId, l);
    });

    const legacyList = await getLegacyCustomersList({ linkStatus, search });

    // Overlay real database link statuses
    const mergedList = legacyList.map((c) => {
      const dbLink = linkMap.get(c.id);
      if (dbLink) {
        return {
          ...c,
          linkStatus: dbLink.linkStatus,
          coskoCustomerId: dbLink.coskoCustomerId,
        };
      }
      return c;
    });

    const filtered =
      linkStatus === 'All' ? mergedList : mergedList.filter((c) => c.linkStatus === linkStatus);

    return NextResponse.json(
      { success: true, customers: filtered },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      }
    );
  } catch (error: any) {
    console.error('API /api/customers/legacy/link GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve legacy customer list' }, { status: 500 });
  }
}

/**
 * POST /api/customers/legacy/link - Create, verify, or unlink customer bridge in MySQL
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.securityLevel < 60) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to link customer records' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { legacyCustomerId, coskoCustomerId, action, customerName, phone } = body;

    if (!legacyCustomerId) {
      return NextResponse.json({ error: 'Legacy Customer ID is required' }, { status: 400 });
    }

    const newStatus = action === 'unlink' ? 'UNLINKED' : 'VERIFIED';

    // Find or resolve target cosko customer
    let resolvedCoskoId = coskoCustomerId;
    if (!resolvedCoskoId && phone) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const matched = await prisma.customer.findFirst({
        where: { normalizedPhone: { contains: cleanPhone } },
      });
      if (matched) resolvedCoskoId = matched.id;
    }

    // Persist real external link in MySQL
    const existing = await prisma.customerExternalLink.findFirst({
      where: { externalCustomerId: legacyCustomerId },
    });

    let link;
    if (existing) {
      link = await prisma.customerExternalLink.update({
        where: { id: existing.id },
        data: {
          linkStatus: newStatus,
          coskoCustomerId:
            newStatus === 'UNLINKED' ? null : resolvedCoskoId || existing.coskoCustomerId,
          verifiedBy: user.name,
          verifiedAt: new Date(),
        },
      });
    } else {
      const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
      if (!cleanPhone) {
        return NextResponse.json(
          {
            success: false,
            error:
              'A valid 10-digit mobile phone number is required to link external customer records.',
          },
          { status: 400 }
        );
      }
      link = await prisma.customerExternalLink.create({
        data: {
          externalCustomerId: legacyCustomerId,
          externalCustomerName: customerName || 'Historical Customer',
          normalizedMobile: cleanPhone,
          linkStatus: newStatus,
          sourceSystem: 'LEGACY_MYSQL_DB',
          matchType: 'EXACT_PHONE',
          coskoCustomerId: newStatus === 'UNLINKED' ? null : resolvedCoskoId,
          verifiedBy: user.name,
          verifiedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message:
        action === 'unlink'
          ? 'Customer identity unlinked successfully in MySQL'
          : 'Customer identity link verified successfully in MySQL',
      link,
    });
  } catch (error: any) {
    console.error('API /api/customers/legacy/link POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update link status' },
      { status: 500 }
    );
  }
}
