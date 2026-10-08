/**
 * COSKO Phase 2 — Delete Approval Workflow Service
 *
 * Store Managers (Level 80) must never directly delete permitted store-owned records.
 * Instead, a DeleteRequest is created and routed to Super Admin for approval.
 *
 * Super Admin (Level 100) can still delete directly OR review pending requests.
 */

import { prisma } from '@/lib/db';
import { broadcastRealtimeEvent } from '@/lib/realtime';
import type { SessionUser } from '@/lib/auth';
import type { AuthenticatedUser } from '@/lib/authPipeline';

export type ApprovalUser = SessionUser | AuthenticatedUser;

// ─── Entity Type Constants ───────────────────────────────────────────────────
export const DELETABLE_ENTITY_TYPES = [
  'INVENTORY',
  'CUSTOMER',
  'VENDOR',
  'CATEGORY',
  'PURCHASE',
  'EXPENSE',
  'REPAIR',
  'BRAND',
  'UNIT',
  'CATEGORY_TYPE',
  'PAYMENT_METHOD',
] as const;

export type DeletableEntityType = (typeof DELETABLE_ENTITY_TYPES)[number];

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface DeleteRequestInput {
  entityType: DeletableEntityType;
  entityId: string;
  reason: string;
}

export interface DependencyAnalysis {
  salesCount: number;
  purchaseCount: number;
  repairCount: number;
  inventoryCount: number;
  ledgerCount: number;
  hasFinancialHistory: boolean;
  totalSpent: number;
  outstandingBalance: number;
  creditBalance: number;
  description: string;
}

