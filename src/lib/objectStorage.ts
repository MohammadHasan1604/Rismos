/**
 * COSKO S3-Compatible Object Storage Service
 *
 * Production-grade file storage using AWS S3 / Cloudflare R2 / MinIO.
 * Falls back to local filesystem ONLY in development when S3 is not configured.
 *
 * Supports:
 * - Product images
 * - Payment proofs (private, signed URLs)
 * - Expense receipts
 * - Sale attachments
 * - Branding files
 *
 * All credentials are server-only environment variables (never exposed to client).
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';

// ─── S3 / Cloudflare R2 Configuration (server-only) ──────────────────────────
const S3_ENDPOINT =
  process.env.STORAGE_ENDPOINT ||
  process.env.R2_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : '');
const S3_REGION = process.env.STORAGE_REGION || process.env.R2_REGION || 'auto';
const S3_BUCKET = process.env.STORAGE_BUCKET || process.env.R2_BUCKET_NAME || 'cosko-assets';
const S3_ACCESS_KEY =
  process.env.STORAGE_ACCESS_KEY ||
  process.env.R2_ACCESS_KEY_ID ||
  process.env.AWS_ACCESS_KEY_ID ||
  '';
const S3_SECRET_KEY =
  process.env.STORAGE_SECRET_KEY ||
  process.env.R2_SECRET_ACCESS_KEY ||
  process.env.AWS_SECRET_ACCESS_KEY ||
  '';

const isS3Configured = !!(S3_ENDPOINT && S3_ACCESS_KEY && S3_SECRET_KEY);

let s3Client: S3Client | null = null;
if (isS3Configured) {
  s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

// ─── MIME / Magic Bytes Validation ───────────────────────────────────────────
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const ALLOWED_DOCUMENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/jpg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB for documents/proofs

export type StorageBucket =
  | 'product-images'
  | 'payment-proofs'
  | 'expense-receipts'
  | 'sale-attachments'
  | 'branding';

// Private buckets use signed URLs; public buckets get direct URLs
const PRIVATE_BUCKETS = new Set<StorageBucket>(['payment-proofs', 'expense-receipts']);

export interface UploadResult {
  success: boolean;
  url: string;
  key: string;
  size: number;
  mimeType: string;
  isPrivate: boolean;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate file content against MIME type and magic bytes.
 */
export function validateFile(
  buffer: Buffer,
  mimeType: string,
  size: number,
  category: StorageBucket
): ValidationResult {
  const isImage = ALLOWED_IMAGE_TYPES.has(mimeType);
  const isDocument = ALLOWED_DOCUMENT_TYPES.has(mimeType);

  if (!isImage && !isDocument) {
    return {
      valid: false,
      error: `Invalid file format (${mimeType}). Allowed: JPEG, PNG, WebP, PDF.`,
    };
  }

  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
  if (size > maxSize) {
    return {
      valid: false,
      error: `File exceeds ${maxSize / (1024 * 1024)}MB limit (${(size / 1024 / 1024).toFixed(2)}MB).`,
    };
  }

  if (size < 10) {
    return { valid: false, error: 'File is too small to be valid.' };
  }

  // Magic bytes validation
  const expectedMagic = MAGIC_BYTES[mimeType];
  if (expectedMagic && buffer.length >= 4) {
    const matchesAny = expectedMagic.some((magic) => magic.every((byte, i) => buffer[i] === byte));
    if (!matchesAny) {
      return { valid: false, error: 'File content does not match declared type. Upload rejected.' };
    }
  }

  return { valid: true };
}

/**
 * Generate a cryptographically safe unique object key.
 */
export function generateObjectKey(
  bucket: StorageBucket,
  originalFilename: string,
  mimeType?: string
): string {
  const ext = getExtension(originalFilename, mimeType);
  const uuid = crypto.randomUUID();
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  return `${bucket}/${datePrefix}/${uuid}.${ext}`;
}

function getExtension(filename: string, mimeType?: string): string {
  const extFromName = filename
    .split('.')
    .pop()
    ?.replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  if (extFromName && ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(extFromName)) {
    return extFromName;
  }
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return (mimeType && mimeMap[mimeType]) || 'bin';
}

/**
 * Upload a file to S3/R2 object storage (or local fallback in dev).
 */
