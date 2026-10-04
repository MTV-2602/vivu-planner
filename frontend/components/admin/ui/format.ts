/**
 * Helper định dạng hiển thị cho Admin UI Kit
 * - formatVND: Tiền tệ chuẩn Việt Nam (vd: 29.000 ₫)
 * - formatCompactVND: Tiền tệ rút gọn hiển thị trên biểu đồ / thẻ nhỏ (vd: 1,2tr, 350k, 0đ)
 * - formatDate: dd/mm/yyyy hoặc dd/mm/yyyy HH:mm
 * - formatCompactNumber: 1,2k, 15k...
 * - formatPercentChange: tính % thay đổi so với kỳ trước (+12.5%, -5.2%)
 */

export function formatVND(amount: number | null | undefined): string {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(val);
}

export function formatCompactVND(amount: number | null | undefined): string {
  const val = Number(amount) || 0;
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    const formatted = (abs / 1_000_000_000).toFixed(1).replace('.', ',').replace(',0', '');
    return `${sign}${formatted}tỷ`;
  }
  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '');
    return `${sign}${formatted}tr`;
  }
  if (abs >= 1_000) {
    const formatted = (abs / 1_000).toFixed(0);
    return `${sign}${formatted}k`;
  }
  return `${sign}${abs}đ`;
}

export function formatCompactNumber(num: number | null | undefined): string {
  const val = Number(num) || 0;
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '');
    return `${sign}${formatted}M`;
  }
  if (abs >= 1_000) {
    const formatted = (abs / 1_000).toFixed(1).replace('.', ',').replace(',0', '');
    return `${sign}${formatted}k`;
  }
  return `${sign}${abs}`;
}

export function formatDate(dateInput: string | Date | null | undefined, includeTime = false): string {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  if (!includeTime) {
    return `${day}/${month}/${year}`;
  }

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function formatPercentChange(current: number, prev: number): {
  percent: number;
  isUp: boolean;
  isNeutral: boolean;
  text: string;
} {
  const cur = Number(current) || 0;
  const pr = Number(prev) || 0;

  if (pr === 0 && cur === 0) {
    return { percent: 0, isUp: true, isNeutral: true, text: '0%' };
  }
  if (pr === 0 && cur > 0) {
    return { percent: 100, isUp: true, isNeutral: false, text: '+100%' };
  }
  if (pr === 0 && cur < 0) {
    return { percent: 100, isUp: false, isNeutral: false, text: '-100%' };
  }

  const diff = cur - pr;
  const pct = Math.round((diff / Math.abs(pr)) * 1000) / 10;
  const isUp = pct > 0;
  const isNeutral = pct === 0;
  const sign = pct > 0 ? '+' : '';
  return {
    percent: Math.abs(pct),
    isUp,
    isNeutral,
    text: `${sign}${pct}%`,
  };
}
