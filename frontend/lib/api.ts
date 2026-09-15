import axios from 'axios';
import { supabase } from './supabase';

/**
 * api — Axios client chuẩn.
 * - Tự động gắn Supabase access_token vào mỗi request
 * - Tự động fallback baseURL về '/api' nếu không set EXPO_PUBLIC_API_BASE_URL (chạy mượt trên Vercel Monorepo)
 * - 401 -> sign out (không redirect loop)
 */
const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL || '/api';

export const api = axios.create({
  baseURL,
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: gắn JWT token
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return config;
});

// Response interceptor: xử lý lỗi 401 an toàn bằng cách thử làm mới token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url    = error?.config?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

    // Nếu 401 và không phải login/register, thử refresh token
    if (status === 401 && !isAuthEndpoint && !error.config?._retry) {
      error.config._retry = true;
      try {
        const { data: { session } } = await supabase.auth.refreshSession();
        if (session?.access_token) {
          error.config.headers['Authorization'] = `Bearer ${session.access_token}`;
          return api(error.config);
        }
      } catch (_) {}
    }

    return Promise.reject(error);
  }
);
