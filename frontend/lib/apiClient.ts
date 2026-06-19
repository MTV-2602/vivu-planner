import axios from 'axios';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) return envUrl;

  if (__DEV__) {
    if (Platform.OS === 'android') return 'http://10.0.2.2:4000/api';
    return 'http://localhost:4000/api';
  }

  return 'https://vivu-planner-backend.vercel.app/api';
}

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
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
