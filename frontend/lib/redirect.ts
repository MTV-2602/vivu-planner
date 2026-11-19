import AsyncStorage from '@react-native-async-storage/async-storage';

// Khóa lưu đường dẫn cần quay lại sau khi đăng nhập (dùng chung với join/[token].tsx)
export const REDIRECT_STORAGE_KEY = 'redirect_after_login';

/**
 * Chỉ chấp nhận đường dẫn nội bộ: bắt đầu bằng '/', không phải '//' hay '/\',
 * và không trỏ về chính màn hình đăng nhập/đăng ký (tránh vòng lặp).
 */
export function sanitizeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null;
  if (/^\/(dang-nhap|dang-ky)(\/|\?|#|$)/.test(path)) return null;
  return path;
}

/**
 * Đọc đích chuyển hướng đang chờ (ưu tiên tham số ?redirect=, sau đó AsyncStorage),
 * rồi xóa khóa đã lưu để không bị dùng lại lần sau.
 */
export async function consumePendingRedirect(param?: unknown): Promise<string | null> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(REDIRECT_STORAGE_KEY);
    if (stored) await AsyncStorage.removeItem(REDIRECT_STORAGE_KEY);
  } catch {}
  return sanitizeRedirectPath(param) ?? sanitizeRedirectPath(stored);
}
