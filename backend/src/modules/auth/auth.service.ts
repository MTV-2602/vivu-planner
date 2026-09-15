import nodemailer from 'nodemailer';

interface OtpEntry {
  otp: string;
  expiresAt: number;
  attempts: number;
}

// Lưu trữ mã OTP trong bộ nhớ tạm thời (10 phút)
const otpStore = new Map<string, OtpEntry>();

function getMailTransporter() {
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').trim().replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error('Chức năng gửi mail chưa được cấu hình: Thiếu GMAIL_USER hoặc GMAIL_APP_PASSWORD trong biến môi trường.');
  }

  return {
    transporter: nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    }),
    senderEmail: user,
  };
}

export function generateAndStoreOtp(email: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 phút

  otpStore.set(normalizedEmail, {
    otp,
    expiresAt,
    attempts: 0,
  });

  return otp;
}

export function verifyOtp(email: string, otp: string): { valid: boolean; message?: string } {
  const normalizedEmail = email.toLowerCase().trim();
  const entry = otpStore.get(normalizedEmail);

  if (!entry) {
    return { valid: false, message: 'Yêu cầu mã xác nhận không tồn tại hoặc đã hết hạn.' };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalizedEmail);
    return { valid: false, message: 'Mã xác nhận đã hết hạn. Vui lòng yêu cầu mã mới.' };
  }

  if (entry.attempts >= 5) {
    otpStore.delete(normalizedEmail);
    return { valid: false, message: 'Bạn đã nhập sai quá số lần cho phép. Vui lòng gửi lại yêu cầu.' };
  }

  if (entry.otp !== otp.trim()) {
    entry.attempts += 1;
    return { valid: false, message: `Mã xác nhận không chính xác. Còn lại ${5 - entry.attempts} lần thử.` };
  }

  return { valid: true };
}

export function clearOtp(email: string) {
  otpStore.delete(email.toLowerCase().trim());
}

export async function sendPasswordResetOtpEmail(email: string, otp: string): Promise<void> {
  const { transporter, senderEmail } = getMailTransporter();

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(135deg, #1B3A2D 0%, #0F241C 100%); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">ViVu Planner</h1>
        <p style="color: #6EE7B7; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Nền tảng Lên Lịch Trình Du Lịch Thông Minh</p>
      </div>
      <div style="padding: 32px 24px;">
        <h2 style="color: #1e293b; font-size: 18px; margin-top: 0; font-weight: 700;">Yêu cầu Đặt lại Mật khẩu</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 12px 0 24px 0;">
          Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>${email}</strong>. Vui lòng sử dụng mã xác nhận (OTP) bên dưới để hoàn tất:
        </p>
        <div style="background-color: #F0FDF4; border: 2px dashed #10B981; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #065F46; font-family: monospace;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 16px 0;">
          ⏱️ Mã xác nhận có hiệu lực trong vòng <strong>10 phút</strong>. Vì lý do an toàn, tuyệt đối không chia sẻ mã này cho bất kỳ ai.
        </p>
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          Nếu bạn không thực hiện yêu cầu này, bạn có thể yên tâm bỏ qua email này. Mật khẩu của bạn vẫn được giữ an toàn.
        </p>
      </div>
      <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #f1f5f9;">
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">© 2026 ViVu Planner. Mọi quyền được bảo lưu.</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"ViVu Planner Support" <${senderEmail}>`,
    to: email,
    subject: `[ViVu Planner] Mã xác nhận đặt lại mật khẩu: ${otp}`,
    html: htmlContent,
  });
}
