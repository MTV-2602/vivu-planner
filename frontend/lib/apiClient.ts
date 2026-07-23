import axios from 'axios';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';

function getApiBaseUrl(): string {
  let url = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL;
  
  if (!url) {
    if (__DEV__) {
      if (Platform.OS === 'android') return 'http://10.0.2.2:4000/api';
      return 'http://localhost:4000/api';
    }
    url = 'https://vivu-planner.onrender.com/api';
  }

  // Normalize: ensure URL ends with /api (e.g., https://vivu-planner.onrender.com -> https://vivu-planner.onrender.com/api)
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed.endsWith('/api')) {
    return `${trimmed}/api`;
  }
  return trimmed;
}

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 0, // No timeout — AI trip generation waits as long as server needs
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const adminToken = canUseLocalStorage ? localStorage.getItem('vivu_admin_token') : null;
      const mockToken = canUseLocalStorage ? localStorage.getItem('vivu_mock_token') : null;

      // Check if admin token is expired before using it
      if (adminToken) {
        const parts = adminToken.split(':');
        if (parts.length === 3) {
          const expiresAt = parseInt(parts[1]);
          if (!isNaN(expiresAt) && Date.now() > expiresAt) {
            // Token expired — clean up and redirect to login
            console.warn('[ViVu API] Admin token expired, auto-logging out...');
            localStorage.removeItem('vivu_admin_token');
            localStorage.removeItem('vivu_mock_user');
            localStorage.removeItem('vivu_mock_token');
            if (typeof window !== 'undefined') {
              window.location.href = '/dang-nhap';
            }
            return Promise.reject(new Error('Admin token expired'));
          }
        }
        config.headers.Authorization = `Bearer ${adminToken}`;
        return config;
      }

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || mockToken;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('[ViVu API] Failed to extract token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: auto-logout on 401 (expired/invalid token)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const reason = error?.response?.data?.reason;

    // Only auto-logout on 401 (unauthorized) — token expired or invalid
    if (status === 401) {
      console.warn('[ViVu API] 401 Unauthorized — auto-logging out. Reason:', reason || 'Unknown');

      // Clear all auth tokens
      if (canUseLocalStorage) {
        localStorage.removeItem('vivu_admin_token');
        localStorage.removeItem('vivu_mock_user');
        localStorage.removeItem('vivu_mock_token');
      }

      // Sign out from Supabase
      try {
        await supabase.auth.signOut();
      } catch (_) { /* ignore signout errors */ }

      // Redirect to login page
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/dang-nhap';
      }
    }

    return Promise.reject(error);
  }
);