// ─── Entity Lookup & Snapshot ────────────────────────────────────────────────
async function fetchEntitySnapshot(
  entityType: DeletableEntityType,
  entityId: string
): Promise<{ name: string; snapshot: any } | null> {
  try {
    switch (entityType) {
      case 'INVENTORY': {
        const p = await (prisma as any).product.findUnique({
          where: { id: entityId },
          include: { inventoryItems: true },
        });
        return p ? { name: p.name, snapshot: p } : null;
      }
      case 'CUSTOMER': {
        const c = await (prisma as any).customer.findUnique({ where: { id: entityId } });
        return c ? { name: c.name, snapshot: c } : null;
      }
      case 'VENDOR': {
        const v = await (prisma as any).vendor.findUnique({ where: { id: entityId } });
        return v ? { name: v.name, snapshot: v } : null;
      }
      case 'CATEGORY': {
        const cat = await (prisma as any).category.findUnique({ where: { id: entityId } });
        return cat ? { name: cat.name, snapshot: cat } : null;
      }
      case 'PURCHASE': {
        const po = await (prisma as any).purchaseOrder.findUnique({
          where: { id: entityId },
          include: { items: true, payments: true },
        });
        return po ? { name: po.poNo, snapshot: po } : null;
      }
      case 'EXPENSE': {
        const ex = await (prisma as any).expense.findUnique({ where: { id: entityId } });
        return ex ? { name: ex.expenseNo, snapshot: ex } : null;
      }
      case 'REPAIR': {
        const r = await (prisma as any).repairEnquiry.findUnique({ where: { id: entityId } });
        return r ? { name: r.ticketNo, snapshot: r } : null;
      }
      case 'BRAND': {
        const b = await (prisma as any).brand.findUnique({ where: { id: entityId } });
        return b ? { name: b.name, snapshot: b } : null;
      }
      case 'UNIT': {
        const u = await (prisma as any).unit.findUnique({ where: { id: entityId } });
        return u ? { name: u.name, snapshot: u } : null;
      }
      case 'CATEGORY_TYPE': {
        const ct = await (prisma as any).categoryType.findUnique({ where: { id: entityId } });
        return ct ? { name: ct.name, snapshot: ct } : null;
      }
      case 'PAYMENT_METHOD': {
        const pm = await (prisma as any).paymentMethod.findUnique({ where: { id: entityId } });
        return pm ? { name: pm.name, snapshot: pm } : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── Dependency & Financial Impact Analysis ──────────────────────────────────
async function analyzeDependencies(
  entityType: DeletableEntityType,
  entityId: string,
  snapshot: any
): Promise<DependencyAnalysis> {
  const result: DependencyAnalysis = {
    salesCount: 0,
    purchaseCount: 0,
    repairCount: 0,
    inventoryCount: 0,
    ledgerCount: 0,
    hasFinancialHistory: false,
    totalSpent: 0,
    outstandingBalance: 0,
    creditBalance: 0,
    description: 'No dependencies found. Safe to delete.',
  };

  try {
    switch (entityType) {
      case 'INVENTORY': {
        const [salesItems, poItems, ledger, transfers] = await Promise.all([
          (prisma as any).salesOrderItem.count({ where: { productId: entityId } }),
          (prisma as any).purchaseOrderItem.count({ where: { productId: entityId } }),
          (prisma as any).inventoryLedger.count({ where: { productId: entityId } }),
          (prisma as any).stockTransferItem.count({ where: { productId: entityId } }),
        ]);
        result.salesCount = salesItems;
        result.purchaseCount = poItems;
        result.ledgerCount = ledger;
        result.inventoryCount = transfers;
        result.hasFinancialHistory = salesItems > 0 || poItems > 0;
        const parts: string[] = [];
        if (salesItems > 0) parts.push(`${salesItems} sale line items`);
        if (poItems > 0) parts.push(`${poItems} purchase order items`);
        if (ledger > 0) parts.push(`${ledger} ledger entries`);
        if (transfers > 0) parts.push(`${transfers} transfer items`);
        result.description =
          parts.length > 0
            ? `References: ${parts.join(', ')}. Will be archived.`
            : 'No references. Can be permanently deleted.';
        break;
      }
      case 'CUSTOMER': {
        const [sales, repairs] = await Promise.all([
          (prisma as any).salesOrder.count({ where: { customerId: entityId } }),
          (prisma as any).repairEnquiry.count({ where: { customerId: entityId } }),
        ]);
        result.salesCount = sales;
        result.repairCount = repairs;
        result.totalSpent = Number(snapshot?.totalSpent || 0);
        result.creditBalance = Number(snapshot?.creditBalance || 0);
        result.hasFinancialHistory = sales > 0 || result.totalSpent > 0 || result.creditBalance > 0;
        const parts: string[] = [];
        if (sales > 0) parts.push(`${sales} sales orders`);
        if (repairs > 0) parts.push(`${repairs} repair enquiries`);
        if (result.totalSpent > 0) parts.push(`${result.totalSpent} total spent`);
        if (result.creditBalance > 0) parts.push(`${result.creditBalance} credit balance`);
        result.description =
          parts.length > 0
            ? `History: ${parts.join(', ')}. Will be archived.`
            : 'No history. Can be permanently deleted.';
        break;
      }
      case 'VENDOR': {
        const purchases = await (prisma as any).purchaseOrder.findMany({
          where: { vendorId: entityId, status: { notIn: ['Cancelled', 'Archived'] } },
          select: { totalCost: true, paidAmount: true, creditAmount: true },
        });
        result.purchaseCount = purchases.length;
        let totalBilled = 0,
          totalPaid = 0;
        for (const po of purchases) {
          totalBilled += Number(po.totalCost || 0);
          totalPaid += Number(po.paidAmount || 0) + Number(po.creditAmount || 0);
        }
        result.outstandingBalance = Math.max(0, totalBilled - totalPaid);
        result.hasFinancialHistory = purchases.length > 0 || result.outstandingBalance > 0;
        const parts: string[] = [];
        if (purchases.length > 0) parts.push(`${purchases.length} purchase orders`);
        if (result.outstandingBalance > 0)
          parts.push(`${result.outstandingBalance.toFixed(2)} outstanding`);
        result.description =
          parts.length > 0
            ? `Vendor has: ${parts.join(', ')}. Will be archived.`
            : 'No orders. Can be permanently deleted.';
        break;
      }
      case 'CATEGORY': {
        const [childCount, productCount] = await Promise.all([
          (prisma as any).category.count({ where: { parentCategoryId: entityId } }),
          (prisma as any).product.count({ where: { category: snapshot?.name || '' } }),
        ]);
        result.inventoryCount = productCount;
        result.hasFinancialHistory = productCount > 0;
        const parts: string[] = [];
        if (childCount > 0) parts.push(`${childCount} child categories`);
        if (productCount > 0) parts.push(`${productCount} products`);
        result.description =
          parts.length > 0
            ? `References: ${parts.join(', ')}. Will be archived.`
            : 'No references. Can be permanently deleted.';
        break;
      }
      case 'PURCHASE': {
        const [payments, grns] = await Promise.all([
          (prisma as any).purchasePayment.count({ where: { purchaseId: entityId } }),
          (prisma as any).goodsReceivedNote.count({ where: { purchaseId: entityId } }),
        ]);
        result.purchaseCount = payments;
        result.outstandingBalance = Math.max(
          0,
          Number(snapshot?.totalCost || 0) - Number(snapshot?.paidAmount || 0)
        );
        result.hasFinancialHistory = payments > 0 || grns > 0;
        const parts: string[] = [];
        if (payments > 0) parts.push(`${payments} payments recorded`);
        if (grns > 0) parts.push(`${grns} GRNs received`);
        if (result.outstandingBalance > 0)
          parts.push(`${result.outstandingBalance.toFixed(2)} outstanding`);
        result.description =
          parts.length > 0
            ? `PO has: ${parts.join(', ')}. Will be archived.`
            : 'No payments/GRNs. Can be permanently deleted.';
        break;
      }
      default: {
        result.description = 'No critical dependencies. Can be deleted.';
        break;
      }
    }
  } catch (err: any) {
    result.description = `Could not fully analyze dependencies: ${err.message}`;
  }

  return result;
}

// ─── Create Delete Request ───────────────────────────────────────────────────
export async function createDeleteRequest(
  user: ApprovalUser,
  input: DeleteRequestInput
): Promise<{ success: boolean; deleteRequest?: any; error?: string }> {
  if (!input.reason || input.reason.trim().length < 3) {
    return { success: false, error: 'A reason for deletion is required (minimum 3 characters).' };
  }

  if (!DELETABLE_ENTITY_TYPES.includes(input.entityType)) {
    return { success: false, error: `Invalid entity type: ${input.entityType}` };
  }

  // Fetch entity snapshot
  const entityData = await fetchEntitySnapshot(input.entityType, input.entityId);
  if (!entityData) {
    return {
      success: false,
      error: `Entity not found: ${input.entityType} with ID ${input.entityId}`,
    };
  }

  // 🔒 Authoritative Store Ownership Verification (Requirement 17)
  if (user.securityLevel < 100) {
    const callerStore = user.store && user.store !== 'All Stores' ? user.store : '';
    if (!callerStore) {
      return { success: false, error: 'Forbidden: No operational store assigned to caller.' };
    }

    if (
      ['CATEGORY', 'BRAND', 'UNIT', 'CATEGORY_TYPE', 'PAYMENT_METHOD'].includes(input.entityType)
    ) {
      return {
        success: false,
        error: `Forbidden: Managing global ${input.entityType.toLowerCase()} records is restricted to Super Admin only.`,
      };
    }

    if (input.entityType === 'INVENTORY') {
      const inv = await (prisma as any).inventory.findFirst({
        where: { productId: input.entityId, storeCode: callerStore },
      });
      if (!inv) {
        return {
          success: false,
          error: `Forbidden: Product is not stocked in your store (${callerStore}).`,
        };
      }
    } else if (input.entityType === 'CUSTOMER') {
      const [profile, sale] = await Promise.all([
        (prisma as any).customerStoreProfile.findFirst({
          where: { customerId: input.entityId, storeCode: callerStore },
        }),
        (prisma as any).salesOrder.findFirst({
          where: { customerId: input.entityId, storeCode: callerStore },
          select: { id: true },
        }),
      ]);
      if (!profile && !sale) {
        return {
          success: false,
          error: `Forbidden: Customer is not associated with your store (${callerStore}).`,
        };
      }
    } else if (input.entityType === 'VENDOR') {
      const vendor = await (prisma as any).vendor.findUnique({
        where: { id: input.entityId },
        select: { storeCode: true },
      });
      if (!vendor || vendor.storeCode !== callerStore) {
        return {
          success: false,
          error: `Forbidden: Vendor does not belong to your store (${callerStore}).`,
        };
      }
    } else if (input.entityType === 'PURCHASE') {
      const po = await (prisma as any).purchaseOrder.findUnique({
        where: { id: input.entityId },
        select: { storeCode: true },
      });
      if (!po || po.storeCode !== callerStore) {
        return {
          success: false,
          error: `Forbidden: Purchase order does not belong to your store (${callerStore}).`,
        };
      }
    } else if (input.entityType === 'EXPENSE') {
      const exp = await (prisma as any).expense.findUnique({
        where: { id: input.entityId },
        select: { storeCode: true },
      });
      if (!exp || exp.storeCode !== callerStore) {
        return {
          success: false,
          error: `Forbidden: Expense does not belong to your store (${callerStore}).`,
        };
      }
    } else if (input.entityType === 'REPAIR') {
      const rep = await (prisma as any).repairEnquiry.findUnique({
        where: { id: input.entityId },
        select: { storeCode: true },
      });
      if (!rep || rep.storeCode !== callerStore) {
        return {
          success: false,
          error: `Forbidden: Repair does not belong to your store (${callerStore}).`,
        };
      }
    }
  }

  // Check for existing pending request (prevent duplicates)
  const existingPending = await (prisma as any).deleteRequest.findFirst({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      status: 'PENDING',
    },
  });

  if (existingPending) {
    return {
      success: false,
      error: `A pending delete request already exists for this record (submitted ${new Date(existingPending.createdAt).toLocaleDateString()}).`,
    };
  }

  // Analyze dependencies
  const deps = await analyzeDependencies(input.entityType, input.entityId, entityData.snapshot);

  // Create the request
  const deleteRequest = await (prisma as any).deleteRequest.create({
    data: {
      requesterId: user.id,
      requesterRole: user.role,
      requesterStore: user.store || 'CENTRAL',
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: entityData.name,
      reason: input.reason.trim(),
      beforeStateJson: JSON.stringify(entityData.snapshot, null, 0),
      dependencyImpact: JSON.stringify(deps),
      financialImpact: JSON.stringify({
        totalSpent: deps.totalSpent,
        outstandingBalance: deps.outstandingBalance,
        creditBalance: deps.creditBalance,
        hasFinancialHistory: deps.hasFinancialHistory,
      }),
      status: 'PENDING',
    },
  });

  // Notify all Super Admins
  const superAdmins = await (prisma as any).userAccount.findMany({
    where: { securityLevel: { gte: 100 }, status: 'Active' },
    select: { id: true },
  });

  if (superAdmins.length > 0) {
    await (prisma as any).notification.createMany({
      data: superAdmins.map((sa: any) => ({
        userId: sa.id,
        title: `Delete Request: ${entityData.name}`,
        message: `${user.name} (${user.role}, ${user.store}) requested deletion of ${input.entityType.toLowerCase()} "${entityData.name}". Reason: ${input.reason}`,
        type: 'warning',
        category: 'DELETE_REQUEST',
        relatedEntityType: input.entityType,
        relatedEntityId: input.entityId,
        actionUrl: '/delete-requests',
      })),
    });

    await broadcastRealtimeEvent('notifications', 'DELETE_REQUEST_CREATED', {
      requestId: deleteRequest.id,
      entityType: input.entityType,
      entityName: entityData.name,
      requesterName: user.name,
    });
  }

  return { success: true, deleteRequest };
}

// ─── Approve Delete Request ──────────────────────────────────────────────────
export async function approveDeleteRequest(
  adminUser: ApprovalUser,
  requestId: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (adminUser.securityLevel < 100) {
    return { success: false, error: 'Only Super Admin can approve delete requests.' };
  }

  const request = await (prisma as any).deleteRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    return { success: false, error: 'Delete request not found.' };
  }
  if (request.status !== 'PENDING') {
    return {
      success: false,
      error: `This request has already been ${request.status.toLowerCase()}.`,
    };
  }

  // Re-validate entity still exists
  const entityData = await fetchEntitySnapshot(
    request.entityType as DeletableEntityType,
    request.entityId
  );
  if (!entityData) {
    // Entity already deleted by other means
    await (prisma as any).deleteRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        executionMode: 'ALREADY_DELETED',
        reviewedBy: adminUser.name || adminUser.email,
        reviewedAt: new Date(),
      },
    });
    return {
      success: true,
      result: { mode: 'ALREADY_DELETED', message: 'Entity was already deleted.' },
    };
  }

  // Re-analyze dependencies to decide archive vs hard-delete
  const deps = await analyzeDependencies(
    request.entityType as DeletableEntityType,
    request.entityId,
    entityData.snapshot
  );
  const shouldArchive =
    deps.hasFinancialHistory ||
    deps.salesCount > 0 ||
    deps.purchaseCount > 0 ||
    deps.repairCount > 0;
  const executionMode = shouldArchive ? 'ARCHIVE' : 'HARD_DELETE';

  // Execute deletion in transaction
  const result = await prisma.$transaction(async (tx: any) => {
    let deletionResult: any;

    if (shouldArchive) {
      deletionResult = await executeArchive(
        tx,
        request.entityType as DeletableEntityType,
        request.entityId
      );
    } else {
      deletionResult = await executeHardDelete(
        tx,
        request.entityType as DeletableEntityType,
        request.entityId
      );
    }

    // Create audit log
    const auditLog = await tx.auditLog.create({
      data: {
        module: 'DELETE_APPROVAL',
        action: `${executionMode}: ${request.entityType} "${request.entityName}"`,
        details: JSON.stringify({
          requestId: request.id,
          entityType: request.entityType,
          entityId: request.entityId,
          entityName: request.entityName,
          requestedBy: request.requesterRole,
          reason: request.reason,
          executionMode,
          approvedBy: adminUser.name,
        }),
        userEmail: adminUser.email,
        userRole: adminUser.role,
        storeCode: request.requesterStore,
      },
    });

    // Update request status
    await tx.deleteRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        executionMode,
        reviewedBy: adminUser.name || adminUser.email,
        reviewedAt: new Date(),
        auditLogId: auditLog.id,
      },
    });

    // Notify requester
    await tx.notification.create({
      data: {
        userId: request.requesterId,
        title: `Delete Approved: ${request.entityName}`,
        message: `Your request to delete ${request.entityType.toLowerCase()} "${request.entityName}" has been approved by ${adminUser.name}. Action: ${executionMode === 'ARCHIVE' ? 'Record archived' : 'Record permanently deleted'}.`,
        type: 'success',
        category: 'DELETE_APPROVED',
        relatedEntityType: request.entityType,
        relatedEntityId: request.entityId,
      },
    });

    return { mode: executionMode, ...deletionResult };
  });

  await broadcastRealtimeEvent('notifications', 'DELETE_REQUEST_APPROVED', {
    requestId: request.id,
    entityType: request.entityType,
    entityName: request.entityName,
  });
  await broadcastRealtimeEvent(request.entityType.toLowerCase(), `${request.entityType}_DELETED`, {
    id: request.entityId,
    mode: executionMode,
  });

  return { success: true, result };
}

