// Simple HTML email template generator (no external SMTP needed for demo)
// In production, integrate with Resend / Nodemailer / SendGrid

export interface BookingItem {
  title: string;
  item_type: string;
  start_time?: string;
  estimated_cost?: number | null;
}

export function generateBookingConfirmationHTML(params: {
  guestName: string;
  tripTitle: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  guestCount: number;
  items: BookingItem[];
  totalCost: number;
  confirmUrl: string;
  bookingCode: string;
}): string {
  const { guestName, tripTitle, destinationCity, startDate, endDate, guestCount, items, totalCost, confirmUrl, bookingCode } = params;

  const itemRows = items.map(item => {
    const typeLabel: Record<string, string> = {
      accommodation: '🏨 Lưu trú', dining: '🍽️ Ẩm thực',
      attraction: '🏔️ Tham quan', rental: '🛵 Thuê xe', experience: '✨ Trải nghiệm',
    };
    const cost = item.estimated_cost != null && item.estimated_cost > 0
      ? `${Number(item.estimated_cost).toLocaleString('vi-VN')}đ`
      : 'Miễn phí / Liên hệ';
    return `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f0ebe0;">${typeLabel[item.item_type] || item.item_type}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0ebe0;font-weight:600;">${item.title}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0ebe0;color:#666;">${item.start_time || '—'}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0ebe0;text-align:right;color:#1F6F54;font-weight:600;">${cost}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Xác nhận đặt dịch vụ - ViVu Planner</title></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1B3A2D 0%,#1F6F54 100%);padding:32px 40px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">🗺️ ViVu Planner</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Xác nhận đặt dịch vụ trọn gói</p>
        </td></tr>
        <!-- Greeting -->
        <tr><td style="padding:32px 40px 0;">
          <h2 style="color:#1B3A2D;margin:0 0 8px;font-size:20px;">Xin chào, ${guestName}! 👋</h2>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">Chúng tôi đã nhận được yêu cầu đặt dịch vụ trọn gói cho chuyến đi <strong>${tripTitle}</strong> của bạn. Vui lòng xác nhận để hoàn tất đặt chỗ.</p>
          <!-- Trip Summary -->
          <div style="background:#f8f4ec;border-radius:12px;padding:20px;margin-bottom:24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;"><span style="color:#888;font-size:13px;">📍 Điểm đến</span><br><strong style="color:#1B3A2D;">${destinationCity}</strong></td>
                <td style="padding:4px 0;"><span style="color:#888;font-size:13px;">📅 Ngày đi</span><br><strong style="color:#1B3A2D;">${startDate}</strong></td>
                <td style="padding:4px 0;"><span style="color:#888;font-size:13px;">📅 Ngày về</span><br><strong style="color:#1B3A2D;">${endDate}</strong></td>
                <td style="padding:4px 0;"><span style="color:#888;font-size:13px;">👥 Số khách</span><br><strong style="color:#1B3A2D;">${guestCount} người</strong></td>
              </tr>
            </table>
          </div>
        </td></tr>
        <!-- Items Table -->
        <tr><td style="padding:0 40px 24px;">
          <h3 style="color:#1B3A2D;margin:0 0 12px;font-size:16px;">📋 Dịch vụ đã chọn</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0ebe0;border-radius:10px;overflow:hidden;">
            <tr style="background:#f8f4ec;">
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#888;font-weight:600;">LOẠI</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#888;font-weight:600;">TÊN DỊCH VỤ</th>
              <th style="padding:10px 16px;text-align:left;font-size:12px;color:#888;font-weight:600;">GIỜ</th>
              <th style="padding:10px 16px;text-align:right;font-size:12px;color:#888;font-weight:600;">CHI PHÍ</th>
            </tr>
            ${itemRows}
          </table>
          <div style="text-align:right;margin-top:12px;">
            <span style="color:#888;font-size:13px;">Tổng ước tính: </span>
            <strong style="color:#1F6F54;font-size:18px;">${totalCost.toLocaleString('vi-VN')}đ</strong>
          </div>
        </td></tr>
        <!-- CTA Button -->
        <tr><td style="padding:0 40px 32px;text-align:center;">
          <p style="color:#888;font-size:13px;margin:0 0 16px;">Mã đặt dịch vụ: <strong style="color:#1B3A2D;">${bookingCode}</strong></p>
          <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#1F6F54,#2a9070);color:#fff;text-decoration:none;padding:16px 48px;border-radius:50px;font-weight:800;font-size:16px;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(31,111,84,0.3);">
            ✅ Xác nhận đặt trọn gói ngay
          </a>
          <p style="color:#bbb;font-size:12px;margin:16px 0 0;">Liên kết có hiệu lực trong 24 giờ</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8f4ec;padding:20px 40px;text-align:center;border-top:1px solid #f0ebe0;">
          <p style="color:#aaa;font-size:12px;margin:0;">© 2026 ViVu Planner · Trợ lý lập kế hoạch du lịch AI hàng đầu Việt Nam</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
