import nodemailer from 'nodemailer';

// Email templates
const emailTemplates = {
  verificationCode: (code: string, name: string) => ({
    subject: 'Verify Your Email - UAV2LoD1',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
            .card { background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 24px; }
            .logo { font-size: 24px; font-weight: 700; color: #1f2937; }
            .title { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 8px; }
            .text { color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
            .code-box { background-color: #f3f4f6; border: 2px solid #e5e7eb; border-radius: 6px; padding: 16px; text-align: center; margin: 24px 0; }
            .code { font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1f2937; font-family: 'Courier New', monospace; }
            .expiry { color: #9ca3af; font-size: 12px; text-align: center; margin-top: 12px; }
            .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo">UAV2LoD1</div>
              </div>
              <h2 class="title">Email Verification</h2>
              <p class="text">Hi ${name},</p>
              <p class="text">Thank you for registering with UAV2LoD1. To complete your account setup, please verify your email address using the code below:</p>
              <div class="code-box">
                <div class="code">${code}</div>
              </div>
              <p class="text">This code will expire in 10 minutes. If you didn't create this account, please disregard this email.</p>
              <div class="expiry">Code expires in 10 minutes</div>
              <div class="footer">
                <p>&copy; 2026 UAV2LoD1. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
  }),

  passwordReset: (resetLink: string, name: string) => ({
    subject: 'Reset Your Password - UAV2LoD1',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
            .card { background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 24px; }
            .logo { font-size: 24px; font-weight: 700; color: #1f2937; }
            .title { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 8px; }
            .text { color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
            .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0; }
            .button:hover { background-color: #1d4ed8; }
            .expiry { color: #9ca3af; font-size: 12px; text-align: center; margin-top: 12px; }
            .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
            .link { color: #2563eb; text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo">UAV2LoD1</div>
              </div>
              <h2 class="title">Reset Your Password</h2>
              <p class="text">Hi ${name},</p>
              <p class="text">We received a request to reset your password. Click the button below to create a new password:</p>
              <div style="text-align: center;">
                <a href="${resetLink}" class="button">Reset Password</a>
              </div>
              <p class="text">Or copy and paste this link in your browser:</p>
              <p class="text"><span class="link">${resetLink}</span></p>
              <p class="text">This link will expire in 1 hour. If you didn't request a password reset, please disregard this email.</p>
              <div class="expiry">Link expires in 1 hour</div>
              <div class="footer">
                <p>&copy; 2026 UAV2LoD1. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
  }),

  welcomeEmail: (name: string) => ({
    subject: 'Welcome to UAV2LoD1',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
            .card { background-color: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 24px; }
            .logo { font-size: 24px; font-weight: 700; color: #1f2937; }
            .title { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 8px; }
            .text { color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
            .feature-list { margin: 24px 0; }
            .feature { display: flex; margin-bottom: 12px; }
            .feature-icon { color: #10b981; font-weight: 700; margin-right: 12px; }
            .feature-text { color: #6b7280; font-size: 14px; }
            .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo">UAV2LoD1</div>
              </div>
              <h2 class="title">Welcome to UAV2LoD1!</h2>
              <p class="text">Hi ${name},</p>
              <p class="text">Welcome to UAV2LoD1 - Professional UAV Data Processing and LoD1 3D Model Generation. We're excited to have you on board!</p>
              <div class="feature-list">
                <div class="feature">
                  <div class="feature-icon">✓</div>
                  <div class="feature-text">Access professional drone mapping tools</div>
                </div>
                <div class="feature">
                  <div class="feature-icon">✓</div>
                  <div class="feature-text">Generate high-quality 3D models</div>
                </div>
                <div class="feature">
                  <div class="feature-icon">✓</div>
                  <div class="feature-text">Manage projects and GCP data</div>
                </div>
              </div>
              <p class="text">Get started by creating your first project. If you have any questions, feel free to reach out to our support team.</p>
              <div class="footer">
                <p>&copy; 2026 UAV2LoD1. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
  }),
};

// Initialize transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    console.warn('[Email] Missing EMAIL_USER or EMAIL_PASSWORD. Email functionality disabled.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  transporter.verify((error) => {
    if (error) {
      console.error('[email] SMTP connection failed:', error.message);
      console.error('[email] Ensure EMAIL_USER and EMAIL_PASSWORD are set correctly in .env.local');
    } else {
      console.log('[email] SMTP ready — sending from:', process.env.EMAIL_USER);
    }
  });

  return transporter;
}

export const emailService = {
  async sendVerificationCode(email: string, code: string, name: string) {
    const trans = getTransporter();
    if (!trans) {
      console.log(`[Email Dev] Verification code for ${email}: ${code}`);
      return { success: true, dev: true };
    }

    try {
      const template = emailTemplates.verificationCode(code, name);
      await trans.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'UAV2LoD1-ZW'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: template.subject,
        html: template.html,
      });

      console.log(`[Email] Verification code sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error('[Email] Failed to send verification code:', error);
      return { success: false, error: 'Failed to send verification email' };
    }
  },

  async sendPasswordReset(email: string, resetLink: string, name: string) {
    const trans = getTransporter();
    if (!trans) {
      console.log(`[Email Dev] Password reset link for ${email}: ${resetLink}`);
      return { success: true, dev: true };
    }

    try {
      const template = emailTemplates.passwordReset(resetLink, name);
      await trans.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'UAV2LoD1-ZW'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: template.subject,
        html: template.html,
      });

      console.log(`[Email] Password reset email sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error('[Email] Failed to send password reset email:', error);
      return { success: false, error: 'Failed to send password reset email' };
    }
  },

  async sendWelcomeEmail(email: string, name: string) {
    const trans = getTransporter();
    if (!trans) {
      console.log(`[Email Dev] Welcome email for ${email}`);
      return { success: true, dev: true };
    }

    try {
      const template = emailTemplates.welcomeEmail(name);
      await trans.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'UAV2LoD1-ZW'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: template.subject,
        html: template.html,
      });

      console.log(`[Email] Welcome email sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error('[Email] Failed to send welcome email:', error);
      return { success: false, error: 'Failed to send welcome email' };
    }
  },
};