// ─── Reject Delete Request ───────────────────────────────────────────────────
export async function rejectDeleteRequest(
  adminUser: ApprovalUser,
  requestId: string,
  rejectionReason: string
): Promise<{ success: boolean; error?: string }> {
  if (adminUser.securityLevel < 100) {
    return { success: false, error: 'Only Super Admin can reject delete requests.' };
  }

  if (!rejectionReason || rejectionReason.trim().length < 3) {
    return { success: false, error: 'A rejection reason is required.' };
  }

  const request = await (prisma as any).deleteRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    return { success: false, error: 'Delete request not found.' };
  }
  if (request.status !== 'PENDING') {
    return {
      success: false,
      error: `This request has already been ${request.status.toLowerCase()}.`,
    };
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.deleteRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedBy: adminUser.name || adminUser.email,
        reviewedAt: new Date(),
        rejectionReason: rejectionReason.trim(),
      },
    });

    await tx.notification.create({
      data: {
        userId: request.requesterId,
        title: `Delete Rejected: ${request.entityName}`,
        message: `Your request to delete ${request.entityType.toLowerCase()} "${request.entityName}" was rejected by ${adminUser.name}. Reason: ${rejectionReason}`,
        type: 'danger',
        category: 'DELETE_REJECTED',
        relatedEntityType: request.entityType,
        relatedEntityId: request.entityId,
      },
    });

    await tx.auditLog.create({
      data: {
        module: 'DELETE_APPROVAL',
        action: `REJECTED: ${request.entityType} "${request.entityName}"`,
        details: JSON.stringify({
          requestId: request.id,
          entityType: request.entityType,
          entityId: request.entityId,
          reason: rejectionReason,
          rejectedBy: adminUser.name,
        }),
        userEmail: adminUser.email,
        userRole: adminUser.role,
        storeCode: request.requesterStore,
      },
    });
  });

  await broadcastRealtimeEvent('notifications', 'DELETE_REQUEST_REJECTED', {
    requestId: request.id,
    entityType: request.entityType,
    entityName: request.entityName,
  });

  return { success: true };
}

