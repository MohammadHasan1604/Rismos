import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { DEFAULT_BRANDING, getCachedBranding, setCachedBranding } from '@/lib/branding';

/**
 * GET /api/settings/branding — PUBLIC endpoint
 * Returns ONLY non-sensitive branding information needed for the login page and unauthenticated shells.
 * No GSTIN, no security settings, no UPI, no bank details, no internal tax config.
 */

export async function GET(req: NextRequest) {
  try {
    const forceFresh = req.nextUrl.searchParams.get('fresh') === 'true';
    if (!forceFresh) {
      const cached = getCachedBranding();
      if (cached) {
        return NextResponse.json(
          { success: true, branding: cached },
          { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
        );
      }
    }

    const branding = await (prisma as any).brandingSetting.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const publicBranding = {
      success: true,
      branding: {
        appName: branding?.appName || DEFAULT_BRANDING.appName,
        tagline: branding?.tagline || DEFAULT_BRANDING.tagline,
        supportEmail: branding?.supportEmail || DEFAULT_BRANDING.supportEmail,
        supportPhone: branding?.supportPhone || DEFAULT_BRANDING.supportPhone,
        logoUrl: branding?.logoUrl || null,
        logoDarkUrl: branding?.logoDarkUrl || null,
        appIconUrl: branding?.appIconUrl || null,
        faviconUrl: branding?.faviconUrl || null,
        primaryColor: branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
        secondaryColor: branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
        accentColor: branding?.accentColor || DEFAULT_BRANDING.accentColor,
        businessName: branding?.businessName || DEFAULT_BRANDING.businessName,
      },
    };

    setCachedBranding(publicBranding.branding as any);

    return NextResponse.json(publicBranding, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error: any) {
    console.error('API /api/settings/branding GET error:', error);
    return NextResponse.json(
      {
        success: true,
        branding: {
          appName: DEFAULT_BRANDING.appName,
          tagline: DEFAULT_BRANDING.tagline,
          supportEmail: DEFAULT_BRANDING.supportEmail,
          supportPhone: DEFAULT_BRANDING.supportPhone,
          logoUrl: null,
          logoDarkUrl: null,
          appIconUrl: null,
          faviconUrl: null,
          primaryColor: DEFAULT_BRANDING.primaryColor,
          secondaryColor: DEFAULT_BRANDING.secondaryColor,
          accentColor: DEFAULT_BRANDING.accentColor,
          businessName: DEFAULT_BRANDING.businessName,
        },
      },
      { status: 200 }
    );
  }
}
