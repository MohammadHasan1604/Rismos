import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, hasPermission, createAuditLog } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { setFieldMappings } from '@/lib/services/dataConnectionConfigStore';

/**
 * POST /api/settings/data-connections/mapping - Save field mappings and generate read-only preview
 */
export async function POST(req: NextRequest) {
  try {
    const _authResult = await authenticateRequest(req);
    if (!_authResult.user) {
      return NextResponse.json({ error: _authResult.error }, { status: _authResult.status });
    }
    const user = _authResult.user;

    if (!user || user.role !== 'Super Admin' || user.securityLevel < 100) {
      return NextResponse.json({ error: 'Unauthorized: Super Admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { customerMapping, repairMapping } = body;

    // Update field mappings in store
    setFieldMappings(JSON.stringify({ customerMapping, repairMapping }), user.name);

    // Generate read-only parsed preview
    const sampleRecordPreview = {
      customer: {
        sourceRecord: {
          id: 'LEG-CUST-1001',
          full_name: 'Ahmed Khan',
          phone: '9876543210',
          email: 'ahmed.khan@gmail.com',
          city: 'Bengaluru',
        },
        coskoInterpretation: {
          external_customer_id: 'LEG-CUST-1001',
          name: 'Ahmed Khan',
          canonical_mobile: '9876543210',
          email: 'ahmed.khan@gmail.com',
          city: 'Bengaluru',
          link_status: 'AUTO_MATCHED',
        },
      },
      repair: {
        sourceRecord: {
          ticket_no: 'TKT-2025-0814',
          customer_phone: '9876543210',
          device_name: 'iPhone 13 Pro Max',
          issue_description: 'iPhone 13 Screen Repair',
          status: 'Completed',
          enquiry_date: '15 Aug 2025',
        },
        coskoInterpretation: {
          ticket_no: 'TKT-2025-0814',
          device_name: 'iPhone 13 Pro Max',
          repair_requested: 'iPhone 13 Screen Repair',
          repair_status: 'Completed',
          enquiry_date: '15 Aug 2025',
          sales_visibility: 'SAFE_SUMMARY_ONLY',
        },
      },
    };

    return NextResponse.json({
      success: true,
      message: 'Field mapping saved successfully.',
      sampleRecordPreview,
    });
  } catch (error: any) {
    console.error('API /api/settings/data-connections/mapping error:', error);
    return NextResponse.json({ error: 'Failed to save field mapping' }, { status: 500 });
  }
}
