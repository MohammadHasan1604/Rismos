import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { getSignedDownloadUrl, deleteFromStorage, fileExistsInStorage } from '@/lib/objectStorage';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs/promises';

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
};

/**
 * GET /api/files/[...key]
 * Secure, authenticated file access endpoint for private storage files (payment proofs, expense receipts).
 * Verifies user authentication and database security permissions before serving or redirecting.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const { key: keyParts } = await params;
    if (!keyParts || keyParts.length === 0) {
      return NextResponse.json({ error: 'File key is required' }, { status: 400 });
    }

    // Safely reconstruct key segments, decoding any %2F or %20 without stripping slashes
    const rawSegments = keyParts
      .flatMap((p) => decodeURIComponent(p).split(/[/\\]+/))
      .map((s) => s.trim())
      .filter(Boolean);

    // Path traversal prevention
    if (rawSegments.some((p) => p === '..' || p.includes('..'))) {
      return NextResponse.json({ error: 'Forbidden: Path traversal detected' }, { status: 400 });
    }
    const fullKey = rawSegments.join('/');

    // 🔒 Database Authorization Check (Requirement 13)
    // Super Admin has global enterprise access; all other roles require database authorization.
    if (auth.user.role !== 'Super Admin') {
      const userStore = (auth.user.store || '').toUpperCase();
      const allowedStores = (auth.user.allowedStores || []).map((s: string) => s.toUpperCase());

      const fileAsset = await (prisma as any).fileAsset.findUnique({
        where: { objectKey: fullKey },
      });

      if (fileAsset) {
        if (fileAsset.privacyLevel !== 'PUBLIC') {
          // Check store scope
          if (
            fileAsset.storeCode &&
            fileAsset.storeCode.toUpperCase() !== userStore &&
            !allowedStores.includes(fileAsset.storeCode.toUpperCase())
          ) {
            return NextResponse.json(
              { error: 'Forbidden: Cannot access private files of another store' },
              { status: 403 }
            );
          }

          // Sales Managers cannot access expense receipts
          if (
            auth.user.role === 'Sales Manager' &&
            (fileAsset.relatedEntityType === 'Expense' || fullKey.startsWith('expense-receipts'))
          ) {
            return NextResponse.json(
              {
                error: 'Forbidden: Sales Managers do not have permission to view expense receipts',
              },
              { status: 403 }
            );
          }
        }
      } else {
        // If not in fileAsset, check if it's a private evidence category
        const isPrivateProof =
          fullKey.startsWith('payment-proofs/') || fullKey.startsWith('expense-receipts/');

        if (isPrivateProof) {
          if (fullKey.startsWith('expense-receipts/')) {
            if (auth.user.role === 'Sales Manager') {
              return NextResponse.json(
                {
                  error:
                    'Forbidden: Sales Managers do not have permission to view expense receipts',
                },
                { status: 403 }
              );
            }
            const expense = await prisma.expense.findFirst({
              where: {
                OR: [
                  { receiptUrl: { contains: fullKey } },
                  { receiptUrl: { contains: encodeURIComponent(fullKey) } },
                ],
              },
            });
            if (expense) {
              if (
                expense.storeCode.toUpperCase() !== userStore &&
                !allowedStores.includes(expense.storeCode.toUpperCase())
              ) {
                return NextResponse.json(
                  { error: 'Forbidden: Cannot access expense receipts of another store' },
                  { status: 403 }
                );
              }
            } else {
              return NextResponse.json(
                { error: 'Forbidden: File not authorized' },
                { status: 403 }
              );
            }
          } else if (fullKey.startsWith('payment-proofs/')) {
            const sale = await prisma.salesOrder.findFirst({
              where: {
                OR: [
                  { paymentProofUrl: { contains: fullKey } },
                  { paymentProofUrl: { contains: encodeURIComponent(fullKey) } },
                ],
              },
            });
            if (sale) {
              if (
                sale.storeCode.toUpperCase() !== userStore &&
                !allowedStores.includes(sale.storeCode.toUpperCase())
              ) {
                return NextResponse.json(
                  { error: 'Forbidden: Cannot access payment proofs of another store' },
                  { status: 403 }
                );
              }
            } else {
              const payment = await prisma.purchasePayment.findFirst({
                where: {
                  OR: [
                    { receiptUrl: { contains: fullKey } },
                    { receiptUrl: { contains: encodeURIComponent(fullKey) } },
                  ],
                },
                include: { purchase: true },
              });
              if (payment) {
                if (
                  payment.purchase.storeCode.toUpperCase() !== userStore &&
                  !allowedStores.includes(payment.purchase.storeCode.toUpperCase())
                ) {
                  return NextResponse.json(
                    { error: 'Forbidden: Cannot access payment proofs of another store' },
                    { status: 403 }
                  );
                }
              } else {
                return NextResponse.json(
                  { error: 'Forbidden: File not authorized' },
                  { status: 403 }
                );
              }
            }
          }
        }
      }
    }

    // 🔒 Verify file existence in storage
    const exists = await fileExistsInStorage(fullKey);
    if (!exists) {
      console.warn(`[Files API] Requested file does not exist in storage: ${fullKey}`);
      return NextResponse.json(
        { error: 'Payment proof file is missing from object storage', key: fullKey },
        { status: 404 }
      );
    }

    // Check if signed S3 URL is available
    const signedUrl = await getSignedDownloadUrl(fullKey, 3600);
    if (signedUrl && signedUrl.startsWith('http')) {
      // Redirect to temporary signed S3 URL
      return NextResponse.redirect(signedUrl, 307);
    }

    // Local filesystem fallback
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadsDir, ...rawSegments);

    // Security check: ensure path is within uploads directory
    if (!filePath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: 'Access denied: Invalid file path' }, { status: 403 });
    }

    try {
      const fileBuffer = await fs.readFile(filePath);
      const ext = fullKey.split('.').pop()?.toLowerCase() || '';
      const contentType = MIME_MAP[ext] || 'application/octet-stream';
      const filename = path.basename(filePath);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${filename}"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error: any) {
    console.error('[Files API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve file' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files/[...key]
 * Secure file deletion with strict retention rules:
 * Refuses deletion of financial evidence (payment-proofs, expense-receipts).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Only managers and admins can delete stored files
    if (auth.user.securityLevel < 80) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions to delete storage files' },
        { status: 403 }
      );
    }

    const { key: keyParts } = await params;
    if (!keyParts || keyParts.length === 0) {
      return NextResponse.json({ error: 'File key is required' }, { status: 400 });
    }

    const rawSegments = keyParts
      .flatMap((p) => decodeURIComponent(p).split(/[/\\]+/))
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawSegments.some((p) => p === '..' || p.includes('..'))) {
      return NextResponse.json({ error: 'Forbidden: Path traversal detected' }, { status: 400 });
    }
    const fullKey = rawSegments.join('/');

    // Retention enforcement: NEVER delete financial proof
    if (
      fullKey.startsWith('payment-proofs') ||
      fullKey.startsWith('expense-receipts') ||
      fullKey.includes('payment-proof') ||
      fullKey.includes('expense-receipt')
    ) {
      return NextResponse.json(
        { error: 'Retention Policy: Payment proofs and expense receipts cannot be deleted.' },
        { status: 403 }
      );
    }

    // 🔒 File Delete Ownership Enforcement (Requirement 14)
    if (auth.user.role !== 'Super Admin' && auth.user.securityLevel < 100) {
      // Branding and enterprise assets can only be deleted by Super Admin
      if (fullKey.startsWith('branding') || fullKey.includes('/branding/')) {
        return NextResponse.json(
          { error: 'Forbidden: Only Super Admin can delete enterprise branding assets' },
          { status: 403 }
        );
      }

      // Check FileAsset ownership in database
      const fileAsset = await (prisma as any).fileAsset.findUnique({
        where: { objectKey: fullKey },
      });

      if (fileAsset) {
        if (
          fileAsset.storeCode &&
          fileAsset.storeCode !== auth.user.store &&
          !auth.user.allowedStores.includes(fileAsset.storeCode)
        ) {
          return NextResponse.json(
            { error: 'Forbidden: Cannot delete files belonging to another store' },
            { status: 403 }
          );
        }

        if (
          fileAsset.privacyLevel === 'ENTERPRISE' ||
          fileAsset.relatedEntityType === 'Enterprise' ||
          fileAsset.relatedEntityType === 'Store'
        ) {
          return NextResponse.json(
            { error: 'Forbidden: Cannot delete enterprise assets' },
            { status: 403 }
          );
        }
      } else {
        // Fallback entity ownership resolution:
        // 1. Check if it's a catalog product image
        const productWithImg = await prisma.product.findFirst({
          where: { imageUrl: { contains: fullKey } },
          select: { id: true, name: true },
        });
        if (productWithImg) {
          return NextResponse.json(
            {
              error: 'Forbidden: Master catalog product images can only be deleted by Super Admin',
            },
            { status: 403 }
          );
        }

        // 2. Check if associated with another store's sale
        const saleWithFile = await prisma.salesOrder.findFirst({
          where: { paymentProofUrl: { contains: fullKey } },
          select: { storeCode: true },
        });
        if (saleWithFile) {
          if (
            saleWithFile.storeCode !== auth.user.store &&
            !auth.user.allowedStores.includes(saleWithFile.storeCode)
          ) {
            return NextResponse.json(
              { error: 'Forbidden: Cannot delete files belonging to another store' },
              { status: 403 }
            );
          }
        }

        // 3. For any unindexed object, non-super-admin cannot delete simply by knowing objectKey
        const userStore = auth.user.store || '';
        const keyMatchesStore =
          userStore &&
          (fullKey.toLowerCase().includes(userStore.toLowerCase()) ||
            fullKey.toUpperCase().includes(userStore.toUpperCase()));

        if (!keyMatchesStore) {
          return NextResponse.json(
            {
              error:
                'Forbidden: Cannot verify file ownership for deletion. Store Manager may only delete verified own-store assets.',
            },
            { status: 403 }
          );
        }
      }
    }

    const success = await deleteFromStorage(fullKey);
    if (!success) {
      return NextResponse.json(
        { error: 'File deletion failed or file does not exist' },
        { status: 404 }
      );
    }

    try {
      await (prisma as any).fileAsset.deleteMany({
        where: { objectKey: fullKey },
      });
    } catch {}

    return NextResponse.json({ success: true, message: `File ${fullKey} deleted successfully` });
  } catch (error: any) {
    console.error('[Files API] DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Deletion error' }, { status: 500 });
  }
}
