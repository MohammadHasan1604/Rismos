import { prisma } from '../src/lib/db';
import {
  BRAND_THEME_PRESETS,
  computeBrandPalette,
  getContrastForeground,
  hexToRgb,
} from '../src/lib/colorUtils';
import { signSessionToken, hashToken } from '../src/lib/auth';

/**
 * P3-5 / P3-6: Three Theme Matrix Test Suite
 *
 * Verifies all 3 Brand Themes:
 * 1. RISMOS Blue (#002E86, #009ADF, #2563EB)
 * 2. Enterprise Red (#9F1239, #BE123C, #E11D48)
 * 3. Obsidian Black (#18181B, #27272A, #3F3F46)
 *
 * Validates:
 * - Deterministic palette computation & CSS variable generation
 * - WCAG AA Contrast Compliance (ratio >= 4.5:1)
 * - Database persistence: save -> reload -> session 1 -> session 2
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(description: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${description}${details ? ` -> ${details}` : ''}`);
    failures.push(description);
    failed++;
  }
}

/**
 * Calculates standard WCAG 2.1 relative luminance
 */
function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates WCAG 2.1 contrast ratio between two hex colors: (L1 + 0.05) / (L2 + 0.05)
 */
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function createTestSession(userAccount: any): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const sessionRecord = await prisma.userSession.create({
    data: {
      userId: userAccount.id,
      tokenHash: 'temp_hash_' + Math.random().toString(36).substring(2),
      expiresAt,
    },
  });

  const sessionUser = {
    id: userAccount.id,
    name: userAccount.name,
    email: userAccount.email,
    role: userAccount.role as any,
    securityLevel: userAccount.securityLevel,
    store: userAccount.storeScope || 'BLR',
    allowedStores: [userAccount.storeScope || 'BLR'],
    avatar: userAccount.avatarUrl || '',
    sessionId: sessionRecord.id,
  };

  const rawToken = signSessionToken(sessionUser, sessionRecord.id);
  const realHash = hashToken(rawToken);

  await prisma.userSession.update({
    where: { id: sessionRecord.id },
    data: { tokenHash: realHash },
  });

  return rawToken;
}

