export const parseErrorMessage = (error: any, fallback = 'Có lỗi xảy ra'): string => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error.response?.data?.error === 'string') return error.response.data.error;
  if (typeof error.response?.data?.message === 'string') return error.response.data.message;
  if (typeof error.response?.data?.error?.message === 'string') return error.response.data.error.message;
  if (typeof error.response?.data?.details === 'string') return error.response.data.details;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.error === 'string') return error.error;
  if (error.code && error.message && typeof error.message === 'string') {
    return `${error.message} (${error.code})`;
  }
  if (error.response?.data?.code && error.response?.data?.message && typeof error.response.data.message === 'string') {
    return `${error.response.data.message} (${error.response.data.code})`;
  }
  try {
    const stringified = JSON.stringify(error);
    return stringified !== '{}' ? stringified : fallback;
  } catch {
    return fallback;
  }
};
