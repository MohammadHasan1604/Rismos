import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, hasPermission, createAuditLog } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent, getStoreChannel, persistOutboxEvent } from '@/lib/realtime';
import { generateDateSequenceNo } from '@/lib/sequenceUtils';
import { executeWithIdempotency } from '@/lib/idempotency';
import { validatePaymentMethod } from '@/lib/paymentValidator';

/**
 * Helper to compute overdue days and status
 */
function computeBillOverdue(dueDateStr: string | Date | null | undefined, balance: number) {
  if (balance <= 0.005) {
    return { overdueDays: 0, overdueStatus: 'Settled' };
  }
  if (!dueDateStr) {
    return { overdueDays: 0, overdueStatus: 'Upcoming' };
  }

  const dueDate = new Date(dueDateStr);
  const now = new Date();
  // Normalize both dates to midnight UTC/Local for clean day diff
  const dueMidnight = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate()
  ).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const diffDays = Math.round((todayMidnight - dueMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return { overdueDays: diffDays, overdueStatus: 'Overdue' };
  } else if (diffDays === 0) {
    return { overdueDays: 0, overdueStatus: 'Due Today' };
  } else {
    return { overdueDays: 0, overdueStatus: 'Upcoming' };
  }
}

/**
 * GET /api/purchases/payments
 * Query by ?purchaseId=... OR ?vendorId=...
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC: Sales Manager has no vendor payment access
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Sales Managers do not have vendor payment access.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const purchaseId = searchParams.get('purchaseId');
    const vendorId = searchParams.get('vendorId');

    // Case 1: Fetch all bills & payments for a specific Vendor
    if (vendorId) {
      const vendor = await (prisma as any).vendor.findUnique({
        where: { id: vendorId },
        include: {
          purchases: {
            where: {
              status: { notIn: ['Cancelled', 'Archived'] },
              ...(user.role !== 'Super Admin' ? { storeCode: user.store } : {}),
            },
            include: {
              payments: {
                orderBy: { paymentDate: 'desc' },
              },
            },
            orderBy: { orderDate: 'desc' },
          },
        },
      });

      if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
      }

      if (user.role !== 'Super Admin' && vendor.storeCode !== user.store) {
        return NextResponse.json(
          {
            error: `Forbidden: Vendor belongs to store "${vendor.storeCode}", not your assigned store "${user.store}".`,
          },
          { status: 403 }
        );
      }

      let totalBilled = 0;
      let totalPaid = 0;
      let totalCredits = 0;
      let outstandingBalance = 0;
      let unpaidBillsCount = 0;
      let overdueBillsCount = 0;

      const bills = vendor.purchases.map((po: any) => {
        const totalCost = Number(po.totalCost) || 0;
        const creditAmount = Number(po.creditAmount) || 0;
        // Calculate sum of payments from real database payments relation
        const realPaid =
          po.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) ||
          Number(po.paidAmount) ||
          0;
        const balance = Math.max(0, totalCost - realPaid - creditAmount);

        totalBilled += totalCost;
        totalPaid += realPaid;
        totalCredits += creditAmount;
        outstandingBalance += balance;

        const effectiveDueDate = po.dueDate || po.expectedDate || null;
        const { overdueDays, overdueStatus } = computeBillOverdue(effectiveDueDate, balance);

        if (balance > 0.005) {
          unpaidBillsCount++;
          if (overdueStatus === 'Overdue') {
            overdueBillsCount++;
          }
        }

        return {
          id: po.id,
          poNo: po.poNo,
          invoiceNo: po.invoiceNo || po.poNo,
          storeCode: po.storeCode,
          orderDate: po.orderDate,
          expectedDate: po.expectedDate,
          dueDate: effectiveDueDate,
          totalCost,
          paidAmount: realPaid,
          creditAmount,
          balance,
          paymentStatus: po.paymentStatus,
          status: po.status,
          notes: po.notes,
          overdueDays,
          overdueStatus,
          payments: po.payments || [],
        };
      });

      return NextResponse.json(
        {
          success: true,
          vendor: {
            id: vendor.id,
            code: vendor.code,
            name: vendor.name,
            contactPerson: vendor.contactPerson,
            email: vendor.email,
            phone: vendor.phone,
            city: vendor.city,
            address: vendor.address,
            gstin: vendor.gstin,
            paymentTerms: vendor.paymentTerms,
            leadTimeDays: vendor.leadTimeDays,
            status: vendor.status,
          },
          summary: {
            totalBilled: Math.round(totalBilled * 100) / 100,
            totalPaid: Math.round(totalPaid * 100) / 100,
            totalCredits: Math.round(totalCredits * 100) / 100,
            outstandingBalance: Math.round(outstandingBalance * 100) / 100,
            totalBillsCount: bills.length,
            unpaidBillsCount,
            overdueBillsCount,
          },
          bills,
        },
        {
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        }
      );
    }

    // Case 2: Fetch payments & summary for a single Purchase Order
    if (purchaseId) {
      const purchase = await (prisma as any).purchaseOrder.findUnique({
        where: { id: purchaseId },
        include: {
          vendor: true,
          payments: {
            orderBy: { paymentDate: 'desc' },
          },
        },
      });

      if (!purchase) {
        return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
      }

      if (user.role !== 'Super Admin' && purchase.storeCode !== user.store) {
        return NextResponse.json(
          {
            error: `Forbidden: Purchase order belongs to store "${purchase.storeCode}", not your assigned store "${user.store}".`,
          },
          { status: 403 }
        );
      }

      const totalCost = Number(purchase.totalCost) || 0;
      const creditAmount = Number(purchase.creditAmount) || 0;
      const realPaid =
        purchase.payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) ||
        Number(purchase.paidAmount) ||
        0;
      const balance = Math.max(0, totalCost - realPaid - creditAmount);
      const effectiveDueDate = purchase.dueDate || purchase.expectedDate || null;
      const { overdueDays, overdueStatus } = computeBillOverdue(effectiveDueDate, balance);

      return NextResponse.json(
        {
          success: true,
          payments: purchase.payments,
          summary: {
            totalCost,
            totalPaid: realPaid,
            creditAmount,
            remaining: balance,
            paymentStatus: purchase.paymentStatus,
            overdueDays,
            overdueStatus,
            vendorName: purchase.vendor?.name,
            invoiceNo: purchase.invoiceNo || purchase.poNo,
            poNo: purchase.poNo,
          },
        },
        {
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        }
      );
    }

    return NextResponse.json(
      { error: 'Either purchaseId or vendorId is required' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('API /api/purchases/payments GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve payments' }, { status: 500 });
  }
}

/**
 * POST /api/purchases/payments - Record a payment against a purchase order atomically with idempotency
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC: Sales Manager cannot record vendor payments
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Sales Managers cannot record vendor payments' },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.purchaseId) {
      return NextResponse.json({ error: 'Purchase Order ID is required' }, { status: 400 });
    }

    // 🔒 Pre-flight check: Load PO and verify caller store and vendor store ownership
    const poCheck = await (prisma as any).purchaseOrder.findUnique({
      where: { id: body.purchaseId },
      include: { vendor: true, payments: true },
    });
    if (!poCheck) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    if (user.role !== 'Super Admin' && user.securityLevel < 100) {
      if (poCheck.storeCode !== user.store) {
        return NextResponse.json(
          {
            error: `Forbidden: Purchase order belongs to store "${poCheck.storeCode}", not your assigned store "${user.store}".`,
          },
          { status: 403 }
        );
      }
      if (poCheck.vendor && poCheck.vendor.storeCode !== user.store) {
        return NextResponse.json(
          {
            error: `Forbidden: Vendor belongs to store "${poCheck.vendor.storeCode}", not your assigned store "${user.store}".`,
          },
          { status: 403 }
        );
      }
    }

    const paymentAmount = Math.round(Number(body.amount) * 100) / 100;
    if (isNaN(paymentAmount) || paymentAmount <= 0.005) {
      return NextResponse.json(
        { error: 'Payment amount must be a positive number greater than 0' },
        { status: 400 }
      );
    }

    // MANDATORY PROOF & UTR VALIDATION (ROOT FIX)
    const proofUrl = body.receiptUrl || body.proofUrl;
    if (!proofUrl || !String(proofUrl).trim()) {
      return NextResponse.json(
        {
          error:
            'Payment proof is mandatory! Please upload a receipt/screenshot before recording payment.',
        },
        { status: 400 }
      );
    }

    const cleanRef =
      (body.referenceNo && String(body.referenceNo).trim()) ||
      (body.payRef && String(body.payRef).trim()) ||
      `VND-PAY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();

    // Strict Canonical Payment Method Enforcement (Cash, UPI, Other)
    const paymentValidation = validatePaymentMethod(body.paymentMethod || 'Other');
    if (!paymentValidation.valid) {
      return NextResponse.json({ error: paymentValidation.error }, { status: 400 });
    }
    const paymentMethod = paymentValidation.normalized!;

    const customKey =
      body.idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `pay_${body.purchaseId}_${cleanRef}_${paymentAmount}`;

    return await executeWithIdempotency(
      req,
      {
        action: 'RECORD_SUPPLIER_PAYMENT',
        key: customKey,
        userId: user.id,
        extractEntityId: (d) => d?.receiptVoucher?.voucherNo,
      },
      async () => {
        const result = await prisma.$transaction(
          async (tx: any) => {
            // 1. Lock & fetch PO with payments directly from DB
            const po = await tx.purchaseOrder.findUnique({
              where: { id: body.purchaseId },
              include: {
                payments: true,
                vendor: true,
              },
            });

            if (!po) {
              throw new Error('Purchase bill not found');
            }

            if (po.status === 'Cancelled' || po.status === 'Archived') {
              throw new Error(
                `Cannot record payment on a ${po.status.toLowerCase()} purchase bill (${po.poNo})`
              );
            }

            // 2. Authoritative calculation from DB source of truth
            const totalCost = Number(po.totalCost) || 0;
            const creditAmount = Number(po.creditAmount) || 0;
            const currentPaid = po.payments.reduce(
              (sum: number, p: any) => sum + (Number(p.amount) || 0),
              0
            );
            const remainingBeforePayment = Math.max(
              0,
              Math.round((totalCost - currentPaid - creditAmount) * 100) / 100
            );

            // 3. Prevent overpayment & negative balance
            if (remainingBeforePayment <= 0.005) {
              throw new Error(`This bill (${po.invoiceNo || po.poNo}) is already fully settled.`);
            }

            if (paymentAmount > remainingBeforePayment + 0.01) {
              throw new Error(
                `Payment amount (${paymentAmount}) exceeds the remaining balance (${remainingBeforePayment})`
              );
            }

            // 4. Prevent accidental duplicate payment
            const recentDuplicate = await tx.purchasePayment.findFirst({
              where: {
                purchaseId: body.purchaseId,
                referenceNo: cleanRef,
                amount: paymentAmount,
                createdAt: { gte: new Date(Date.now() - 60000) },
              },
            });
            if (recentDuplicate) {
              throw new Error(
                `A payment with reference "${cleanRef}" of ${paymentAmount} was already recorded within the last minute.`
              );
            }

            // 5. Generate Collision-Proof Payment Voucher Number
            const voucherNo = await generateDateSequenceNo(
              'purchasePayment',
              'voucherNo',
              'PV',
              paymentDate,
              4,
              tx
            );

            // 6. Record payment with mandatory proof and reference
            const payment = await tx.purchasePayment.create({
              data: {
                purchaseId: body.purchaseId,
                voucherNo,
                amount: paymentAmount,
                paymentDate,
                paymentMethod,
                referenceNo: cleanRef,
                receiptUrl: proofUrl,
                notes: body.notes ? String(body.notes).trim() : null,
                recordedBy: user.name || user.email || 'Authorized Staff',
              },
            });

            const ledgerMetadata = JSON.stringify({
              proofUrl,
              referenceNo: cleanRef,
              paymentMethod,
              voucherNo,
              billNo: po.invoiceNo || po.poNo,
              recordedBy: user.name || user.email || 'Authorized Staff',
              timestamp: new Date().toISOString(),
            });

            const poCurrency = (po as any).currencyCode || 'INR';

            // Record Double-Entry Financial Ledger Entries atomically in a single batched query
            await tx.financialLedgerEntry.createMany({
              data: [
                {
                  entryNo: `JRN-PAY-AP-${voucherNo}`,
                  entryDate: paymentDate,
                  storeCode: po.storeCode || 'CENTRAL',
                  accountCategory: 'LIABILITY',
                  accountName: 'Vendor Accounts Payable (Settlement)',
                  debit: paymentAmount,
                  credit: 0,
                  amount: -paymentAmount,
                  refType: 'VENDOR_PAYMENT',
                  refId: payment.id,
                  refNo: voucherNo,
                  currencyCode: poCurrency,
                  entityName: po.vendor?.name || 'Vendor',
                  description: `Vendor bill payment for Bill #${po.invoiceNo || po.poNo} via ${paymentMethod} (Ref: ${cleanRef})`,
                  metadataJson: ledgerMetadata,
                  createdBy: user.name || user.email || 'Authorized Staff',
                },
                {
                  entryNo: `JRN-PAY-BANK-${voucherNo}`,
                  entryDate: paymentDate,
                  storeCode: po.storeCode || 'CENTRAL',
                  accountCategory: 'ASSET',
                  accountName: `Cash / Bank (${paymentMethod})`,
                  debit: 0,
                  credit: paymentAmount,
                  amount: -paymentAmount,
                  refType: 'VENDOR_PAYMENT',
                  refId: payment.id,
                  refNo: voucherNo,
                  currencyCode: poCurrency,
                  entityName: po.vendor?.name || 'Vendor',
                  description: `Bank disbursement for Vendor Bill #${po.invoiceNo || po.poNo} (Voucher ${voucherNo}, Ref: ${cleanRef})`,
                  metadataJson: ledgerMetadata,
                  createdBy: user.name || user.email || 'Authorized Staff',
                },
              ],
            });

            // 7. Update PO paidAmount and paymentStatus atomically
            const newTotalPaid = Math.round((currentPaid + paymentAmount) * 100) / 100;
            const remainingAfterPayment = Math.max(
              0,
              Math.round((totalCost - newTotalPaid - creditAmount) * 100) / 100
            );

            let newPaymentStatus: string;
            if (remainingAfterPayment <= 0.01) {
              newPaymentStatus = 'Paid';
            } else if (newTotalPaid > 0) {
              newPaymentStatus = 'Partial';
            } else {
              newPaymentStatus = 'Unpaid';
            }

            const updatedPO = await tx.purchaseOrder.update({
              where: { id: body.purchaseId },
              data: {
                paidAmount: newTotalPaid,
                paymentStatus: newPaymentStatus,
              },
            });

            // 8. Create immutable AuditLog entry
            await tx.auditLog.create({
              data: {
                module: 'Vendors / Payables',
                action: 'Record Vendor Payment',
                details: `Recorded ${paymentAmount.toFixed(2)} payment via ${paymentMethod} for Bill #${po.invoiceNo || po.poNo} (${po.vendor?.name || 'Vendor'}). Voucher: ${voucherNo}, Ref: ${cleanRef}, Proof: ${proofUrl}, Remaining: ${remainingAfterPayment.toFixed(2)}, Status: ${newPaymentStatus}`,
                userEmail: user.email || user.name,
                userRole: user.role,
                storeCode: po.storeCode || 'CENTRAL',
              },
            });

            // Atomically persist durable outbox event inside same transaction
            await persistOutboxEvent(
              getStoreChannel(po.storeCode),
              'PAYMENT_RECORDED',
              {
                purchaseId: body.purchaseId,
                paymentStatus: newPaymentStatus,
                vendorId: po.vendorId,
                storeCode: po.storeCode,
              },
              tx
            );

            return {
              payment,
              updatedPO,
              voucherNo,
              vendor: po.vendor,
              totalCost,
              creditAmount,
              totalPaid: newTotalPaid,
              remaining: remainingAfterPayment,
              newPaymentStatus,
            };
          },
          { maxWait: 15000, timeout: 45000 }
        );

        const poStore = result.updatedPO.storeCode || 'CENTRAL';
        // Broadcast realtime event for multi-tab sync
        await broadcastRealtimeEvent(
          'purchases',
          'PAYMENT_RECORDED',
          {
            purchaseId: body.purchaseId,
            paymentStatus: result.newPaymentStatus,
            vendorId: result.vendor?.id,
            storeCode: poStore,
          },
          { skipOutbox: true }
        );
        if (poStore) {
          await broadcastRealtimeEvent(
            getStoreChannel(poStore),
            'PAYMENT_RECORDED',
            {
              purchaseId: body.purchaseId,
              paymentStatus: result.newPaymentStatus,
              vendorId: result.vendor?.id,
              storeCode: poStore,
            },
            { skipOutbox: true }
          );
        }
        await broadcastRealtimeEvent('vendors', 'VENDOR_UPDATED', {
          id: result.vendor?.id,
          code: result.vendor?.code,
          action: 'payment_recorded',
          storeCode: poStore,
        });

        return {
          status: 201,
          data: {
            success: true,
            payment: result.payment,
            purchaseOrder: result.updatedPO,
            receiptVoucher: {
              voucherNo: result.voucherNo,
              paymentDate: result.payment.paymentDate,
              amount: paymentAmount,
              paymentMethod: result.payment.paymentMethod,
              referenceNo: result.payment.referenceNo,
              receiptUrl: result.payment.receiptUrl,
              notes: result.payment.notes,
              recordedBy: result.payment.recordedBy,
              vendorName: result.vendor?.name,
              vendorGstin: result.vendor?.gstin,
              vendorPhone: result.vendor?.phone,
              vendorAddress: result.vendor?.address,
              billNo: result.updatedPO.invoiceNo || result.updatedPO.poNo,
              poNo: result.updatedPO.poNo,
              totalCost: result.totalCost,
              totalPaid: result.totalPaid,
              remainingBalance: result.remaining,
              paymentStatus: result.newPaymentStatus,
            },
            remaining: result.remaining,
            paymentStatus: result.newPaymentStatus,
          },
        };
      }
    );
  } catch (error: any) {
    console.error('API /api/purchases/payments POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to record payment' },
      { status: 400 }
    );
  }
}
