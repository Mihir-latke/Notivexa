const nodemailer = require('nodemailer');

// In-memory store for recent OTP previews in test mode
const recentOtpStore = new Map();

/**
 * Creates SMTP transport based on environment variables (Outlook, Yahoo, Gmail, Brevo, or custom SMTP).
 */
function getTransporter() {
  const user = (process.env.SMTP_USER || 'notivexahelp@gmail.com').trim();
  const pass = (process.env.SMTP_PASS || 'yqxjksspbyhazujy').trim();
  const service = (process.env.SMTP_SERVICE || '').trim().toLowerCase();
  let host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!user || !pass) {
    return null;
  }

  // Pre-configured well-known services
  if (service) {
    return nodemailer.createTransport({
      service,
      auth: { user, pass }
    });
  }

  // Optimize Gmail with built-in service definition
  if (host === 'smtp.gmail.com' || user.endsWith('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }

  // Auto-detect host from email domain if host is not explicitly set
  if (!host) {
    if (user.endsWith('@outlook.com') || user.endsWith('@hotmail.com') || user.endsWith('@live.com')) {
      host = 'smtp.office365.com';
    } else if (user.endsWith('@yahoo.com')) {
      host = 'smtp.mail.yahoo.com';
    } else if (user.endsWith('@gmail.com')) {
      host = 'smtp.gmail.com';
    }
  }

  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  return null;
}

/**
 * Checks whether SMTP is configured with valid user and pass.
 */
function isSmtpConfigured() {
  const user = (process.env.SMTP_USER || 'notivexahelp@gmail.com').trim();
  const pass = (process.env.SMTP_PASS || 'yqxjksspbyhazujy').trim();
  return Boolean(user && pass);
}

/**
 * Dispatches an email directly to the recipient's inbox.
 */
async function sendEmail({ to, subject, text, html, otp, type = 'general' }) {
  const normEmail = (to || '').toLowerCase().trim();

  if (otp) {
    recentOtpStore.set(normEmail, { otp, type, timestamp: Date.now() });
  }

  // Fast-path in Jest automated test suite
  if (process.env.NODE_ENV === 'test') {
    return { success: true, simulated: true, otp };
  }

  const transporter = getTransporter();

  if (!transporter) {
    console.error(`[Email Error] Cannot send email to ${normEmail}: SMTP credentials (SMTP_USER / SMTP_PASS) are missing in backend/.env!`);
    return {
      success: false,
      error: 'SMTP email server is not configured in backend/.env. Please configure SMTP_USER and SMTP_PASS to deliver verification codes.'
    };
  }

  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || `"Notivexa Security" <${process.env.SMTP_USER}>`;

  try {
    const info = await transporter.sendMail({
      from,
      to: normEmail,
      subject,
      text,
      html
    });

    console.log(`[Email] Dispatched ${type} OTP directly to inbox: ${normEmail}. MessageId: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (err) {
    console.error(`[Email Error] Failed delivering to ${normEmail}:`, err.message);
    return {
      success: false,
      error: `Failed to deliver email to ${normEmail}: ${err.message}. Please verify your SMTP credentials.`
    };
  }
}

/**
 * Sends a 6-digit OTP for Forgot Password recovery.
 */
async function sendPasswordResetOtp(email, name, otp) {
  const subject = `Your Notivexa Password Reset Code: ${otp}`;
  const text = `Hello ${name || 'Student'},\n\nYour 6-digit password reset code for Notivexa is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request a password reset, please ignore this email or contact support.\n\nBest regards,\nNotivexa Security Team`;
  
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 12px; background: linear-gradient(135deg, #4F46E5, #7C3AED); font-size: 24px; color: #ffffff;">📖</div>
        <h2 style="margin: 10px 0 4px; color: #0F172A; font-size: 22px;">Reset Your Password</h2>
        <p style="margin: 0; color: #64748B; font-size: 14px;">Notivexa Academic Security</p>
      </div>
      <div style="background: #F8FAFC; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px; color: #334155; font-size: 14px;">Hello <strong>${name || 'Student'}</strong>,</p>
        <p style="margin: 0 0 14px; color: #475569; font-size: 14px; line-height: 1.5;">We received a request to reset your password. Use the verification code below to set a new password:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 12px 28px; background: #EEF2FF; color: #4F46E5; border-radius: 8px; border: 1px dashed #6366F1;">${otp}</span>
        </div>
        <p style="margin: 0; color: #64748B; font-size: 12.5px; text-align: center;">⏱️ This code will expire in <strong>10 minutes</strong>.</p>
      </div>
      <p style="margin: 0 0 12px; color: #94A3B8; font-size: 12px; line-height: 1.5;">If you did not request this code, you can safely ignore this email. Your password will remain unchanged.</p>
      <div style="border-top: 1px solid #E2E8F0; padding-top: 14px; font-size: 11px; color: #94A3B8; text-align: center;">
        &copy; ${new Date().getFullYear()} Notivexa. Intelligent Learning Platform.
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, text, html, otp, type: 'password_reset' });
}

/**
 * Sends a 6-digit OTP for Two-Factor Authentication (MFA).
 */
async function sendMfaOtp(email, name, otp) {
  const subject = `Your Notivexa Login Verification Code: ${otp}`;
  const text = `Hello ${name || 'Student'},\n\nYour 2FA login verification code for Notivexa is: ${otp}\n\nThis code will expire in 5 minutes.\n\nBest regards,\nNotivexa Security Team`;
  
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 12px; background: linear-gradient(135deg, #10B981, #059669); font-size: 24px; color: #ffffff;">🛡️</div>
        <h2 style="margin: 10px 0 4px; color: #0F172A; font-size: 22px;">Two-Factor Authentication</h2>
        <p style="margin: 0; color: #64748B; font-size: 14px;">Confirm Your Sign-In Request</p>
      </div>
      <div style="background: #F8FAFC; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px; color: #334155; font-size: 14px;">Hello <strong>${name || 'Student'}</strong>,</p>
        <p style="margin: 0 0 14px; color: #475569; font-size: 14px; line-height: 1.5;">A login attempt was initiated for your Notivexa account. Enter this 6-digit security code to finish logging in:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 12px 28px; background: #ECFDF5; color: #059669; border-radius: 8px; border: 1px dashed #10B981;">${otp}</span>
        </div>
        <p style="margin: 0; color: #64748B; font-size: 12.5px; text-align: center;">⏱️ This security code is valid for <strong>5 minutes</strong>.</p>
      </div>
      <p style="margin: 0 0 12px; color: #94A3B8; font-size: 12px; line-height: 1.5;">If this wasn't you, someone may know your password. We recommend changing your password immediately.</p>
      <div style="border-top: 1px solid #E2E8F0; padding-top: 14px; font-size: 11px; color: #94A3B8; text-align: center;">
        &copy; ${new Date().getFullYear()} Notivexa. Intelligent Learning Platform.
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, text, html, otp, type: 'mfa_login' });
}

module.exports = {
  sendEmail,
  sendPasswordResetOtp,
  sendMfaOtp,
  isSmtpConfigured,
  getRecentOtp: (email) => recentOtpStore.get((email || '').toLowerCase().trim())
};