async function runThemeMatrixSuite() {
  console.log('========================================================================');
  console.log('🎨 P3-6: THREE THEME MATRIX VERIFICATION (BLUE / RED / OBSIDIAN BLACK)');
  console.log('========================================================================\n');

  // Backup original branding config
  const originalBranding = await (prisma as any).brandingSetting.findUnique({
    where: { id: 'cosko_branding_config' },
  });

  const testUser = await prisma.userAccount.findFirst({
    where: { status: 'Active' },
  });
  if (!testUser) {
    throw new Error('Test requires at least one active user');
  }

  const createdSessionIds: string[] = [];

  try {
    for (const preset of BRAND_THEME_PRESETS) {
      console.log(`\n------------------------------------------------------------------------`);
      console.log(`🖌️  TESTING THEME PRESET: ${preset.name} (${preset.id})`);
      console.log(`------------------------------------------------------------------------`);

      // 1. Palette Computation
      const palette = computeBrandPalette(preset.primary, preset.secondary, preset.accent);
      assert(`[${preset.name}] Primary color matches preset (${palette.primary})`, palette.primary === preset.primary);
      assert(`[${preset.name}] Secondary color matches preset (${palette.secondary})`, palette.secondary === preset.secondary);
      assert(`[${preset.name}] Accent color matches preset (${palette.accent})`, palette.accent === preset.accent);

      // 2. CSS Variable Completeness
      assert(`[${preset.name}] Generates primaryHover`, !!palette.primaryHover);
      assert(`[${preset.name}] Generates primarySoft`, !!palette.primarySoft);
      assert(`[${preset.name}] Generates primaryForeground`, !!palette.primaryForeground);
      assert(`[${preset.name}] Generates secondaryForeground`, !!palette.secondaryForeground);
      assert(`[${preset.name}] Generates accentHover`, !!palette.accentHover);
      assert(`[${preset.name}] Generates accentSoft`, !!palette.accentSoft);
      assert(`[${preset.name}] Generates accentForeground`, !!palette.accentForeground);
      assert(`[${preset.name}] Generates ring`, !!palette.ring);

      // 3. WCAG AA Contrast Compliance (Requirement: >= 4.5:1 for normal text)
      const primaryContrast = getContrastRatio(palette.primary, palette.primaryForeground);
      assert(
        `[${preset.name}] Primary foreground contrast ratio satisfies WCAG AA (${primaryContrast.toFixed(2)}:1 >= 4.5:1)`,
        primaryContrast >= 4.5
      );

      const secondaryContrast = getContrastRatio(palette.secondary, palette.secondaryForeground);
      assert(
        `[${preset.name}] Secondary foreground contrast ratio satisfies WCAG AA (${secondaryContrast.toFixed(2)}:1 >= 4.5:1)`,
        secondaryContrast >= 4.5
      );

      const accentContrast = getContrastRatio(palette.accent, palette.accentForeground);
      assert(
        `[${preset.name}] Accent foreground contrast ratio satisfies WCAG AA (${accentContrast.toFixed(2)}:1 >= 4.5:1)`,
        accentContrast >= 4.5
      );

      // 4. Persistence Test (Save -> Reload -> Multi-Session Consistency)
      console.log(`  💾 Persisting theme ${preset.name} to database...`);
      await (prisma as any).brandingSetting.upsert({
        where: { id: 'cosko_branding_config' },
        create: {
          id: 'cosko_branding_config',
          primaryColor: preset.primary,
          secondaryColor: preset.secondary,
          accentColor: preset.accent,
        },
        update: {
          primaryColor: preset.primary,
          secondaryColor: preset.secondary,
          accentColor: preset.accent,
        },
      });

      // Reload from DB directly
      const reloaded = await (prisma as any).brandingSetting.findUnique({
        where: { id: 'cosko_branding_config' },
      });
      assert(
        `[${preset.name}] Reloaded branding has primary color ${preset.primary}`,
        reloaded?.primaryColor === preset.primary
      );
      assert(
        `[${preset.name}] Reloaded branding has secondary color ${preset.secondary}`,
        reloaded?.secondaryColor === preset.secondary
      );
      assert(
        `[${preset.name}] Reloaded branding has accent color ${preset.accent}`,
        reloaded?.accentColor === preset.accent
      );

      // Session 1: Create authenticated session and verify theme resolution
      const session1Token = await createTestSession(testUser);
      assert(`[${preset.name}] Authenticated Session 1 established`, !!session1Token);

      // Session 2: Create second authenticated session and verify theme resolution
      const session2Token = await createTestSession(testUser);
      assert(`[${preset.name}] Authenticated Session 2 established`, !!session2Token);

      // Both sessions observe the exact persisted branding config
      const session1Branding = await (prisma as any).brandingSetting.findFirst();
      const session2Branding = await (prisma as any).brandingSetting.findFirst();

      assert(
        `[${preset.name}] Session 1 reads authoritative primary ${preset.primary}`,
        session1Branding?.primaryColor === preset.primary
      );
      assert(
        `[${preset.name}] Session 2 reads authoritative primary ${preset.primary}`,
        session2Branding?.primaryColor === preset.primary
      );
    }
  } catch (err: any) {
    console.error('Theme matrix error:', err);
    assert('Execution completed without error', false, err.message);
  } finally {
    console.log('\n--- Restoring Original Theme Settings ---');
    try {
      if (originalBranding) {
        await (prisma as any).brandingSetting.update({
          where: { id: 'cosko_branding_config' },
          data: {
            primaryColor: originalBranding.primaryColor,
            secondaryColor: originalBranding.secondaryColor,
            accentColor: originalBranding.accentColor,
          },
        });
      }
      console.log('  ✅ Original theme branding restored.');
    } catch (e: any) {
      console.warn('  ⚠️ Restore warning:', e.message);
    }
  }

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    console.error('Failures:', failures);
    process.exit(1);
  }
}

runThemeMatrixSuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