export async function uploadToStorage(
  bucket: StorageBucket,
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  uploaderName?: string
): Promise<UploadResult> {
  const key = generateObjectKey(bucket, originalFilename, mimeType);
  const isPrivate = PRIVATE_BUCKETS.has(bucket);

  // ─── S3/R2 Upload ─────────────────────────────────────────────────────────
  if (s3Client) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ContentDisposition: isPrivate ? 'attachment' : 'inline',
          Metadata: {
            'original-filename': originalFilename.slice(0, 200),
            uploader: (uploaderName || 'system').slice(0, 100),
            'uploaded-at': new Date().toISOString(),
          },
        })
      );

      const publicBaseUrl =
        process.env.R2_PUBLIC_URL ||
        process.env.NEXT_PUBLIC_R2_URL ||
        process.env.STORAGE_PUBLIC_URL;

      const safeKeyPath = key.split('/').map(encodeURIComponent).join('/');

      const url = isPrivate
        ? `/api/files/${safeKeyPath}`
        : publicBaseUrl
          ? `${publicBaseUrl.replace(/\/$/, '')}/${key}`
          : `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;

      return { success: true, url, key, size: buffer.length, mimeType, isPrivate };
    } catch (err: any) {
      console.error('[Storage] S3 upload failed:', err.message);
      // In production/Netlify, S3/R2 failure MUST produce an explicit failure, never write to ephemeral disk
      if (process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true') {
        return {
          success: false,
          url: '',
          key,
          size: 0,
          mimeType,
          isPrivate,
          error: `Production object storage upload failed: ${err.message}`,
        };
      }
      // Fall through to local fallback in development only
    }
  }

  // In production or Netlify, reject fallback if S3/R2 client is not configured
  if (process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true') {
    return {
      success: false,
      url: '',
      key,
      size: 0,
      mimeType,
      isPrivate,
      error: 'Production object storage (S3/R2) is required but not configured',
    };
  }

  // ─── Local Filesystem Fallback (development only) ──────────────────────────
  try {
    const localPath = path.join(process.cwd(), 'public', 'uploads', key);
    const localDir = path.dirname(localPath);
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(localPath, buffer);

    const safeKeyPath = key.split('/').map(encodeURIComponent).join('/');

    const url = isPrivate ? `/api/files/${safeKeyPath}` : `/uploads/${safeKeyPath}`;
    return { success: true, url, key, size: buffer.length, mimeType, isPrivate };
  } catch (localErr: any) {
    return { success: false, url: '', key, size: 0, mimeType, isPrivate, error: localErr.message };
  }
}

/**
 * Delete a file from S3/R2 (with retention rules).
 * Financial evidence (payment-proofs, expense-receipts) is NEVER deleted.
 */
export async function deleteFromStorage(key: string): Promise<boolean> {
  // ─── Retention Rule: Never delete financial evidence ───────────────────────
  if (key.startsWith('payment-proofs/') || key.startsWith('expense-receipts/')) {
    console.info(`[Storage] Retention policy: Refusing to delete financial evidence: ${key}`);
    return false;
  }

  if (s3Client) {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        })
      );
      return true;
    } catch (err: any) {
      console.error('[Storage] S3 delete failed:', err.message);
      return false;
    }
  }

  // Local fallback
  try {
    const localPath = path.join(process.cwd(), 'public', 'uploads', key);
    await fs.unlink(localPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Replace a file in storage: upload new, delete old (respecting retention).
 */
export async function replaceInStorage(
  oldKey: string | null,
  bucket: StorageBucket,
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  uploaderName?: string
): Promise<UploadResult> {
  const result = await uploadToStorage(bucket, buffer, originalFilename, mimeType, uploaderName);

  if (result.success && oldKey && oldKey !== result.key) {
    await deleteFromStorage(oldKey);
  }

  return result;
}

/**
 * Generate a signed URL for private file access (payment proofs, receipts).
 * URL expires after the specified duration.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  if (!s3Client) {
    // In dev mode without S3, return local path
    const safeKeyPath = key.split('/').map(encodeURIComponent).join('/');
    return `/uploads/${safeKeyPath}`;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  } catch (err: any) {
    console.error('[Storage] Failed to generate signed URL:', err.message);
    return null;
  }
}

/**
 * Check if a file exists in storage.
 */
export async function fileExistsInStorage(key: string): Promise<boolean> {
  if (!s3Client) {
    try {
      await fs.access(path.join(process.cwd(), 'public', 'uploads', key));
      return true;
    } catch {
      return false;
    }
  }

  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if S3 storage is configured.
 */
export function isObjectStorageConfigured(): boolean {
  return isS3Configured;
}

/**
 * Ensures an image is stored in persistent object storage rather than a Data URL.
 * If a Data URL is passed, decodes, validates magic bytes, uploads to object storage,
 * and returns the persistent storage URL/key.
 */
export async function ensureStoredImage(
  imageInput: string | null | undefined,
  bucket: StorageBucket = 'product-images',
  uploaderName?: string
): Promise<string | null> {
  if (!imageInput) return null;
  if (!imageInput.startsWith('data:image/')) {
    return imageInput;
  }

  try {
    const match = imageInput.match(/^data:([a-zA-Z0-9\/+-]+);base64,(.+)$/);
    if (!match) return null;

    const mimeType = match[1].toLowerCase();
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const validation = validateFile(buffer, mimeType, buffer.length, bucket);
    if (!validation.valid) {
      console.warn(`[Storage] Rejected invalid data-url image: ${validation.error}`);
      return null;
    }

    const upload = await uploadToStorage(bucket, buffer, 'product-image', mimeType, uploaderName);
    if (upload.success) {
      return upload.url;
    }
    return null;
  } catch (err: any) {
    console.error('[Storage] Failed to convert data-url to stored image:', err.message);
    return null;
  }
}
