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

// Response interceptor: xử lý lỗi 401 an toàn
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url    = error?.config?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

    // Chỉ sign out khi 401 và KHÔNG phải endpoint login/register
    if (status === 401 && !isAuthEndpoint) {
      await supabase.auth.signOut();
    }

    return Promise.reject(error);
  }
);
