/**
 * Transactional Email Dispatcher for RISMOS Retail Platform
 * Supports Resend API (free tier & production) with resilient development fallback.
 *
 * Security:
 * - Never prints raw reset tokens or full credentials to server stdout in production.
 * - Masked email logging for audit trails.
 * - Standardized enterprise HTML email template with HTTPS enforcement.
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: 'password-reset' | 'notification' | 'security-alert';
  data: {
    userName?: string;
    resetUrl?: string;
    expiresIn?: string;
    invitedBy?: string;
    appName?: string;
    [key: string]: any;
  };
}

/**
 * Escapes unsafe HTML characters to prevent template injection and XSS in email clients.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, subject, template, data } = options;
  const rawAppName = data?.appName || 'RISMOS';
  const appName = escapeHtml(rawAppName);
  const safeSubject = escapeHtml(subject);
  const rawExpiresIn = data?.expiresIn || '15 minutes';
  const expiresIn = escapeHtml(rawExpiresIn);
  const safeUserName = escapeHtml(data?.userName || 'Team Member');
  const safeInvitedBy = escapeHtml(data?.invitedBy || '');
  const rawResetUrl = data?.resetUrl ? String(data.resetUrl) : '';
  // Ensure resetUrl is a valid http(s) URL
  const safeResetUrl = /^https?:\/\//i.test(rawResetUrl) ? escapeHtml(rawResetUrl) : '#';

  let htmlContent = '';

  if (template === 'password-reset') {
    const isInvitation = Boolean(data.invitedBy);
    const headingText = isInvitation ? 'Password Reset Invitation' : 'Password Reset Request';
    const bodyLead = isInvitation
      ? `An administrator (<strong>${safeInvitedBy}</strong>) has dispatched a secure password reset link for your ${appName} staff account.`
      : `We received a request to reset the password for your ${appName} staff account.`;

    htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #002E86; padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">${appName}</h1>
              <p style="margin: 4px 0 0 0; color: #cbd5e1; font-size: 12px; font-weight: 500;">Retail Operations & Store Management System</p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 700;">${headingText}</h2>
              <p style="margin: 0 0 16px 0; color: #334155; font-size: 14px; line-height: 1.6;">
                Hello <strong>${safeUserName}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
                ${bodyLead} Click the button below to set a new password:
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${safeResetUrl}" style="display: inline-block; background-color: #002E86; color: #ffffff; padding: 14px 32px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,46,134,0.25);">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Expiration Notice -->
              <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 24px 0;">
                <p style="margin: 0; color: #92400e; font-size: 12px; line-height: 1.5;">
                  ⏱️ <strong>Security Notice:</strong> This password reset link will expire in <strong>${expiresIn}</strong>. It can only be used once.
                </p>
              </div>

              <!-- Fallback Direct URL -->
              <p style="margin: 16px 0 0 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                If the button above does not work, copy and paste this link into your browser:<br>
                <a href="${safeResetUrl}" style="color: #002E86; word-break: break-all; font-size: 11px;">${safeResetUrl}</a>
              </p>

              <!-- Advisory -->
              <p style="margin: 20px 0 0 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                If you did not request this password recovery, please ignore this email or notify your store administrator. Your account remains completely secure.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                © ${new Date().getFullYear()} ${appName} Enterprise POS · Multi-Store Architecture
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  } else {
    htmlContent = `<div style="font-family: sans-serif; padding: 20px;"><p>${JSON.stringify(data)}</p></div>`;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Safe masked address for logs
  const emailParts = to.split('@');
  const local = emailParts[0];
  const domain = emailParts[1] || '';
  const maskedTo =
    local.length > 2
      ? `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}@${domain}`
      : `${local[0]}***@${domain}`;

  // 1. Resend API Dispatch (when RESEND_API_KEY is configured)
  if (process.env.RESEND_API_KEY) {
    try {
      const fromSender = process.env.EMAIL_FROM || `${appName} Security <onboarding@resend.dev>`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromSender,
          to: [to],
          subject,
          html: htmlContent,
        }),
      });

      const resData = await res.json().catch(() => null);

      if (res.ok && resData?.id) {
        console.info(
          `[EMAIL] Resend API: Email dispatched successfully to masked destination (ID: ${resData.id})`
        );
        return { success: true, messageId: resData.id };
      } else {
        const errMsg = resData?.message || res.statusText || 'Resend dispatch failed';
        console.error(`[EMAIL] Resend API returned error (status ${res.status}): ${errMsg}`);
        if (isProduction) {
          return { success: false, error: errMsg };
        }
      }
    } catch (apiErr: any) {
      const netErrMsg = apiErr?.message || 'Network connection to Resend failed';
      console.error(`[EMAIL] Resend network error: ${netErrMsg}`);
      if (isProduction) {
        return { success: false, error: netErrMsg };
      }
    }
  }

  // 2. Strict Production Guard: NEVER fake delivery if no provider sent it
  if (isProduction) {
    console.error(
      '[EMAIL] CRITICAL: No email provider configured (RESEND_API_KEY missing) in production environment.'
    );
    return {
      success: false,
      error: 'Email service is not configured on this server. Please contact administrator.',
    };
  }

  // 3. Development / Test Only Fallback: Explicitly marked, no raw tokens logged
  console.info(`[EMAIL] [DEVELOPMENT ONLY] Simulated dispatch for test/dev environment:`);
  console.info(`  To: ${maskedTo}`);
  console.info(`  Subject: ${subject}`);
  console.info(`  Template: ${template}`);
  console.info(`  Status: SIMULATED_DEV_FALLBACK`);

  return {
    success: true,
    messageId: `dev_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  };
}