// ─── Archive Helpers ─────────────────────────────────────────────────────────
async function executeArchive(
  tx: any,
  entityType: DeletableEntityType,
  entityId: string
): Promise<any> {
  switch (entityType) {
    case 'INVENTORY':
      return tx.product.update({ where: { id: entityId }, data: { status: 'archived' } });
    case 'CUSTOMER':
      return tx.customer.update({ where: { id: entityId }, data: { status: 'Archived' } });
    case 'VENDOR':
      return tx.vendor.update({ where: { id: entityId }, data: { status: 'Archived' } });
    case 'CATEGORY':
      return tx.category.update({ where: { id: entityId }, data: { status: 'Archived' } });
    case 'PURCHASE':
      return tx.purchaseOrder.update({ where: { id: entityId }, data: { status: 'Archived' } });
    case 'EXPENSE':
      // Expenses don't have status, archive by creating audit evidence
      return {
        archived: true,
        id: entityId,
        note: 'Expense records are immutable financial evidence; marked via audit log.',
      };
    case 'REPAIR':
      return tx.repairEnquiry.update({ where: { id: entityId }, data: { status: 'Cancelled' } });
    case 'BRAND':
      return tx.brand.update({ where: { id: entityId }, data: { status: 'Inactive' } });
    case 'UNIT':
      return tx.unit.update({ where: { id: entityId }, data: { status: 'Inactive' } });
    case 'CATEGORY_TYPE':
      // CategoryTypes don't have status — soft-archive by prefixing name
      return tx.categoryType.update({
        where: { id: entityId },
        data: {
          name: `[ARCHIVED] ${(await tx.categoryType.findUnique({ where: { id: entityId } }))?.name}`,
        },
      });
    case 'PAYMENT_METHOD':
      return tx.paymentMethod.update({ where: { id: entityId }, data: { status: 'Inactive' } });
    default:
      throw new Error(`Unknown entity type for archive: ${entityType}`);
  }
}

