import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  hasPermission,
  createAuditLog,
  requireStoreScope,
  validatePhysicalStore,
} from '@/lib/authPipeline';
import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent, getStoreChannel } from '@/lib/realtime';
import { generateSafeSequenceNo } from '@/lib/sequenceUtils';
import { executeWithIdempotency } from '@/lib/idempotency';
import { validatePaymentMethod } from '@/lib/paymentValidator';
import { TaxService } from '@/lib/services/taxService';

/**
 * GET /api/expenses - Retrieve store/central expenses
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    // Strict RBAC: Sales Manager has no expense administration access
    if (user.role === 'Sales Manager' || user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Sales Managers do not have access to expenses.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const store = searchParams.get('store');

    const storeScope = requireStoreScope(user, store, {
      allowAllStoresForSuperAdmin: true,
    });
    if (!storeScope.authorized) {
      return NextResponse.json({ error: storeScope.error }, { status: storeScope.status });
    }

    const whereClause: any = {};
    if (!storeScope.isAllStores && storeScope.physicalStoreCode) {
      whereClause.storeCode = storeScope.physicalStoreCode;
    }

    const expenses = await (prisma as any).expense.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }, { date: 'desc' }],
      take: 100,
    });

    return NextResponse.json(
      { success: true, expenses },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('API /api/expenses GET error:', error);
    return NextResponse.json({ error: 'Failed to retrieve expenses' }, { status: 500 });
  }
}

/**
 * POST /api/expenses - Record a store or Central operational expense
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient security level to record expenses' },
        { status: 403 }
      );
    }

    const body = await req.json();

    const targetStore = body.storeCode || body.store || body.storeId || user.store;
    if (user.role !== 'Super Admin') {
      if (targetStore && targetStore !== user.store) {
        return NextResponse.json(
          {
            error: `Forbidden: As ${user.role}, you are restricted to store "${user.store}". Cannot record expenses for store "${targetStore}".`,
          },
          { status: 403 }
        );
      }
    } else {
      const storeVal = await validatePhysicalStore(targetStore);
      if (!storeVal.valid) {
        return NextResponse.json({ error: storeVal.error }, { status: 400 });
      }
    }

    if (
      !body.category ||
      body.amount === undefined ||
      body.amount === null ||
      body.amount === '' ||
      Number(body.amount) <= 0 ||
      isNaN(Number(body.amount))
    ) {
      return NextResponse.json(
        { error: 'Category and a positive Amount are required' },
        { status: 400 }
      );
    }

    // MANDATORY PROOF & REFERENCE VALIDATION (ROOT FIX)
    const proofUrl = body.receiptUrl || body.proofUrl;
    if (!proofUrl || !String(proofUrl).trim()) {
      return NextResponse.json(
        {
          error:
            'Payment proof is mandatory! Please upload an expense receipt, bill, or payment screenshot.',
        },
        { status: 400 }
      );
    }

    const cleanRef =
      (body.referenceNo && String(body.referenceNo).trim()) ||
      (body.payRef && String(body.payRef).trim()) ||
      `EXP-REF-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const expenseDate = body.date ? new Date(body.date) : new Date();
    const paymentValidation = validatePaymentMethod(body.paymentMethod || 'Other');
    if (!paymentValidation.valid) {
      return NextResponse.json({ error: paymentValidation.error }, { status: 400 });
    }
    const paymentMethod = paymentValidation.normalized!;

    const expenseStore =
      user.role === 'Super Admin' ? body.storeCode || body.store || 'CENTRAL' : user.store;
    const expenseAmt = Number(body.amount);
    const isCentral =
      expenseStore === 'CENTRAL' ||
      body.category.toLowerCase().includes('freight') ||
      (body.description && body.description.toLowerCase().includes('central'));

    const customKey =
      body.idempotencyKey ||
      req.headers.get('x-idempotency-key') ||
      `exp_${expenseStore}_${body.category}_${cleanRef}_${expenseAmt}`;

    return await executeWithIdempotency(
      req,
      {
        action: 'CREATE_EXPENSE',
        key: customKey,
        userId: user.id,
        storeCode: expenseStore,
        extractEntityId: (d) => d?.expense?.id || d?.expense?.expenseNo,
      },
      async () => {
        const result = await prisma.$transaction(
          async (tx: any) => {
            const expenseNo =
              body.expenseNo ||
              (await generateSafeSequenceNo('expense', 'expenseNo', 'EXP-2026-', 4, tx));

            const expense = await tx.expense.create({
              data: {
                expenseNo,
                category: body.category,
                amount: expenseAmt,
                storeCode: expenseStore,
                description: body.description || '',
                paymentMethod,
                referenceNo: cleanRef,
                receiptUrl: proofUrl,
                approvedBy: user.name,
                recordedBy: user.email || user.name,
                date: expenseDate,
              },
            });

            const expLedgerMeta = JSON.stringify({
              proofUrl,
              referenceNo: cleanRef,
              paymentMethod,
              expenseNo,
              category: body.category,
              recordedBy: user.name || user.email,
              timestamp: new Date().toISOString(),
            });

            const entrySuffix = Date.now().toString().slice(-4);
            const taxContext = await TaxService.resolveTaxContext(expenseStore);
            const expCurrency = taxContext.currencyCode || 'INR';

            await tx.financialLedgerEntry.createMany({
              data: [
                {
                  entryNo: `JRN-EXP-${expenseNo}-${entrySuffix}`,
                  entryDate: expenseDate,
                  storeCode: expenseStore,
                  accountCategory: isCentral ? 'CENTRAL_EXPENSE' : 'OPERATING_EXPENSE',
                  accountName: `Operating Expense: ${body.category}`,
                  debit: expenseAmt,
                  credit: 0,
                  amount: expenseAmt,
                  refType: 'EXPENSE',
                  refId: expense.id,
                  refNo: expenseNo,
                  currencyCode: expCurrency,
                  description: `${body.category} Expense: ${body.description || 'General Operational Expense'} (Ref: ${cleanRef})`,
                  metadataJson: expLedgerMeta,
                  createdBy: user.name,
                },
                {
                  entryNo: `JRN-EXP-BANK-${expenseNo}-${entrySuffix}`,
                  entryDate: expenseDate,
                  storeCode: expenseStore,
                  accountCategory: 'ASSET',
                  accountName: `Cash / Bank (${paymentMethod})`,
                  debit: 0,
                  credit: expenseAmt,
                  amount: -expenseAmt,
                  refType: 'EXPENSE',
                  refId: expense.id,
                  refNo: expenseNo,
                  currencyCode: expCurrency,
                  description: `Disbursement for ${body.category} (Voucher ${expenseNo}, Ref: ${cleanRef})`,
                  metadataJson: expLedgerMeta,
                  createdBy: user.name,
                },
              ],
            });

            await tx.auditLog.create({
              data: {
                module: 'Expenses',
                action: 'Create Expense',
                details: `Recorded ₹${expenseAmt.toFixed(2)} for ${body.category} (${expenseStore}) via ${paymentMethod} (Ref: ${cleanRef}, Proof: ${proofUrl})`,
                userEmail: user.email || user.name,
                userRole: user.role,
                storeCode: expenseStore,
              },
            });

            await tx.realtimeOutbox.create({
              data: {
                channel: getStoreChannel(expenseStore),
                event: 'EXPENSE_CREATED',
                payload: JSON.stringify({
                  expenseNo,
                  category: body.category,
                  storeCode: expenseStore,
                  amount: expenseAmt,
                }),
                storeCode: expenseStore,
              },
            });

            return { expense, expenseNo };
          },
          { maxWait: 15000, timeout: 45000 }
        );

        const expPayload = {
          expenseNo: result.expenseNo,
          category: body.category,
          storeCode: expenseStore,
        };
        await broadcastRealtimeEvent('expenses', 'EXPENSE_CREATED', expPayload, {
          skipOutbox: true,
        });
        if (expenseStore) {
          await broadcastRealtimeEvent(
            getStoreChannel(expenseStore),
            'EXPENSE_CREATED',
            expPayload,
            { skipOutbox: true }
          );
        }

        return {
          status: 201,
          data: {
            success: true,
            expense: {
              ...result.expense,
              amount: Number(result.expense.amount),
              referenceNo: cleanRef,
              receiptUrl: proofUrl,
            },
          },
        };
      }
    );
  } catch (error: any) {
    console.error('API /api/expenses POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to record expense' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/expenses - Update an existing expense record in MySQL atomically
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    if (user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient security level to edit expenses' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const id = body.id || body.expenseId;

    if (!id && !body.expenseNo) {
      return NextResponse.json(
        { error: 'Expense ID or Reference No is required' },
        { status: 400 }
      );
    }

    const target = id
      ? await (prisma as any).expense.findUnique({ where: { id } })
      : await (prisma as any).expense.findUnique({ where: { expenseNo: body.expenseNo } });

    if (!target) {
      return NextResponse.json({ error: 'Expense record not found' }, { status: 404 });
    }

    if (user.role !== 'Super Admin' && target.storeCode !== user.store) {
      return NextResponse.json(
        {
          error:
            'Forbidden: You do not have permission to modify an expense belonging to another store.',
        },
        { status: 403 }
      );
    }

    const updateData: any = {};
    if (body.category) updateData.category = body.category;
    if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
      const parsedAmt = Number(body.amount);
      if (isNaN(parsedAmt) || parsedAmt <= 0) {
        return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
      }
      updateData.amount = parsedAmt;
    }
    if (body.description !== undefined) updateData.description = body.description;
    if (body.paymentMethod) {
      const paymentValidation = validatePaymentMethod(body.paymentMethod);
      if (!paymentValidation.valid) {
        return NextResponse.json({ error: paymentValidation.error }, { status: 400 });
      }
      updateData.paymentMethod = paymentValidation.normalized!;
    }
    if (body.receiptUrl !== undefined || body.proofUrl !== undefined) {
      const newProof = body.receiptUrl || body.proofUrl;
      if (!newProof || !String(newProof).trim()) {
        return NextResponse.json(
          {
            error:
              'Payment proof is strictly mandatory and cannot be removed from an expense record.',
          },
          { status: 400 }
        );
      }
      updateData.receiptUrl = newProof;
    }
    if (body.storeCode || body.store) updateData.storeCode = body.storeCode || body.store;
    if (body.date) updateData.date = new Date(body.date);

    const updated = await prisma.$transaction(
      async (tx: any) => {
        const exp = await tx.expense.update({
          where: { id: target.id },
          data: updateData,
        });

        // Synchronize associated financial ledger entries if amount or category changed
        if (updateData.amount !== undefined) {
          const newAmt = Number(updateData.amount);
          await tx.financialLedgerEntry.updateMany({
            where: { refType: 'EXPENSE', refNo: target.expenseNo, debit: { gt: 0 } },
            data: { debit: newAmt, amount: newAmt },
          });
          await tx.financialLedgerEntry.updateMany({
            where: { refType: 'EXPENSE', refNo: target.expenseNo, credit: { gt: 0 } },
            data: { credit: newAmt, amount: -newAmt },
          });
        }

        return exp;
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const updateExpPayload = {
      id: updated.id,
      expenseNo: updated.expenseNo,
      storeCode: updated.storeCode,
      action: 'updated',
    };
    await broadcastRealtimeEvent('expenses', 'EXPENSE_UPDATED', updateExpPayload);
    if (updated.storeCode) {
      await broadcastRealtimeEvent(
        getStoreChannel(updated.storeCode),
        'EXPENSE_UPDATED',
        updateExpPayload
      );
    }

    return NextResponse.json({
      success: true,
      expense: {
        ...updated,
        amount: Number(updated.amount),
      },
    });
  } catch (error: any) {
    console.error('API /api/expenses PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update expense' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/expenses - Delete Approval Workflow
 * Super Admin: direct delete with ledger cleanup. Store Manager: creates pending delete request.
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
    const reason = searchParams.get('reason') || '';

    if (!id) {
      return NextResponse.json({ error: 'Expense ID is required' }, { status: 400 });
    }

    const target = await (prisma as any).expense.findFirst({
      where: { OR: [{ id }, { expenseNo: id }] },
    });

    if (!target) {
      return NextResponse.json({ success: true, message: 'Expense already removed' });
    }

    if (user.role !== 'Super Admin' && target.storeCode !== user.store) {
      return NextResponse.json(
        {
          error:
            'Forbidden: You do not have permission to delete an expense belonging to another store.',
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
        entityType: 'EXPENSE',
        entityId: target.id,
        reason: reason.trim(),
      });
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      return NextResponse.json({
        success: true,
        mode: 'pending_approval',
        deleteRequest: result.deleteRequest,
        message: `Delete request for expense "${target.expenseNo}" submitted for Super Admin approval.`,
      });
    }

    // ─── SUPER ADMIN: Direct delete with ledger cleanup ─────────────────────
    await prisma.$transaction(
      async (tx: any) => {
        await tx.financialLedgerEntry.deleteMany({
          where: {
            refType: 'EXPENSE',
            refNo: target.expenseNo,
          },
        });
        await tx.expense.delete({ where: { id: target.id } });
        await tx.auditLog.create({
          data: {
            module: 'EXPENSES',
            action: `DELETED: Expense "${target.expenseNo}" (₹${target.amount})`,
            details: JSON.stringify({ expenseId: target.id, beforeState: target }),
            userEmail: user.email,
            userRole: user.role,
            storeCode: target.storeCode || user.store || 'CENTRAL',
          },
        });
      },
      { maxWait: 15000, timeout: 45000 }
    );

    const delExpPayload = {
      id: target.id,
      expenseNo: target.expenseNo,
      storeCode: target.storeCode,
      action: 'deleted',
    };
    await broadcastRealtimeEvent('expenses', 'EXPENSE_UPDATED', delExpPayload);
    if (target.storeCode) {
      await broadcastRealtimeEvent(
        getStoreChannel(target.storeCode),
        'EXPENSE_UPDATED',
        delExpPayload
      );
    }

    return NextResponse.json({ success: true, message: 'Expense record deleted' });
  } catch (error: any) {
    console.error('API /api/expenses DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete expense' },
      { status: 500 }
    );
  }
}
