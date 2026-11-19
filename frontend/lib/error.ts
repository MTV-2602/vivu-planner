// Kiểm tra chuỗi trả về có phải JSON thô hoặc "[object Object]" không
function isUnreadable(s: string): boolean {
  const trimmed = s.trim();
  return (
    trimmed === '[object Object]' ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  );
}

export const parseErrorMessage = (error: any, fallback = 'Có lỗi xảy ra'): string => {
  if (!error) return fallback;
  if (typeof error === 'string') {
    return isUnreadable(error) ? fallback : error;
  }
  if (typeof error.response?.data?.error === 'string') return error.response.data.error;
  if (typeof error.response?.data?.message === 'string') return error.response.data.message;
  if (typeof error.response?.data?.error?.message === 'string') return error.response.data.error.message;
  if (typeof error.response?.data?.details === 'string') return error.response.data.details;
  if (typeof error.message === 'string' && !isUnreadable(error.message)) return error.message;
  if (typeof error.error === 'string' && !isUnreadable(error.error)) return error.error;
  if (error.code && error.message && typeof error.message === 'string' && !isUnreadable(error.message)) {
    return `${error.message} (${error.code})`;
  }
  if (error.response?.data?.code && error.response?.data?.message && typeof error.response.data.message === 'string') {
    return `${error.response.data.message} (${error.response.data.code})`;
  }
  try {
    const stringified = JSON.stringify(error);
    // Không trả về JSON thô cho người dùng
    if (stringified === '{}' || isUnreadable(stringified)) return fallback;
    return fallback;
  } catch {
    return fallback;
  }
};