async function executeHardDelete(
  tx: any,
  entityType: DeletableEntityType,
  entityId: string
): Promise<any> {
  switch (entityType) {
    case 'INVENTORY': {
      await tx.inventoryLedger.deleteMany({ where: { productId: entityId } });
      await tx.inventory.deleteMany({ where: { productId: entityId } });
      return tx.product.delete({ where: { id: entityId } });
    }
    case 'CUSTOMER': {
      await tx.customerExternalLink.deleteMany({ where: { coskoCustomerId: entityId } });
      return tx.customer.delete({ where: { id: entityId } });
    }
    case 'VENDOR':
      return tx.vendor.delete({ where: { id: entityId } });
    case 'CATEGORY':
      return tx.category.delete({ where: { id: entityId } });
    case 'PURCHASE': {
      await tx.purchasePayment.deleteMany({ where: { purchaseId: entityId } });
      await tx.goodsReceivedNote.deleteMany({ where: { purchaseId: entityId } });
      await tx.purchaseOrderItem.deleteMany({ where: { poId: entityId } });
      return tx.purchaseOrder.delete({ where: { id: entityId } });
    }
    case 'EXPENSE':
      return tx.expense.delete({ where: { id: entityId } });
    case 'REPAIR':
      return tx.repairEnquiry.delete({ where: { id: entityId } });
    case 'BRAND':
      return tx.brand.delete({ where: { id: entityId } });
    case 'UNIT':
      return tx.unit.delete({ where: { id: entityId } });
    case 'CATEGORY_TYPE':
      return tx.categoryType.delete({ where: { id: entityId } });
    case 'PAYMENT_METHOD':
      return tx.paymentMethod.delete({ where: { id: entityId } });
    default:
      throw new Error(`Unknown entity type for delete: ${entityType}`);
  }
}
