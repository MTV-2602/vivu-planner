import axios from 'axios';
import { supabase } from './supabaseClient';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:4000/api' 
    : '/api');

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to automatically attach Supabase JWT token
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const adminToken = localStorage.getItem('vivu_admin_token');
      if (adminToken) {
        config.headers.Authorization = `Bearer ${adminToken}`;
      } else {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        
        if (session?.access_token) {
          config.headers.Authorization = `Bearer ${session.access_token}`;
        } else {
          // Fallback for mock client state
          const localMockToken = localStorage.getItem('vivu_mock_token');
          if (localMockToken) {
            config.headers.Authorization = `Bearer ${localMockToken}`;
          }
        }
      }
    } catch (error) {
      console.warn('[ViVu API] Failed to extract token from session:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
