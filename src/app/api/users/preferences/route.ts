import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authPipeline';
import { prisma } from '@/lib/db';

/**
 * GET /api/users/preferences
 * Returns the current authenticated user's UI preferences.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const pref = await (prisma as any).userUiPreference.findUnique({
      where: { userId: auth.user.id },
    });

    let preferences = {};
    if (pref?.preferencesJson) {
      try {
        preferences = JSON.parse(pref.preferencesJson);
      } catch {
        preferences = {};
      }
    }

    return NextResponse.json({
      success: true,
      preferences,
      version: pref?.version || 1,
    });
  } catch (error: any) {
    console.error('API /api/users/preferences GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user preferences' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users/preferences
 * Updates or creates UI preferences for the authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const newPrefs = body.preferences || {};

    // Get existing preferences to merge safely
    const existing = await (prisma as any).userUiPreference.findUnique({
      where: { userId: auth.user.id },
    });

    let mergedPrefs: Record<string, any> = {};
    if (existing?.preferencesJson) {
      try {
        mergedPrefs = JSON.parse(existing.preferencesJson);
      } catch {}
    }

    mergedPrefs = {
      ...mergedPrefs,
      ...newPrefs,
      updatedAt: new Date().toISOString(),
    };

    const saved = await (prisma as any).userUiPreference.upsert({
      where: { userId: auth.user.id },
      create: {
        userId: auth.user.id,
        preferencesJson: JSON.stringify(mergedPrefs),
        version: 1,
      },
      update: {
        preferencesJson: JSON.stringify(mergedPrefs),
        version: { increment: 1 },
      },
    });

    return NextResponse.json({
      success: true,
      preferences: mergedPrefs,
      version: saved.version,
    });
  } catch (error: any) {
    console.error('API /api/users/preferences POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user preferences' },
      { status: 500 }
    );
  }
}
